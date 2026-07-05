/**
 * Unit tests for the deterministic MockProvider internals and the guard.
 */
import { describe, expect, it } from "vitest";
import { intentOptionSchema } from "../../shared/schemas";
import type { ConversationTurn, Scene } from "../../shared/types";
import { findImprovementViolation } from "./guard";
import { MOCK_CLOSING_LINE, MockProvider, normalizeUtterance, ruleBasedImprovement } from "./mock";

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

  it("always satisfies every improvement rule (one chunk, short, diff⊂improved, meanings≠reasons)", () => {
    for (const intent of intents) {
      for (const utterance of ["Coffee.", "Order?", "This is quite a long utterance with many many extra words in it"]) {
        const imp = ruleBasedImprovement(cafe, utterance, intent);
        expect(findImprovementViolation(imp), `${intent} / ${utterance}`).toBeNull();
        expect(imp.originalUtterance).toBe(utterance);
        expect(imp.selectedIntent).toBe(intent);
      }
    }
  });

  it("D11: every branch pairs distinct simple-English meaning/reason with the JA texts", () => {
    for (const intent of intents) {
      const imp = ruleBasedImprovement(cafe, "Coffee.", intent);
      expect(imp.meaningEn.trim().length).toBeGreaterThan(0);
      expect(imp.reasonEn.trim().length).toBeGreaterThan(0);
      expect(imp.meaningEn.trim()).not.toBe(imp.reasonEn.trim());
      expect(imp.meaningJa.trim()).not.toBe(imp.reasonJa.trim());
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

describe("MockProvider intent options (D11 object shape)", () => {
  const provider = new MockProvider();

  it("fixture options are valid IntentOption objects {textEn, textJa, icon}", async () => {
    const result = await provider.getIntentOptions(cafe, "Coffee.");
    expect(result.options.length).toBeGreaterThanOrEqual(3);
    expect(result.options.length).toBeLessThanOrEqual(5);
    for (const option of result.options) {
      expect(intentOptionSchema.safeParse(option).success).toBe(true);
      // textEn names the intention in <= 6 simple words.
      expect(option.textEn.trim().split(/\s+/).length).toBeLessThanOrEqual(6);
    }
    expect(result.options.map((o) => o.textJa)).toContain("コーヒーを注文したかった");
  });

  it("fallback options are 3–5 valid IntentOption objects derived from scene context", async () => {
    const withOpening = await provider.getIntentOptions(cafe, "unseen thing");
    const withoutOpening = await provider.getIntentOptions(noOpening, "unseen thing");
    for (const result of [withOpening, withoutOpening]) {
      expect(result.options.length).toBeGreaterThanOrEqual(3);
      expect(result.options.length).toBeLessThanOrEqual(5);
      for (const option of result.options) {
        expect(intentOptionSchema.safeParse(option).success).toBe(true);
      }
    }
    // Scene context changes the set (npcOpening present vs absent).
    expect(withOpening.options).not.toEqual(withoutOpening.options);
  });
});

describe("MockProvider utterance-aware options (発話対応)", () => {
  const provider = new MockProvider();

  it("different utterances yield correspondingly different option sets", async () => {
    const drink = await provider.getIntentOptions(cafe, "Tea now");
    const direction = await provider.getIntentOptions(cafe, "Station way go");
    expect(drink.options.map((o) => o.textJa)).toContain("それを注文したかった");
    expect(drink.options.map((o) => o.textEn)).toContain("I wanted to order it");
    expect(direction.options.map((o) => o.textJa)).toContain("行き方・場所を知りたかった");
    expect(drink.options).not.toEqual(direction.options);
  });

  it("question-shaped utterances surface a confirming intent", async () => {
    const result = await provider.getIntentOptions(cafe, "Big size?");
    expect(result.options.map((o) => o.textJa)).toContain("質問をして確かめたかった");
  });

  it("D12: a question from the NPC in the last turn adds a comprehension-cue option", async () => {
    const turns: ConversationTurn[] = [
      { speaker: "learner", text: "Coffee." },
      { speaker: "npc", text: "What size would you like?" },
    ];
    const result = await provider.getIntentOptions(cafe, "unseen mumble words", turns);
    const cue = result.options.find((o) => o.textEn === "I didn't understand you");
    expect(cue).toBeDefined();
    expect(cue?.icon).toBe("🤔");

    // Without turns the cue is absent for the same utterance.
    const withoutTurns = await provider.getIntentOptions(cafe, "unseen mumble words");
    expect(withoutTurns.options.map((o) => o.textEn)).not.toContain("I didn't understand you");
  });
});

describe("MockProvider scripted multi-turn respond (D12)", () => {
  const provider = new MockProvider();

  it("replays follow_up_turns keyed by learner-turn count and ends with done", async () => {
    const first = await provider.respond(cafe, "Coffee.");
    expect(first.npcReply).toBe("What size would you like?");
    expect(first.done).toBe(false);

    const afterFirst: ConversationTurn[] = [
      { speaker: "learner", text: "Coffee." },
      { speaker: "npc", text: first.npcReply as string },
    ];
    const second = await provider.respond(cafe, "Small.", afterFirst);
    expect(second.npcReply).toBe("That's 3.50. Cash or card?");
    expect(second.done).toBe(false);

    const afterSecond: ConversationTurn[] = [
      ...afterFirst,
      { speaker: "learner", text: "Small." },
      { speaker: "npc", text: second.npcReply as string },
    ];
    const third = await provider.respond(cafe, "Card.", afterSecond);
    expect(third.npcReply).toBe(MOCK_CLOSING_LINE);
    expect(third.done).toBe(true);
  });

  it("is deterministic: same turns twice give the identical result", async () => {
    const turns: ConversationTurn[] = [
      { speaker: "learner", text: "Coffee." },
      { speaker: "npc", text: "What size would you like?" },
    ];
    const a = await provider.respond(cafe, "Small.", turns);
    const b = await provider.respond(cafe, "Small.", turns);
    expect(a).toEqual(b);
  });

  it("an adequate utterance sets done even while the script continues", async () => {
    const result = await provider.respond(cafe, "I'd like a coffee.");
    expect(result.adequate).toBe(true);
    expect(result.done).toBe(true);
  });
});

describe("MockProvider first-utterance adequacy (D9)", () => {
  const provider = new MockProvider();

  it("an already-adequate utterance is celebrated, never completed", async () => {
    const result = await provider.respond(cafe, "I'd like a coffee.");
    expect(result.adequate).toBe(true);
    expect(result.adequacyNote).toBeTruthy();
    expect(result.completionNote).toBeNull();
  });

  it("a fragmentary utterance is not adequate and gets a completion note", async () => {
    const result = await provider.respond(cafe, "Coffee.");
    expect(result.adequate).toBe(false);
    expect(result.adequacyNote).toBeNull();
    expect(result.completionNote).not.toBeNull();
  });

  it("a bare frame without content is not adequate (unless it is the scene's fixture answer)", async () => {
    // In cafe-order, "Excuse me." matches no fixture improvement and carries no content.
    const inCafe = await provider.respond(cafe, "Excuse me.");
    expect(inCafe.adequate).toBe(false);
    // In missing-order, "Excuse me." IS a fixture improvement — adequate there.
    const inMissingOrder = await provider.respond(noOpening, "Excuse me.");
    expect(inMissingOrder.adequate).toBe(true);
  });
});

describe("guard", () => {
  const base = {
    originalUtterance: "Coffee.",
    selectedIntent: "x",
    improvedUtterance: "I'd like a coffee.",
    primaryDiff: "I'd like a",
    meaningEn: "This means 'I want', said politely.",
    reasonEn: "It shows you are ordering, not just naming.",
    meaningJa: "意味",
    reasonJa: "理由",
  };

  it("flags long, multi-sentence, non-substring-diff and meaning==reason outputs", () => {
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

  it("D11: flags meaningEn == reasonEn (trimmed) as a violation", () => {
    expect(findImprovementViolation({ ...base, reasonEn: ` ${base.meaningEn} ` })).toContain(
      "meaningEn and reasonEn",
    );
    // Missing En fields are a schema violation now.
    const withoutEn: Record<string, unknown> = { ...base };
    delete withoutEn.meaningEn;
    delete withoutEn.reasonEn;
    expect(findImprovementViolation(withoutEn)).toContain("schema");
  });
});
