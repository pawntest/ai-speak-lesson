/**
 * API surface frozen by decision D3.
 *
 *   GET  /api/scenes          → Scene[]
 *   POST /api/respond         → { npcReply, completionNote }  (no coaching here)
 *   POST /api/intent-options  → { options }                   (NEVER any improvement)
 *   POST /api/improve         → Improvement
 *   POST /api/evaluate-retry  → RetryEvaluation
 *
 * Providers live in server/providers/**. Every provider result is re-validated
 * here and replaced by the deterministic MockProvider result on any violation
 * (defense in depth vs. product-summary failure modes 1, 2 and 5) — the flow
 * never dead-ends and never 500s because of a bad AI response.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { improvementSchema, intentOptionsResultSchema, retryEvaluationSchema } from "../../shared/schemas";
import type { Scene } from "../../shared/types";
import {
  ANONYMOUS_CLIENT_ID,
  createQuotaStore,
  FREE_DAILY_IMPROVE_LIMIT,
  validateLicenseKey,
} from "../license";
import { findImprovementViolation, respondResultSchema } from "../providers/guard";
import { MockProvider } from "../providers/mock";
import { selectProvider } from "../providers/index";
import type { AiProvider } from "../providers/types";
import { loadScenes } from "../scenes";

const respondBodySchema = z.object({
  sceneId: z.string().min(1),
  utterance: z.string().min(1),
});

const improveBodySchema = respondBodySchema.extend({
  // Intent may be free text ("その他 / 自分で入力"), not only a listed option.
  intent: z.string().min(1),
});

type ParsedScene<T> = { scene: Scene; body: T } | null;

/** Parses body + resolves scene; writes the 4xx response and returns null on failure. */
function parseRequest<T extends { sceneId: string }>(
  schema: z.ZodType<T>,
  req: Request,
  res: Response,
): ParsedScene<T> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: `Invalid request body: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    });
    return null;
  }
  const scene = loadScenes().find((s) => s.id === parsed.data.sceneId);
  if (!scene) {
    res.status(404).json({ error: `Unknown scene: ${parsed.data.sceneId}` });
    return null;
  }
  return { scene, body: parsed.data };
}

/**
 * Keeps the foundation signature: callable with no arguments. An explicit
 * provider can be injected for tests; otherwise selection follows the env
 * (AI_PROVIDER / GEMINI_API_KEY, decision D6).
 */
export function createApiRouter(provider: AiProvider = selectProvider()): Router {
  const router = Router();
  // Deterministic safety net used whenever the active provider misbehaves.
  const safety = new MockProvider();
  // D8: per-process daily improve quota for free users (restart resets it — MVP).
  const quota = createQuotaStore();

  // felt_targets_for_testing_only is stripped by the allowlist in server/scenes.ts.
  router.get("/scenes", (_req, res) => {
    res.json(loadScenes());
  });

  // { sceneId, utterance } → { npcReply, completionNote }. Never coaches.
  router.post("/respond", async (req, res) => {
    const parsed = parseRequest(respondBodySchema, req, res);
    if (!parsed) return;
    const { scene, body } = parsed;
    let result: unknown;
    try {
      result = await provider.respond(scene, body.utterance);
    } catch {
      result = null;
    }
    let checked = respondResultSchema.safeParse(result);
    if (!checked.success) {
      checked = respondResultSchema.safeParse(await safety.respond(scene, body.utterance));
    }
    if (!checked.success) {
      res.status(500).json({ error: "respond failed" });
      return;
    }
    res.json({
      npcReply: checked.data.npcReply,
      completionNote: checked.data.completionNote,
    });
  });

  // { sceneId, utterance } → { options } — 3–5 neutral JA options.
  // MUST NOT contain any improvement or hint of a correct choice; the client
  // adds その他/自分で入力 itself. Response is rebuilt key-by-key so no extra
  // field can ever leak (failure mode 1).
  router.post("/intent-options", async (req, res) => {
    const parsed = parseRequest(respondBodySchema, req, res);
    if (!parsed) return;
    const { scene, body } = parsed;
    let result: unknown;
    try {
      result = await provider.getIntentOptions(scene, body.utterance);
    } catch {
      result = null;
    }
    let checked = intentOptionsResultSchema.safeParse(result);
    if (!checked.success) {
      checked = intentOptionsResultSchema.safeParse(
        await safety.getIntentOptions(scene, body.utterance),
      );
    }
    if (!checked.success) {
      res.status(500).json({ error: "intent-options failed" });
      return;
    }
    res.json({ options: checked.data.options });
  });

  // D8: { key } → { valid }. Stateless HMAC check; missing LICENSE_SECRET ⇒ invalid.
  router.post("/license/activate", (req, res) => {
    const key = (req.body as { key?: unknown } | null | undefined)?.key;
    res.json({ valid: validateLicenseKey(key) });
  });

  // { sceneId, utterance, intent } → Improvement (intent may be free text).
  // D8: free users get FREE_DAILY_IMPROVE_LIMIT improvements per UTC day,
  // keyed by x-client-id; a valid x-license-key (Pro) is unlimited.
  router.post("/improve", async (req, res) => {
    const parsed = parseRequest(improveBodySchema, req, res);
    if (!parsed) return;
    const { scene, body } = parsed;
    const isPro = validateLicenseKey(req.header("x-license-key"));
    if (!isPro) {
      const clientId = req.header("x-client-id") || ANONYMOUS_CLIENT_ID;
      if (!quota.consume(clientId)) {
        res.status(402).json({ error: "quota_exceeded", limit: FREE_DAILY_IMPROVE_LIMIT });
        return;
      }
    }
    let result: unknown;
    try {
      result = await provider.improve(scene, body.utterance, body.intent);
    } catch {
      result = null;
    }
    // Guard: schema + one-chunk/short rules + primaryDiff ⊂ improvedUtterance
    // + meaningJa ≠ reasonJa. Any violation → safe deterministic improvement.
    if (findImprovementViolation(result) !== null) {
      result = await safety.improve(scene, body.utterance, body.intent);
    }
    const checked = improvementSchema.safeParse(result);
    if (!checked.success || findImprovementViolation(checked.data) !== null) {
      res.status(500).json({ error: "improve failed" });
      return;
    }
    res.json({
      originalUtterance: checked.data.originalUtterance,
      selectedIntent: checked.data.selectedIntent,
      improvedUtterance: checked.data.improvedUtterance,
      primaryDiff: checked.data.primaryDiff,
      meaningJa: checked.data.meaningJa,
      reasonJa: checked.data.reasonJa,
    });
  });

  // { sceneId, intent, utterance } → RetryEvaluation (communicated ≠ string match).
  router.post("/evaluate-retry", async (req, res) => {
    const parsed = parseRequest(improveBodySchema, req, res);
    if (!parsed) return;
    const { scene, body } = parsed;
    let result: unknown;
    try {
      result = await provider.evaluateRetry(scene, body.intent, body.utterance);
    } catch {
      result = null;
    }
    let checked = retryEvaluationSchema.safeParse(result);
    if (!checked.success) {
      checked = retryEvaluationSchema.safeParse(
        await safety.evaluateRetry(scene, body.intent, body.utterance),
      );
    }
    if (!checked.success) {
      res.status(500).json({ error: "evaluate-retry failed" });
      return;
    }
    res.json({ communicated: checked.data.communicated, note: checked.data.note });
  });

  return router;
}
