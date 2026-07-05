/**
 * Pure mastery-stage scaffolding rules (decision D5, acceptance A9).
 *
 * 0: everything shown (JA scaffolding visible)
 * 1: English shown; Japanese collapsed behind a 「日本語を表示」 toggle
 * 2: English + scene only
 * 3: scene only → prompt spontaneous speech
 *
 * The temporary reveal shows the hidden layers but NEVER touches the store —
 * stage changes happen only through cardStore.recordReview.
 */
import type { Card, MasteryStage } from "../shared/types";

export interface CardScaffolding {
  /** Show the English lines (original / improved with highlighted chunk). */
  showEnglish: boolean;
  /** Show the JA scaffolding (selected intent, 意味, ニュアンス). */
  showJapanese: boolean;
  /** Offer the 「日本語を表示」 temporary-reveal toggle. */
  canReveal: boolean;
  /** Stage 3: scene only — invite the learner to speak spontaneously. */
  promptSpontaneous: boolean;
}

export function scaffoldingForStage(stage: MasteryStage, revealed: boolean): CardScaffolding {
  const base: CardScaffolding = {
    showEnglish: stage <= 2,
    showJapanese: stage === 0,
    canReveal: stage >= 1,
    promptSpontaneous: stage === 3,
  };
  if (revealed && base.canReveal) {
    // Temporary reveal: show everything; the stage itself is untouched.
    return { ...base, showEnglish: true, showJapanese: true };
  }
  return base;
}

/** D11: simple English + icon chrome (JA text is never chrome, only assist). */
export const STAGE_LABELS: Record<MasteryStage, string> = {
  0: "🇯🇵 With Japanese",
  1: "🇯🇵 Collapsed",
  2: "🔤 English only",
  3: "🎬 Scene only",
};

/**
 * Review queue for the Today screen (D7): lowest mastery stage first,
 * older cards before newer ones within the same stage.
 */
export function reviewQueue(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.masteryStage !== b.masteryStage) return a.masteryStage - b.masteryStage;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * D11 global JA-assist fade: average masteryStage of all saved cards.
 * No cards yet → 0 (fresh learners keep JA assist on by default).
 */
export function averageMasteryStage(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const total = cards.reduce((sum, c) => sum + c.masteryStage, 0);
  return total / cards.length;
}
