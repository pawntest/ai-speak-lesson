/**
 * Unit tests for the deterministic MockProvider internals and the guard.
 */
import { describe, expect, it } from "vitest";
import type { Scene } from "../../shared/types";
import { findImprovementViolation } from "./guard";
import { MockProvider, normalizeUtterance, ruleBasedImprovement } from "./mock";

const cafe: Scene = {
  id: "cafe-order",
  title: "カフェで注文する",
  level: "beginner",
  location: "cafe counter",
  visualCues: [],
  ambientCues: [],
  npcOpening: "What can I get for you?",
};

const noOpening: Scene = { ...cafe, id: "missing-order", npcOpening: null };

describe("normalizeUtterance", () => {
  it("is case/punctuation-insensitive but keeps apostrophes", () => {
    expect(normalizeUtterance("  Coffee!! ")).toBe("coffee");
    expect(normalizeUtterance("I'd LIKE a coffee.")).toBe("i'd like a coffee");
  });
});

describe("rule-based fallback improvement", () => {
  const intents = [
    "相手に気付いてほしかった",
    "もう一度言ってほしかった",
    "内容を確認したかった",
    "少し時間がほしかった",
    "おすすめを聞きたかった",
    "何か別のことを伝えたかった",
    "please could you help me somehow", // free EN text
  ];

  it("always satisfies every improvement rule (one chunk, short, diff⊂improved, meaning≠reason)", () => {
    for (const intent of intents) {
      for (const utterance of ["Coffee.", "Order?", "This is quite a long utterance with many many extra words in it"]) {
        const imp = ruleBasedImprovement(cafe, utterance, intent);
        expect(findImprovementViolation(imp), `${intent} / ${utterance}`).toBeNull();
        expect(imp.originalUtterance).toBe(utterance);
        expect(imp.selectedIntent).toBe(intent);
      }
    }
  });

  it("preserves the learner's words in the default politeness frame", () => {
    const imp = ruleBasedImprovement(cafe, "Green tea", "自分の希望を言いたかった");
    expect(imp.improvedUtterance).toBe("I'd like green tea.");
    expect(imp.primaryDiff).toBe("I'd like");
  });

  it("attention intents get an attention chunk, not a politeness rewrite", () => {
    const imp = ruleBasedImprovement(noOpening, "My food", "店員に気付いてほしかった");
    expect(imp.improvedUtterance.startsWith("Excuse me")).toBe(true);
    expect(imp.primaryDiff).toBe("Excuse me");
  });

  it("is deterministic", () => {
    const a = ruleBasedImprovement(cafe, "Water", "頼みたかった");
    const b = ruleBasedImprovement(cafe, "Water", "頼みたかった");
    expect(a).toEqual(b);
  });
});

describe("MockProvider intent options", () => {
  it("fallback options are 3–5 neutral JA strings derived from scene context", async () => {
    const provider = new MockProvider();
    const withOpening = await provider.getIntentOptions(cafe, "unseen thing");
    const withoutOpening = await provider.getIntentOptions(noOpening, "unseen thing");
    for (const result of [withOpening, withoutOpening]) {
      expect(result.options.length).toBeGreaterThanOrEqual(3);
      expect(result.options.length).toBeLessThanOrEqual(5);
    }
    // Scene context changes the set (npcOpening present vs absent).
    expect(withOpening.options).not.toEqual(withoutOpening.options);
  });
});

describe("guard", () => {
  it("flags long, multi-sentence, non-substring-diff and meaning==reason outputs", () => {
    const base = {
      originalUtterance: "Coffee.",
      selectedIntent: "x",
      improvedUtterance: "I'd like a coffee.",
      primaryDiff: "I'd like a",
      meaningJa: "意味",
      reasonJa: "理由",
    };
    expect(findImprovementViolation(base)).toBeNull();
    expect(
      findImprovementViolation({
        ...base,
        improvedUtterance:
          "One two three four five six seven eight nine ten eleven twelve thirteen",
        primaryDiff: "One",
      }),
    ).toContain("too long");
    expect(
      findImprovementViolation({
        ...base,
        improvedUtterance: "Excuse me. I'd like a coffee.",
        primaryDiff: "Excuse me",
      }),
    ).toContain("multi-sentence");
    expect(findImprovementViolation({ ...base, primaryDiff: "Could you" })).toContain("substring");
    expect(findImprovementViolation({ ...base, reasonJa: "意味" })).toContain("distinct");
    expect(findImprovementViolation({ nonsense: true })).toContain("schema");
    expect(findImprovementViolation(null)).toContain("schema");
  });
});
