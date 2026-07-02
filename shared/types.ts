/**
 * Shared domain types — the contract between server/ and src/.
 * See docs/working/product-summary.md "Shared data contracts" and decisions D1–D5.
 * Do not change shapes without coordinating both implementers.
 */

export interface Scene {
  id: string;
  title: string;
  level: string;
  location: string;
  visualCues: string[];
  ambientCues: string[];
  npcOpening: string | null;
}

export interface IntentOptionsResult {
  /** 3–5 neutral Japanese options; no ranking, no "correct" marker. Free text is implicit in the UI. */
  options: string[];
}

export interface Improvement {
  originalUtterance: string;
  selectedIntent: string;
  improvedUtterance: string;
  /** Exactly one primary semantic chunk (substring of improvedUtterance). */
  primaryDiff: string;
  /** What the chunk means (JA). Distinct from reasonJa. */
  meaningJa: string;
  /** Why it fits this scene (JA). Distinct from meaningJa. */
  reasonJa: string;
}

/** D5: 0 JA shown; 1 JA collapsed; 2 EN + scene only; 3 scene only. */
export type MasteryStage = 0 | 1 | 2 | 3;

export interface ReviewEntry {
  reviewedAt: string; // ISO timestamp
  success: boolean;
  stageAfter: MasteryStage;
}

export interface Card {
  id: string;
  sceneId: string;
  originalUtterance: string;
  selectedIntent: string;
  improvedUtterance: string;
  primaryDiff: string;
  meaningJa: string;
  reasonJa: string;
  masteryStage: MasteryStage;
  reviewHistory: ReviewEntry[];
  createdAt: string; // ISO timestamp
}

export interface RetryEvaluation {
  /** Success = the intention was communicated, not a string match. */
  communicated: boolean;
  note: string;
}

export interface RespondResult {
  npcReply: string | null;
  completionNote: string | null;
}

/* ----------------------------------------------------------------------------
 * Provider interfaces (replaceable; mock is default). Server-side only.
 * ------------------------------------------------------------------------- */

export interface IntentOptionProvider {
  /** Returns 3–5 neutral JA options. MUST NOT include or imply any improvement. */
  getIntentOptions(scene: Scene, utterance: string): Promise<IntentOptionsResult>;
}

export interface CoachProvider {
  /** Returns one one-chunk-better expression for the chosen intent. */
  improve(scene: Scene, utterance: string, intent: string): Promise<Improvement>;
}

export interface RetryEvaluator {
  /** Judges whether the retry communicated the intent (not string match). */
  evaluateRetry(scene: Scene, intent: string, utterance: string): Promise<RetryEvaluation>;
}
