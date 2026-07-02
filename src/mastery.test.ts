import { describe, expect, it } from "vitest";
import { reviewQueue, scaffoldingForStage } from "./mastery";
import type { Card } from "../shared/types";

describe("scaffoldingForStage (D5)", () => {
  it("fades scaffolding by stage: all → JA collapsed → EN+scene → scene only", () => {
    expect(scaffoldingForStage(0, false)).toMatchObject({
      showEnglish: true,
      showJapanese: true,
      promptSpontaneous: false,
    });
    expect(scaffoldingForStage(1, false)).toMatchObject({
      showEnglish: true,
      showJapanese: false,
      canReveal: true,
    });
    expect(scaffoldingForStage(2, false)).toMatchObject({
      showEnglish: true,
      showJapanese: false,
    });
    expect(scaffoldingForStage(3, false)).toMatchObject({
      showEnglish: false,
      showJapanese: false,
      promptSpontaneous: true,
    });
  });

  it("temporary reveal shows the hidden layers without being a stage change (A9)", () => {
    const revealed = scaffoldingForStage(1, true);
    expect(revealed.showJapanese).toBe(true);
    expect(revealed.showEnglish).toBe(true);
    // stage 3 reveal also brings back English for a full peek
    expect(scaffoldingForStage(3, true).showEnglish).toBe(true);
    // reveal is meaningless at stage 0 (everything already visible)
    expect(scaffoldingForStage(0, true)).toEqual(scaffoldingForStage(0, false));
  });
});

describe("reviewQueue (D7)", () => {
  const card = (id: string, stage: 0 | 1 | 2 | 3, createdAt: string): Card => ({
    id,
    sceneId: "cafe-order",
    originalUtterance: "Coffee.",
    selectedIntent: "注文したかった",
    improvedUtterance: "I'd like a coffee.",
    primaryDiff: "I'd like a",
    meaningJa: "希望を伝える",
    reasonJa: "注文の場面だから",
    masteryStage: stage,
    reviewHistory: [],
    createdAt,
  });

  it("surfaces the least-mastered cards first, older ones breaking ties", () => {
    const queue = reviewQueue([
      card("newest-easy", 3, "2026-07-02T00:00:00Z"),
      card("old-hard", 0, "2026-06-01T00:00:00Z"),
      card("new-hard", 0, "2026-07-01T00:00:00Z"),
      card("mid", 1, "2026-06-15T00:00:00Z"),
    ]);
    expect(queue.map((c) => c.id)).toEqual(["old-hard", "new-hard", "mid", "newest-easy"]);
  });
});
