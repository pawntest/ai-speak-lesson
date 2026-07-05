/**
 * GeminiProvider parsing/fallback tests with a stubbed fetch.
 * The real Generative Language API is NEVER called in tests.
 */
import { describe, expect, it } from "vitest";
import { intentOptionSchema } from "../../shared/schemas";
import type { ConversationTurn, Scene } from "../../shared/types";
import { GeminiProvider, GEMINI_MODEL } from "./gemini";
import { findImprovementViolation, MAX_IMPROVED_WORDS } from "./guard";
import { MockProvider } from "./mock";
import { selectProvider } from "./index";

const scene: Scene = {
  id: "cafe-order",
  title: "カフェで注文する",
  level: "beginner",
  location: "cafe counter",
  visualCues: ["menu with coffee visible"],
  ambientCues: ["soft cafe noise"],
  npcOpening: "What can I get for you?",
};

const VALID_OPTIONS = [
  { textEn: "I wanted to order", textJa: "注文したかった", icon: "☕" },
  { textEn: "I wanted them to wait", textJa: "待ってほしかった", icon: "⏳" },
  { textEn: "I wanted to ask", textJa: "質問したかった", icon: "❓" },
];

/** Builds a fetch stub returning a Gemini-shaped envelope around `text`. */
function stubFetch(text: string, status = 200): { fetchFn: typeof fetch; calls: any[] } {
  const calls: any[] = [];
  const fetchFn = (async (url: any, init?: any) => {
    calls.push({ url: String(url), init });
    const payload = { candidates: [{ content: { parts: [{ text }] } }] };
    return new Response(JSON.stringify(payload), { status });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function makeProvider(fetchFn: typeof fetch): GeminiProvider {
  return new GeminiProvider({ apiKey: "test-key", fetchFn, fallback: new MockProvider() });
}

describe("GeminiProvider", () => {
  it("sends a structured-output request to the flash model, key in header only", async () => {
    const valid = JSON.stringify({ options: VALID_OPTIONS });
    const { fetchFn, calls } = stubFetch(valid);
    await makeProvider(fetchFn).getIntentOptions(scene, "Coffee.");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`/models/${GEMINI_MODEL}:generateContent`);
    expect(calls[0].url).not.toContain("test-key"); // never in the URL
    expect(calls[0].init.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(calls[0].init.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    // D13: responseSchema demands {textEn, textJa, icon} option objects.
    const items = body.generationConfig.responseSchema.properties.options.items;
    expect(Object.keys(items.properties).sort()).toEqual(["icon", "textEn", "textJa"]);
  });

  it("passes through valid D11 intent-option objects", async () => {
    const { fetchFn } = stubFetch(JSON.stringify({ options: VALID_OPTIONS }));
    const result = await makeProvider(fetchFn).getIntentOptions(scene, "Coffee.");
    expect(result).toEqual({ options: VALID_OPTIONS });
  });

  it("D12/D13: conversation history reaches the options and respond prompts", async () => {
    const turns: ConversationTurn[] = [
      { speaker: "learner", text: "Coffee." },
      { speaker: "npc", text: "What size would you like?" },
    ];
    const { fetchFn, calls } = stubFetch(JSON.stringify({ options: VALID_OPTIONS }));
    await makeProvider(fetchFn).getIntentOptions(scene, "Big?", turns);
    const optionsPrompt = JSON.parse(calls[0].init.body).contents[0].parts[0].text;
    expect(optionsPrompt).toContain("learner: Coffee.");
    expect(optionsPrompt).toContain("npc: What size would you like?");
    expect(optionsPrompt).toContain('The learner just said: "Big?"');

    const respondStub = stubFetch(
      JSON.stringify({ npcReply: "Sure!", adequate: false, done: false }),
    );
    await makeProvider(respondStub.fetchFn).respond(scene, "Small.", turns);
    const respondPrompt = JSON.parse(respondStub.calls[0].init.body).contents[0].parts[0].text;
    expect(respondPrompt).toContain("learner: Coffee.");
    expect(respondPrompt).toContain("Set done=true ONLY when this exchange has naturally concluded");
  });

  it("malformed AI JSON → falls back to the deterministic mock result", async () => {
    const { fetchFn } = stubFetch("this is definitely {{ not json");
    const provider = makeProvider(fetchFn);
    const mock = new MockProvider();

    expect(await provider.getIntentOptions(scene, "Coffee.")).toEqual(
      await mock.getIntentOptions(scene, "Coffee."),
    );
    expect(await provider.improve(scene, "Coffee.", "コーヒーを注文したかった")).toEqual(
      await mock.improve(scene, "Coffee.", "コーヒーを注文したかった"),
    );
    expect(await provider.respond(scene, "Coffee.")).toEqual(await mock.respond(scene, "Coffee."));
    expect(await provider.evaluateRetry(scene, "x", "I'd like a coffee.")).toEqual(
      await mock.evaluateRetry(scene, "x", "I'd like a coffee."),
    );
  });

  it("schema-valid but rule-violating options (too few / legacy strings) → fallback objects", async () => {
    for (const bad of [
      JSON.stringify({ options: VALID_OPTIONS.slice(0, 1) }), // < 3 options
      JSON.stringify({ options: ["甲", "乙", "丙"] }), // legacy string shape
    ]) {
      const { fetchFn } = stubFetch(bad);
      const result = await makeProvider(fetchFn).getIntentOptions(scene, "Coffee.");
      expect(result.options.length).toBeGreaterThanOrEqual(3);
      for (const option of result.options) {
        expect(intentOptionSchema.safeParse(option).success).toBe(true);
      }
    }
  });

  it("respond result parses the new done field", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({ npcReply: "Here you go!", adequate: false, done: true }),
    );
    const result = await makeProvider(fetchFn).respond(scene, "Card.");
    expect(result.npcReply).toBe("Here you go!");
    expect(result.done).toBe(true);
    expect(result.completionNote).toBeNull();
  });

  it("respond without done (old shape) → schema failure → mock fallback", async () => {
    const { fetchFn } = stubFetch(JSON.stringify({ npcReply: "Hi", adequate: false }));
    const result = await makeProvider(fetchFn).respond(scene, "Coffee.");
    expect(result).toEqual(await new MockProvider().respond(scene, "Coffee."));
  });

  it("unnecessarily long improvement (>12 words, multi-sentence) → short fallback", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({
        improvedUtterance:
          "Excuse me, I would be ever so grateful if I could possibly order one cup of coffee. Thanks a lot.",
        primaryDiff: "Excuse me",
        meaningEn: "A polite phrase.",
        reasonEn: "It is polite here.",
        meaningJa: "丁寧な言い方",
        reasonJa: "丁寧だから",
      }),
    );
    const result = await makeProvider(fetchFn).improve(scene, "Coffee.", "コーヒーを注文したかった");
    expect(result.improvedUtterance.trim().split(/\s+/).length).toBeLessThanOrEqual(
      MAX_IMPROVED_WORDS,
    );
    expect(findImprovementViolation(result)).toBeNull();
    expect(result.improvedUtterance).toBe("I'd like a coffee."); // fixture fallback
  });

  it("primaryDiff not a substring / meaning==reason (Ja or En) → fallback", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({
        improvedUtterance: "I'd like a coffee.",
        primaryDiff: "Could you", // not a substring
        meaningEn: "Same words.",
        reasonEn: "Same words.",
        meaningJa: "同じ文",
        reasonJa: "同じ文",
      }),
    );
    const result = await makeProvider(fetchFn).improve(scene, "Coffee.", "自由入力の意図");
    expect(findImprovementViolation(result)).toBeNull();
  });

  it("D11 guard: meaningEn == reasonEn alone triggers the deterministic fallback", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({
        improvedUtterance: "I'd like a coffee.",
        primaryDiff: "I'd like a",
        meaningEn: "It is a polite phrase.",
        reasonEn: "It is a polite phrase.",
        meaningJa: "丁寧に希望を伝える形",
        reasonJa: "注文の場面で自然だから",
      }),
    );
    const result = await makeProvider(fetchFn).improve(scene, "Coffee.", "コーヒーを注文したかった");
    expect(findImprovementViolation(result)).toBeNull();
    expect(result.meaningEn.trim()).not.toBe(result.reasonEn.trim());
    expect(result.improvedUtterance).toBe("I'd like a coffee."); // fixture fallback
  });

  it("valid improvement passes through, with original/intent forced from input", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({
        originalUtterance: "SPOOFED",
        selectedIntent: "SPOOFED",
        improvedUtterance: "I'd like a coffee, please.",
        primaryDiff: "I'd like",
        meaningEn: "This asks for something politely.",
        reasonEn: "Ordering here sounds natural this way.",
        meaningJa: "希望を丁寧に伝える形",
        reasonJa: "注文の場面で自然だから",
      }),
    );
    const result = await makeProvider(fetchFn).improve(scene, "Coffee.", "注文したかった");
    expect(result.originalUtterance).toBe("Coffee.");
    expect(result.selectedIntent).toBe("注文したかった");
    expect(result.improvedUtterance).toBe("I'd like a coffee, please.");
    expect(result.meaningEn).toBe("This asks for something politely.");
    expect(result.reasonEn).toBe("Ordering here sounds natural this way.");
  });

  it("HTTP error / network failure → fallback, never a throw", async () => {
    const { fetchFn } = stubFetch("{}", 429);
    await expect(makeProvider(fetchFn).getIntentOptions(scene, "Coffee.")).resolves.toBeDefined();

    const rejecting = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await makeProvider(rejecting).improve(scene, "Coffee.", "x");
    expect(findImprovementViolation(result)).toBeNull();
  });
});

describe("selectProvider (D6)", () => {
  it("defaults to mock; gemini only when AI_PROVIDER=gemini AND key present", () => {
    expect(selectProvider({})).toBeInstanceOf(MockProvider);
    expect(selectProvider({ AI_PROVIDER: "gemini" })).toBeInstanceOf(MockProvider);
    expect(selectProvider({ GEMINI_API_KEY: "k" })).toBeInstanceOf(MockProvider);
    expect(
      selectProvider({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k" }),
    ).toBeInstanceOf(GeminiProvider);
  });
});
