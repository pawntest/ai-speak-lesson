/**
 * CardStore — localStorage-backed persistence boundary for context-difference
 * cards (decisions D1/D4/D5, acceptance A4/A10).
 *
 * - Duplicate guard (D4): saveCard is a no-op returning the existing card when
 *   (sceneId, selectedIntent, improvedUtterance) already exists. Same scene with
 *   a different intent always creates a new card.
 * - Mastery (D5): stages 0–3; review success advances one stage, failure
 *   regresses one, clamped to [0, 3]. Temporary JA reveal must NOT call these.
 * - Non-browser environments (tests, SSR) fall back to in-memory storage.
 */
import type { Card, MasteryStage, ReviewEntry } from "../../shared/types";

const STORAGE_KEY = "ai-speak-lesson.cards.v1";

/** Fields the caller provides; id/masteryStage/reviewHistory/createdAt are set by the store. */
export type NewCardInput = Omit<Card, "id" | "masteryStage" | "reviewHistory" | "createdAt">;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function defaultStorage(): StorageLike {
  if (typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined") {
    return globalThis.localStorage;
  }
  return createMemoryStorage();
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampStage(n: number): MasteryStage {
  return Math.min(3, Math.max(0, n)) as MasteryStage;
}

export interface CardStore {
  listCards(): Card[];
  /** D4 duplicate guard; returns the existing card unchanged if one matches. */
  saveCard(input: NewCardInput): Card;
  /** D5 stage advance/regress only (no history entry). Returns updated card or null if not found. */
  updateMastery(cardId: string, success: boolean): Card | null;
  /** Appends a ReviewEntry AND applies the D5 stage change. Returns updated card or null if not found. */
  recordReview(cardId: string, success: boolean): Card | null;
  clear(): void;
}

export function createCardStore(storage: StorageLike = defaultStorage()): CardStore {
  function read(): Card[] {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Card[]) : [];
    } catch {
      return [];
    }
  }

  function write(cards: Card[]): void {
    storage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }

  return {
    listCards() {
      return read();
    },

    saveCard(input) {
      const cards = read();
      const existing = cards.find(
        (c) =>
          c.sceneId === input.sceneId &&
          c.selectedIntent === input.selectedIntent &&
          c.improvedUtterance === input.improvedUtterance,
      );
      if (existing) return existing;

      const card: Card = {
        ...input,
        id: generateId(),
        masteryStage: 0,
        reviewHistory: [],
        createdAt: new Date().toISOString(),
      };
      write([...cards, card]);
      return card;
    },

    updateMastery(cardId, success) {
      const cards = read();
      const idx = cards.findIndex((c) => c.id === cardId);
      if (idx === -1) return null;
      const card = cards[idx];
      const updated: Card = {
        ...card,
        masteryStage: clampStage(card.masteryStage + (success ? 1 : -1)),
      };
      cards[idx] = updated;
      write(cards);
      return updated;
    },

    recordReview(cardId, success) {
      const cards = read();
      const idx = cards.findIndex((c) => c.id === cardId);
      if (idx === -1) return null;
      const card = cards[idx];
      const stageAfter = clampStage(card.masteryStage + (success ? 1 : -1));
      const entry: ReviewEntry = {
        reviewedAt: new Date().toISOString(),
        success,
        stageAfter,
      };
      const updated: Card = {
        ...card,
        masteryStage: stageAfter,
        reviewHistory: [...card.reviewHistory, entry],
      };
      cards[idx] = updated;
      write(cards);
      return updated;
    },

    clear() {
      storage.removeItem(STORAGE_KEY);
    },
  };
}

/** App-wide default store (browser localStorage; in-memory outside the browser). */
export const cardStore: CardStore = createCardStore();
