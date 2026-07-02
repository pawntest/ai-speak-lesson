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

export const STAGE_LABELS: Record<MasteryStage, string> = {
  0: "日本語つき",
  1: "日本語をたたむ",
  2: "英語だけ",
  3: "場面だけ",
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
