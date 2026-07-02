/**
 * Foundation smoke test: proves the shared schemas and the CardStore boundary
 * behave per decisions D4/D5 and that `npm test` runs.
 */
import { describe, expect, it } from "vitest";
import { improvementSchema, intentOptionsResultSchema, retryEvaluationSchema } from "../shared/schemas";
import { createCardStore, type NewCardInput } from "./store/cards";

describe("shared schemas", () => {
  it("parses a valid Improvement", () => {
    const result = improvementSchema.safeParse({
      originalUtterance: "Coffee.",
      selectedIntent: "コーヒーを注文したかった",
      improvedUtterance: "I'd like a coffee.",
      primaryDiff: "I'd like a",
      meaningJa: "自分の希望を丁寧に伝える",
      reasonJa: "商品名だけでなく、注文していることを伝えるため",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed AI output (missing reasonJa)", () => {
    const result = improvementSchema.safeParse({
      originalUtterance: "Coffee.",
      selectedIntent: "x",
      improvedUtterance: "I'd like a coffee.",
      primaryDiff: "I'd like a",
      meaningJa: "y",
    });
    expect(result.success).toBe(false);
  });

  it("enforces 3–5 intent options", () => {
    expect(intentOptionsResultSchema.safeParse({ options: ["a", "b"] }).success).toBe(false);
    expect(intentOptionsResultSchema.safeParse({ options: ["a", "b", "c", "d"] }).success).toBe(true);
    expect(
      intentOptionsResultSchema.safeParse({ options: ["a", "b", "c", "d", "e", "f"] }).success,
    ).toBe(false);
  });

  it("parses a RetryEvaluation", () => {
    expect(retryEvaluationSchema.safeParse({ communicated: true, note: "ok" }).success).toBe(true);
    expect(retryEvaluationSchema.safeParse({ communicated: "yes", note: "ok" }).success).toBe(false);
  });
});

function makeInput(overrides: Partial<NewCardInput> = {}): NewCardInput {
  return {
    sceneId: "cafe-order",
    originalUtterance: "Coffee.",
    selectedIntent: "コーヒーを注文したかった",
    improvedUtterance: "I'd like a coffee.",
    primaryDiff: "I'd like a",
    meaningJa: "自分の希望を丁寧に伝える",
    reasonJa: "注文していることを伝えるため",
    ...overrides,
  };
}

function makeStubStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("CardStore", () => {
  it("D4: duplicate (sceneId, selectedIntent, improvedUtterance) does not create a second card", () => {
    const store = createCardStore(makeStubStorage());
    const first = store.saveCard(makeInput());
    const dup = store.saveCard(makeInput());
    expect(dup.id).toBe(first.id);
    expect(store.listCards()).toHaveLength(1);
  });

  it("D4/A4: same scene with a different intent creates a new card", () => {
    const store = createCardStore(makeStubStorage());
    store.saveCard(makeInput());
    store.saveCard(
      makeInput({ selectedIntent: "少し待ってほしかった", improvedUtterance: "One moment, please." }),
    );
    expect(store.listCards()).toHaveLength(2);
  });

  it("D5: mastery advances on success, regresses on failure, clamped to [0,3]", () => {
    const store = createCardStore(makeStubStorage());
    const card = store.saveCard(makeInput());
    expect(card.masteryStage).toBe(0);

    expect(store.updateMastery(card.id, false)?.masteryStage).toBe(0); // clamp low
    expect(store.updateMastery(card.id, true)?.masteryStage).toBe(1);
    expect(store.updateMastery(card.id, true)?.masteryStage).toBe(2);
    expect(store.updateMastery(card.id, true)?.masteryStage).toBe(3);
    expect(store.updateMastery(card.id, true)?.masteryStage).toBe(3); // clamp high
    expect(store.updateMastery(card.id, false)?.masteryStage).toBe(2);
  });

  it("recordReview appends history and applies the stage change", () => {
    const store = createCardStore(makeStubStorage());
    const card = store.saveCard(makeInput());
    const after = store.recordReview(card.id, true);
    expect(after?.masteryStage).toBe(1);
    expect(after?.reviewHistory).toHaveLength(1);
    expect(after?.reviewHistory[0]).toMatchObject({ success: true, stageAfter: 1 });
  });

  it("clear removes all cards", () => {
    const store = createCardStore(makeStubStorage());
    store.saveCard(makeInput());
    store.clear();
    expect(store.listCards()).toHaveLength(0);
  });
});
