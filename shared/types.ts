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

/**
 * One candidate intention (D11: EN-first, JA is tap-reveal assist).
 * textEn NAMES the intention in ≤6 simple A1 words — it is never a rewrite
 * or correction of the learner's utterance.
 */
export interface IntentOption {
  textEn: string;
  textJa: string;
  /** One emoji that pictures the intention (meaning without translation). */
  icon: string;
}

export interface IntentOptionsResult {
  /** 3–5 neutral options; no ranking, no "correct" marker. Free text is implicit in the UI. */
  options: IntentOption[];
}

export interface Improvement {
  originalUtterance: string;
  selectedIntent: string;
  improvedUtterance: string;
  /** Exactly one primary semantic chunk (substring of improvedUtterance). */
  primaryDiff: string;
  /** What the chunk means — simple A1 English (D11 primary explanation). */
  meaningEn: string;
  /** Why it fits this scene — simple A1 English (D11 primary explanation). */
  reasonEn: string;
  /** What the chunk means (JA assist, tap-reveal). Distinct from reasonJa. */
  meaningJa: string;
  /** Why it fits this scene (JA assist, tap-reveal). Distinct from meaningJa. */
  reasonJa: string;
}

/** One line of the ongoing scene conversation (D12 multi-turn). */
export interface ConversationTurn {
  speaker: "learner" | "npc";
  text: string;
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
  /** Simple-English explanations (D11 primary); may be empty on legacy cards. */
  meaningEn?: string;
  reasonEn?: string;
  meaningJa: string;
  reasonJa: string;
  /** D12: "rescue" = saved from the stuck-help overlay (困った単語リスト). */
  via?: "diff" | "rescue";
  /** The moment it was needed (e.g. the NPC line the learner was stuck on). */
  contextNote?: string;
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
  /**
   * True when the utterance already communicates well in this scene —
   * the UI then celebrates instead of forcing intention selection.
   * Judges communicative adequacy only; never decides the user's intention.
   */
  adequate: boolean;
  /** Warm note shown when adequate (null otherwise). */
  adequacyNote: string | null;
  /** D12: true when this exchange has naturally concluded (scene goal reached). */
  done: boolean;
}

/* ----------------------------------------------------------------------------
 * Provider interfaces (replaceable; mock is default). Server-side only.
 * ------------------------------------------------------------------------- */

export interface IntentOptionProvider {
  /**
   * Returns 3–5 neutral options conditioned on the utterance and (when
   * provided) the conversation so far. MUST NOT include or imply any improvement.
   */
  getIntentOptions(scene: Scene, utterance: string, turns?: ConversationTurn[]): Promise<IntentOptionsResult>;
}

export interface CoachProvider {
  /** Returns one one-chunk-better expression for the chosen intent. */
  improve(scene: Scene, utterance: string, intent: string): Promise<Improvement>;
}

export interface RetryEvaluator {
  /** Judges whether the retry communicated the intent (not string match). */
  evaluateRetry(scene: Scene, intent: string, utterance: string): Promise<RetryEvaluation>;
}
