/**
 * GeminiProvider parsing/fallback tests with a stubbed fetch.
 * The real Generative Language API is NEVER called in tests.
 */
import { describe, expect, it } from "vitest";
import type { Scene } from "../../shared/types";
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
    const valid = JSON.stringify({ options: ["甲", "乙", "丙"] });
    const { fetchFn, calls } = stubFetch(valid);
    await makeProvider(fetchFn).getIntentOptions(scene, "Coffee.");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`/models/${GEMINI_MODEL}:generateContent`);
    expect(calls[0].url).not.toContain("test-key"); // never in the URL
    expect(calls[0].init.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(calls[0].init.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toBeDefined();
  });

  it("passes through valid intent options", async () => {
    const { fetchFn } = stubFetch(JSON.stringify({ options: ["甲", "乙", "丙", "丁"] }));
    const result = await makeProvider(fetchFn).getIntentOptions(scene, "Coffee.");
    expect(result).toEqual({ options: ["甲", "乙", "丙", "丁"] });
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

  it("schema-valid but rule-violating JSON (wrong shape for options) → fallback", async () => {
    const { fetchFn } = stubFetch(JSON.stringify({ options: ["only-one"] })); // < 3 options
    const result = await makeProvider(fetchFn).getIntentOptions(scene, "Coffee.");
    expect(result.options.length).toBeGreaterThanOrEqual(3);
  });

  it("unnecessarily long improvement (>12 words, multi-sentence) → short fallback", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({
        improvedUtterance:
          "Excuse me, I would be ever so grateful if I could possibly order one cup of coffee. Thanks a lot.",
        primaryDiff: "Excuse me",
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

  it("primaryDiff not a substring / meaning==reason → fallback", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({
        improvedUtterance: "I'd like a coffee.",
        primaryDiff: "Could you", // not a substring
        meaningJa: "同じ文",
        reasonJa: "同じ文",
      }),
    );
    const result = await makeProvider(fetchFn).improve(scene, "Coffee.", "自由入力の意図");
    expect(findImprovementViolation(result)).toBeNull();
  });

  it("valid improvement passes through, with original/intent forced from input", async () => {
    const { fetchFn } = stubFetch(
      JSON.stringify({
        originalUtterance: "SPOOFED",
        selectedIntent: "SPOOFED",
        improvedUtterance: "I'd like a coffee, please.",
        primaryDiff: "I'd like",
        meaningJa: "希望を丁寧に伝える形",
        reasonJa: "注文の場面で自然だから",
      }),
    );
    const result = await makeProvider(fetchFn).improve(scene, "Coffee.", "注文したかった");
    expect(result.originalUtterance).toBe("Coffee.");
    expect(result.selectedIntent).toBe("注文したかった");
    expect(result.improvedUtterance).toBe("I'd like a coffee, please.");
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
