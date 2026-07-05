/**
 * Route-level tests for the four D3 endpoints (mock provider by default).
 * No supertest in the dependency set, so we run the real router on an
 * ephemeral listener and hit it with global fetch.
 */
import express from "express";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { intentOptionSchema } from "../shared/schemas";
import type { ConversationTurn, Improvement, IntentOption } from "../shared/types";
import { MAX_IMPROVED_WORDS } from "./providers/guard";
import { MOCK_CLOSING_LINE } from "./providers/mock";
import type { AiProvider } from "./providers/types";
import { createApiRouter } from "./routes/index";

function makeApp(provider?: AiProvider): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api", provider ? createApiRouter(provider) : createApiRouter());
  return app;
}

interface TestServer {
  url: string;
  close(): Promise<void>;
}

function startServer(app: express.Express): Promise<TestServer> {
  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => void server.close(() => done())),
      });
    });
  });
}

let clientCounter = 0;

async function post(
  base: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(base + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Unique per request so the D8 daily quota never interferes with
      // unrelated tests; quota tests pass an explicit fixed id instead.
      "x-client-id": `test-client-${clientCounter++}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const CAFE_INTENT = "コーヒーを注文したかった";

describe("api routes (mock provider)", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer(makeApp());
  });
  afterAll(async () => {
    await server.close();
  });

  it("one-word utterance: full options → improve path for 'Coffee.'", async () => {
    const options = await post(server.url, "/api/intent-options", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
    });
    expect(options.status).toBe(200);
    expect(options.body.options.map((o: IntentOption) => o.textJa)).toContain(CAFE_INTENT);
    expect(options.body.options.length).toBeGreaterThanOrEqual(3);
    expect(options.body.options.length).toBeLessThanOrEqual(5);
    // D11: every option is a full {textEn, textJa, icon} object, nothing more.
    for (const option of options.body.options) {
      expect(intentOptionSchema.safeParse(option).success).toBe(true);
      expect(Object.keys(option).sort()).toEqual(["icon", "textEn", "textJa"]);
    }

    const improve = await post(server.url, "/api/improve", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
      intent: CAFE_INTENT,
    });
    expect(improve.status).toBe(200);
    expect(improve.body.improvedUtterance).toBe("I'd like a coffee.");
    expect(improve.body.primaryDiff).toBe("I'd like a");
    expect(improve.body.originalUtterance).toBe("Coffee.");
    // D11: simple-English explanations ship beside the JA ones and differ.
    expect(typeof improve.body.meaningEn).toBe("string");
    expect(typeof improve.body.reasonEn).toBe("string");
    expect(improve.body.meaningEn).not.toBe(improve.body.reasonEn);
  });

  it("fixture match is case/punctuation-insensitive", async () => {
    const options = await post(server.url, "/api/intent-options", {
      sceneId: "cafe-order",
      utterance: "coffee",
    });
    expect(options.body.options.map((o: IntentOption) => o.textJa)).toContain(CAFE_INTENT);
  });

  it("intent-options response never contains any improvement or ranking", async () => {
    for (const utterance of ["Coffee.", "totally unseen utterance here"]) {
      const res = await post(server.url, "/api/intent-options", {
        sceneId: "cafe-order",
        utterance,
      });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(["options"]);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain("improvedUtterance");
      expect(text).not.toContain("primaryDiff");
      expect(text).not.toContain("I'd like");
    }
  });

  it("ambiguous free-text intent (not among options) still yields a valid improvement", async () => {
    const res = await post(server.url, "/api/improve", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
      intent: "店員と少し雑談したかった",
    });
    expect(res.status).toBe(200);
    const imp = res.body as Improvement;
    expect(imp.improvedUtterance.length).toBeGreaterThan(0);
    expect(imp.improvedUtterance).toContain(imp.primaryDiff);
    expect(imp.improvedUtterance.toLowerCase()).toContain("coffee"); // original words preserved
    expect(imp.meaningJa).not.toBe(imp.reasonJa);
  });

  it("no matching fixture: rule-based fallback keeps the flow alive", async () => {
    const options = await post(server.url, "/api/intent-options", {
      sceneId: "missing-order",
      utterance: "Where is my food",
    });
    expect(options.status).toBe(200);
    expect(options.body.options.length).toBeGreaterThanOrEqual(3);
    expect(options.body.options.length).toBeLessThanOrEqual(5);
    // D11: the fallback path also emits valid IntentOption objects.
    for (const option of options.body.options) {
      expect(intentOptionSchema.safeParse(option).success).toBe(true);
    }

    const improve = await post(server.url, "/api/improve", {
      sceneId: "missing-order",
      utterance: "Where is my food",
      intent: options.body.options[0].textJa,
    });
    expect(improve.status).toBe(200);
    expect(improve.body.improvedUtterance).toContain(improve.body.primaryDiff);
    expect(improve.body.meaningJa).not.toBe(improve.body.reasonJa);
    expect(improve.body.meaningEn).not.toBe(improve.body.reasonEn);
  });

  it("deterministic: same request twice returns the identical improvement", async () => {
    const payload = {
      sceneId: "cafe-order",
      utterance: "Some tea maybe",
      intent: "自分の希望を伝えたかった",
    };
    const first = await post(server.url, "/api/improve", payload);
    const second = await post(server.url, "/api/improve", payload);
    expect(first.body).toEqual(second.body);
  });

  it("same scene, two different intents → two different improvements (variants)", async () => {
    const a = await post(server.url, "/api/improve", {
      sceneId: "missing-order",
      utterance: "Order?",
      intent: "注文状況を確認したかった",
    });
    const b = await post(server.url, "/api/improve", {
      sceneId: "missing-order",
      utterance: "Order?",
      intent: "店員に気付いてほしかった",
    });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.improvedUtterance).toBe("My order?");
    expect(b.body.improvedUtterance).toBe("Excuse me.");
    expect(a.body.improvedUtterance).not.toBe(b.body.improvedUtterance);
  });

  it("respond: in-scene NPC reply + completionNote for fragmentary utterances", async () => {
    const short = await post(server.url, "/api/respond", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
    });
    expect(short.status).toBe(200);
    expect(Object.keys(short.body).sort()).toEqual([
      "adequacyNote",
      "adequate",
      "completionNote",
      "done",
      "npcReply",
    ]);
    expect(typeof short.body.npcReply).toBe("string");
    expect(typeof short.body.completionNote).toBe("string");
    expect(short.body.adequate).toBe(false);
    expect(short.body.adequacyNote).toBeNull();
    expect(short.body.done).toBe(false);

    // D9: an already-adequate utterance is celebrated, not completed.
    const full = await post(server.url, "/api/respond", {
      sceneId: "cafe-order",
      utterance: "I'd like a large coffee, please.",
    });
    expect(full.body.completionNote).toBeNull();
    expect(full.body.adequate).toBe(true);
    expect(typeof full.body.adequacyNote).toBe("string");
    expect(full.body.done).toBe(true); // D12: adequate ⇒ done
  });

  it("D12: scripted multi-turn respond reaches done deterministically", async () => {
    const turns: ConversationTurn[] = [];
    const utterances = ["Coffee.", "Small.", "Card."];
    const replies: string[] = [];
    let done = false;
    for (const utterance of utterances) {
      const res = await post(server.url, "/api/respond", {
        sceneId: "cafe-order",
        utterance,
        turns,
      });
      expect(res.status).toBe(200);
      replies.push(res.body.npcReply);
      done = res.body.done;
      turns.push({ speaker: "learner", text: utterance });
      turns.push({ speaker: "npc", text: res.body.npcReply });
    }
    expect(replies).toEqual([
      "What size would you like?",
      "That's 3.50. Cash or card?",
      MOCK_CLOSING_LINE,
    ]);
    expect(done).toBe(true);
  });

  it("D12: intent-options accepts turns and surfaces a comprehension-cue option after an NPC question", async () => {
    const res = await post(server.url, "/api/intent-options", {
      sceneId: "cafe-order",
      utterance: "unseen mumble words",
      turns: [
        { speaker: "learner", text: "Coffee." },
        { speaker: "npc", text: "What size would you like?" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.options.map((o: IntentOption) => o.textEn)).toContain(
      "I didn't understand you",
    );
  });

  it("D12: turns are validated — bad speaker or > 20 entries → 400", async () => {
    const bad = await post(server.url, "/api/respond", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
      turns: [{ speaker: "narrator", text: "hm" }],
    });
    expect(bad.status).toBe(400);

    const tooMany = await post(server.url, "/api/respond", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
      turns: Array.from({ length: 21 }, (_, i) => ({
        speaker: i % 2 === 0 ? "learner" : "npc",
        text: `line ${i}`,
      })),
    });
    expect(tooMany.status).toBe(400);
  });

  it("evaluate-retry judges communicated intent, not string equality", async () => {
    const good = await post(server.url, "/api/evaluate-retry", {
      sceneId: "cafe-order",
      intent: CAFE_INTENT,
      utterance: "Can I have a coffee please", // ≠ fixture improvedUtterance
    });
    expect(good.status).toBe(200);
    expect(good.body.communicated).toBe(true);
    expect(good.body.note.length).toBeGreaterThan(0);

    const bare = await post(server.url, "/api/evaluate-retry", {
      sceneId: "cafe-order",
      intent: CAFE_INTENT,
      utterance: "Coffee",
    });
    expect(bare.body.communicated).toBe(false);
    expect(bare.body.note.length).toBeGreaterThan(0);
    // D7: encouraging, never scolding.
    expect(bare.body.note).not.toMatch(/ダメ|間違い|不正解/);
  });

  it("evaluate-retry: attention intent satisfied by 'Excuse me.' alone", async () => {
    const res = await post(server.url, "/api/evaluate-retry", {
      sceneId: "missing-order",
      intent: "店員に気付いてほしかった",
      utterance: "Excuse me!",
    });
    expect(res.body.communicated).toBe(true);
  });

  it("felt_targets never appear in any response", async () => {
    const feltStrings = [
      "felt_targets",
      "slight pressure",
      "need to respond now",
      "being overlooked",
      "need for repetition",
    ];
    const scenes = await fetch(`${server.url}/api/scenes`);
    const bodies: unknown[] = [await scenes.json()];
    bodies.push(
      (await post(server.url, "/api/respond", { sceneId: "cafe-order", utterance: "Coffee." })).body,
      (await post(server.url, "/api/intent-options", { sceneId: "cafe-order", utterance: "Coffee." })).body,
      (
        await post(server.url, "/api/improve", {
          sceneId: "cafe-order",
          utterance: "Coffee.",
          intent: CAFE_INTENT,
        })
      ).body,
      (
        await post(server.url, "/api/evaluate-retry", {
          sceneId: "cafe-order",
          intent: CAFE_INTENT,
          utterance: "I'd like a coffee.",
        })
      ).body,
    );
    const text = JSON.stringify(bodies);
    for (const felt of feltStrings) {
      expect(text).not.toContain(felt);
    }
  });

  it("validates request bodies (400) and unknown scenes (404)", async () => {
    expect((await post(server.url, "/api/respond", { sceneId: "cafe-order" })).status).toBe(400);
    expect((await post(server.url, "/api/improve", { sceneId: "cafe-order", utterance: "x" })).status).toBe(400);
    expect(
      (await post(server.url, "/api/respond", { sceneId: "nope", utterance: "x" })).status,
    ).toBe(404);
  });
});

describe("api routes with a misbehaving provider (fallback safety net)", () => {
  const garbageProvider: AiProvider = {
    getIntentOptions: () => Promise.resolve({ options: "not-an-array" } as never),
    improve: () => Promise.resolve({ totally: "malformed" } as never),
    respond: () => Promise.reject(new Error("boom")),
    evaluateRetry: () => Promise.resolve({ communicated: "yes" } as never),
  };

  let server: TestServer;
  beforeAll(async () => {
    server = await startServer(makeApp(garbageProvider));
  });
  afterAll(async () => {
    await server.close();
  });

  it("malformed provider JSON → deterministic fallback, never a 500", async () => {
    const options = await post(server.url, "/api/intent-options", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
    });
    expect(options.status).toBe(200);
    expect(options.body.options.length).toBeGreaterThanOrEqual(3);

    const improve = await post(server.url, "/api/improve", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
      intent: CAFE_INTENT,
    });
    expect(improve.status).toBe(200);
    expect(improve.body.improvedUtterance).toContain(improve.body.primaryDiff);

    const respond = await post(server.url, "/api/respond", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
    });
    expect(respond.status).toBe(200);
    expect(typeof respond.body.npcReply).toBe("string");

    const retry = await post(server.url, "/api/evaluate-retry", {
      sceneId: "cafe-order",
      intent: CAFE_INTENT,
      utterance: "I'd like a coffee.",
    });
    expect(retry.status).toBe(200);
    expect(typeof retry.body.communicated).toBe("boolean");
  });
});

describe("license activation + improve quota (D8)", () => {
  const SECRET = "test-license-secret";

  function makeKey(secret: string, email = "buyer@example.com"): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const payload = `${email}|${date}`;
    const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
    return `CDE-${Buffer.from(payload).toString("base64url")}-${sig}`;
  }

  let server: TestServer;
  let previousSecret: string | undefined;

  beforeAll(async () => {
    previousSecret = process.env.LICENSE_SECRET;
    process.env.LICENSE_SECRET = SECRET;
    server = await startServer(makeApp());
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.LICENSE_SECRET;
    else process.env.LICENSE_SECRET = previousSecret;
    await server.close();
  });

  const improveBody = {
    sceneId: "cafe-order",
    utterance: "Coffee.",
    intent: CAFE_INTENT,
  };

  it("activates a valid key and rejects a tampered one", async () => {
    const key = makeKey(SECRET);
    expect((await post(server.url, "/api/license/activate", { key })).body).toEqual({
      valid: true,
    });

    const tampered = `${key.slice(0, -1)}${key.endsWith("0") ? "1" : "0"}`;
    expect((await post(server.url, "/api/license/activate", { key: tampered })).body).toEqual({
      valid: false,
    });
    expect(
      (await post(server.url, "/api/license/activate", { key: makeKey("other-secret") })).body,
    ).toEqual({ valid: false });
    expect((await post(server.url, "/api/license/activate", {})).body).toEqual({ valid: false });
    expect((await post(server.url, "/api/license/activate", { key: 42 })).status).toBe(200);
  });

  it("free user: 4th improve of the day → 402 quota_exceeded", async () => {
    const headers = { "x-client-id": "quota-test-free-user" };
    for (let i = 0; i < 3; i++) {
      expect((await post(server.url, "/api/improve", improveBody, headers)).status).toBe(200);
    }
    const fourth = await post(server.url, "/api/improve", improveBody, headers);
    expect(fourth.status).toBe(402);
    expect(fourth.body).toEqual({ error: "quota_exceeded", limit: 3 });
  });

  it("valid x-license-key (Pro) → unlimited improves, no 402", async () => {
    const headers = { "x-client-id": "quota-test-pro-user", "x-license-key": makeKey(SECRET) };
    for (let i = 0; i < 5; i++) {
      expect((await post(server.url, "/api/improve", improveBody, headers)).status).toBe(200);
    }
  });

  it("invalid x-license-key falls back to the free quota", async () => {
    const headers = {
      "x-client-id": "quota-test-fake-pro",
      "x-license-key": "CDE-not-a-real-key-0123456789abcdef",
    };
    for (let i = 0; i < 3; i++) {
      expect((await post(server.url, "/api/improve", improveBody, headers)).status).toBe(200);
    }
    expect((await post(server.url, "/api/improve", improveBody, headers)).status).toBe(402);
  });

  it("quota does not affect the other endpoints", async () => {
    const headers = { "x-client-id": "quota-test-free-user" }; // already exhausted above
    expect(
      (await post(server.url, "/api/intent-options", { sceneId: "cafe-order", utterance: "Coffee." }, headers))
        .status,
    ).toBe(200);
    expect(
      (await post(server.url, "/api/respond", { sceneId: "cafe-order", utterance: "Coffee." }, headers))
        .status,
    ).toBe(200);
    expect(
      (
        await post(
          server.url,
          "/api/evaluate-retry",
          { sceneId: "cafe-order", intent: CAFE_INTENT, utterance: "I'd like a coffee." },
          headers,
        )
      ).status,
    ).toBe(200);
  });
});

describe("api routes with an over-long AI suggestion", () => {
  const dummyOptions: IntentOption[] = [
    { textEn: "a", textJa: "あ", icon: "🅰️" },
    { textEn: "b", textJa: "い", icon: "🅱️" },
    { textEn: "c", textJa: "う", icon: "🌀" },
  ];
  const longWinded: AiProvider = {
    getIntentOptions: () => Promise.resolve({ options: dummyOptions }),
    improve: (_scene, utterance, intent) =>
      Promise.resolve({
        originalUtterance: utterance,
        selectedIntent: intent,
        improvedUtterance:
          "Excuse me, I was wondering if it might perhaps be possible for me to order one single cup of your finest coffee. Thank you so much.",
        primaryDiff: "Excuse me",
        meaningEn: "A very polite phrase.",
        reasonEn: "It sounds polite here.",
        meaningJa: "丁寧な言い方",
        reasonJa: "丁寧だから",
      }),
    respond: () =>
      Promise.resolve({
        npcReply: "ok",
        completionNote: null,
        adequate: false,
        adequacyNote: null,
        done: false,
      }),
    evaluateRetry: () => Promise.resolve({ communicated: true, note: "ok" }),
  };

  it("multi-sentence / >12-word suggestion is replaced by a short one-chunk form", async () => {
    const server = await startServer(makeApp(longWinded));
    try {
      const res = await post(server.url, "/api/improve", {
        sceneId: "cafe-order",
        utterance: "Coffee.",
        intent: CAFE_INTENT,
      });
      expect(res.status).toBe(200);
      const words = res.body.improvedUtterance.trim().split(/\s+/);
      expect(words.length).toBeLessThanOrEqual(MAX_IMPROVED_WORDS);
      expect(res.body.improvedUtterance).toContain(res.body.primaryDiff);
      // Fixture (utterance+intent match) provides the short deterministic form.
      expect(res.body.improvedUtterance).toBe("I'd like a coffee.");
    } finally {
      await server.close();
    }
  });
});

describe("api routes with meaningEn == reasonEn from the provider (D11 guard)", () => {
  const sameEnTexts: AiProvider = {
    getIntentOptions: () =>
      Promise.resolve({
        options: [
          { textEn: "a", textJa: "あ", icon: "🅰️" },
          { textEn: "b", textJa: "い", icon: "🅱️" },
          { textEn: "c", textJa: "う", icon: "🌀" },
        ],
      }),
    improve: (_scene, utterance, intent) =>
      Promise.resolve({
        originalUtterance: utterance,
        selectedIntent: intent,
        improvedUtterance: "I'd like a coffee, thanks.",
        primaryDiff: "I'd like a",
        meaningEn: "It is a polite phrase.",
        reasonEn: "It is a polite phrase.", // == meaningEn → guard violation
        meaningJa: "丁寧に伝える形",
        reasonJa: "注文の場面で自然だから",
      }),
    respond: () =>
      Promise.resolve({
        npcReply: "ok",
        completionNote: null,
        adequate: false,
        adequacyNote: null,
        done: false,
      }),
    evaluateRetry: () => Promise.resolve({ communicated: true, note: "ok" }),
  };

  it("identical meaningEn/reasonEn triggers the deterministic fallback improvement", async () => {
    const server = await startServer(makeApp(sameEnTexts));
    try {
      const res = await post(server.url, "/api/improve", {
        sceneId: "cafe-order",
        utterance: "Coffee.",
        intent: CAFE_INTENT,
      });
      expect(res.status).toBe(200);
      expect(res.body.meaningEn).not.toBe(res.body.reasonEn);
      // The safety MockProvider's fixture result replaces the violating one.
      expect(res.body.improvedUtterance).toBe("I'd like a coffee.");
    } finally {
      await server.close();
    }
  });
});
