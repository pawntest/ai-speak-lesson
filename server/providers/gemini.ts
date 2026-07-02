/**
 * GeminiProvider — real AI via the Google Generative Language API (D6).
 * OFF by default; selected only when AI_PROVIDER=gemini AND GEMINI_API_KEY is
 * set (server-side only, never sent to the client).
 *
 * Plain fetch, no SDK. Structured output via responseMimeType +
 * responseSchema. EVERY response is zod-validated (plus the improvement guard
 * rules); anything malformed falls back to the deterministic MockProvider
 * result for that call — the user never sees a 500 from a bad AI response.
 */
import { intentOptionsResultSchema, retryEvaluationSchema } from "../../shared/schemas";
import type {
  Improvement,
  IntentOptionsResult,
  RespondResult,
  RetryEvaluation,
  Scene,
} from "../../shared/types";
import { findImprovementViolation, MAX_IMPROVED_WORDS, respondResultSchema } from "./guard";
import { MockProvider } from "./mock";
import type { AiProvider } from "./types";

export const GEMINI_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiProviderOptions {
  apiKey: string;
  /** Injectable for tests — never call the real API in tests. */
  fetchFn?: typeof fetch;
  /** Deterministic fallback for malformed/failed responses. */
  fallback?: AiProvider;
  model?: string;
}

/** Gemini responseSchema fragments (OpenAPI-subset format). */
const OPTIONS_SCHEMA = {
  type: "OBJECT",
  properties: {
    options: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 5 },
  },
  required: ["options"],
};

const IMPROVEMENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    improvedUtterance: { type: "STRING" },
    primaryDiff: { type: "STRING" },
    meaningJa: { type: "STRING" },
    reasonJa: { type: "STRING" },
  },
  required: ["improvedUtterance", "primaryDiff", "meaningJa", "reasonJa"],
};

const RESPOND_SCHEMA = {
  type: "OBJECT",
  properties: {
    npcReply: { type: "STRING", nullable: true },
    completionNote: { type: "STRING", nullable: true },
  },
  required: ["npcReply"],
};

const RETRY_SCHEMA = {
  type: "OBJECT",
  properties: {
    communicated: { type: "BOOLEAN" },
    note: { type: "STRING" },
  },
  required: ["communicated", "note"],
};

export class GeminiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly fallback: AiProvider;
  private readonly model: string;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
    this.fallback = options.fallback ?? new MockProvider();
    this.model = options.model ?? GEMINI_MODEL;
  }

  private sceneContext(scene: Scene): string {
    return [
      `Scene: "${scene.title}" at ${scene.location} (level: ${scene.level}).`,
      `Visual cues: ${scene.visualCues.join("; ")}.`,
      `Ambient cues: ${scene.ambientCues.join("; ")}.`,
      `NPC opening line: ${scene.npcOpening ?? "(none — the learner speaks first)"}.`,
    ].join("\n");
  }

  /** One structured-output call. Throws on any transport/parse problem. */
  private async generate(prompt: string, responseSchema: object): Promise<unknown> {
    const res = await this.fetchFn(`${API_BASE}/${this.model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") throw new Error("Gemini response had no text part");
    return JSON.parse(text) as unknown;
  }

  async getIntentOptions(scene: Scene, utterance: string): Promise<IntentOptionsResult> {
    try {
      const prompt = [
        "You help a Japanese beginner learner of English reflect on what they truly wanted to convey.",
        this.sceneContext(scene),
        `The learner said: "${utterance}"`,
        "List 3 to 5 candidate intentions the learner may have had, in natural Japanese,",
        "all neutral and at the same level of abstraction.",
        "STRICT RULES: never rank them, never mark or hint at a correct one,",
        "and never include any English rewrite, correction, or improved expression.",
      ].join("\n");
      const raw = await this.generate(prompt, OPTIONS_SCHEMA);
      const parsed = intentOptionsResultSchema.parse(raw);
      return { options: parsed.options };
    } catch {
      return this.fallback.getIntentOptions(scene, utterance);
    }
  }

  async improve(scene: Scene, utterance: string, intent: string): Promise<Improvement> {
    try {
      const prompt = [
        "You coach a Japanese beginner learner of English.",
        this.sceneContext(scene),
        `The learner said: "${utterance}"`,
        `Their true intention (may be free text): "${intent}"`,
        "Produce ONE improved English expression that adds exactly ONE semantic chunk",
        "(e.g. a politeness frame, an attention-getter, a clarification frame).",
        "Rules:",
        `- Short, natural, beginner-level: one sentence, at most ${MAX_IMPROVED_WORDS} words. Not the longest or most polite option.`,
        "- Preserve the learner's original words where reasonable.",
        "- primaryDiff must be the added chunk, copied verbatim as a substring of improvedUtterance.",
        "- meaningJa: what the chunk means (Japanese). reasonJa: why it fits THIS scene (Japanese). They must be different texts.",
      ].join("\n");
      const raw = await this.generate(prompt, IMPROVEMENT_SCHEMA);
      const candidate: Improvement = {
        ...(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}),
        originalUtterance: utterance,
        selectedIntent: intent,
      } as Improvement;
      if (findImprovementViolation(candidate) !== null) {
        return await this.fallback.improve(scene, utterance, intent);
      }
      return {
        originalUtterance: utterance,
        selectedIntent: intent,
        improvedUtterance: candidate.improvedUtterance,
        primaryDiff: candidate.primaryDiff,
        meaningJa: candidate.meaningJa,
        reasonJa: candidate.reasonJa,
      };
    } catch {
      return this.fallback.improve(scene, utterance, intent);
    }
  }

  async respond(scene: Scene, utterance: string): Promise<RespondResult> {
    try {
      const prompt = [
        "You are the NPC in this scene, replying to a beginner English learner.",
        this.sceneContext(scene),
        `The learner said: "${utterance}"`,
        "Reply in character with ONE short, natural, friendly English sentence (npcReply).",
        "You may charitably complete a fragmentary utterance from context.",
        "If you completed/guessed anything, describe briefly in Japanese what you assumed (completionNote); otherwise set completionNote to null.",
        "NEVER correct, teach, or coach the learner in the reply.",
      ].join("\n");
      const raw = await this.generate(prompt, RESPOND_SCHEMA);
      const parsed = respondResultSchema.parse(raw);
      return { npcReply: parsed.npcReply, completionNote: parsed.completionNote ?? null };
    } catch {
      return this.fallback.respond(scene, utterance);
    }
  }

  async evaluateRetry(scene: Scene, intent: string, utterance: string): Promise<RetryEvaluation> {
    try {
      const prompt = [
        "You judge a beginner English learner's retry in this scene.",
        this.sceneContext(scene),
        `Intention the learner chose: "${intent}"`,
        `Their retry utterance: "${utterance}"`,
        "Decide: would a native listener in this scene understand that intention? (communicated).",
        "This is about communication, NOT exact wording or grammar perfection.",
        "note: one short, warm, encouraging Japanese sentence. Never scold, never score.",
        "If not communicated, gently point toward the missing chunk.",
      ].join("\n");
      const raw = await this.generate(prompt, RETRY_SCHEMA);
      const parsed = retryEvaluationSchema.parse(raw);
      return { communicated: parsed.communicated, note: parsed.note };
    } catch {
      return this.fallback.evaluateRetry(scene, intent, utterance);
    }
  }
}
