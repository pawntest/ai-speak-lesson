/**
 * API surface frozen by decision D3. The AI-learning implementer replaces the
 * 501 stubs with real logic (providers in server/providers/**) but MUST keep
 * these paths and request/response shapes.
 *
 *   GET  /api/scenes          → Scene[]                       (implemented here)
 *   POST /api/respond         → { npcReply, completionNote }  (stub)
 *   POST /api/intent-options  → { options }                   (stub; NEVER any improvement)
 *   POST /api/improve         → Improvement                   (stub)
 *   POST /api/evaluate-retry  → RetryEvaluation               (stub)
 */
import { Router } from "express";
import { loadScenes } from "../scenes";

export function createApiRouter(): Router {
  const router = Router();

  // Fully implemented: scenes list. felt_targets_for_testing_only is stripped
  // by the allowlist mapping in server/scenes.ts.
  router.get("/scenes", (_req, res) => {
    res.json(loadScenes());
  });

  // { sceneId, utterance } → { npcReply: string|null, completionNote: string|null }
  router.post("/respond", (_req, res) => {
    res.status(501).json({ error: "Not implemented" });
  });

  // { sceneId, utterance } → { options: string[] }  (3–5 JA options; NEVER includes any improvement)
  router.post("/intent-options", (_req, res) => {
    res.status(501).json({ error: "Not implemented" });
  });

  // { sceneId, utterance, intent } → Improvement
  router.post("/improve", (_req, res) => {
    res.status(501).json({ error: "Not implemented" });
  });

  // { sceneId, intent, utterance } → RetryEvaluation
  router.post("/evaluate-retry", (_req, res) => {
    res.status(501).json({ error: "Not implemented" });
  });

  return router;
}
