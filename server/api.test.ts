/**
 * Route-level tests for the four D3 endpoints (mock provider by default).
 * No supertest in the dependency set, so we run the real router on an
 * ephemeral listener and hit it with global fetch.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Improvement } from "../shared/types";
import { MAX_IMPROVED_WORDS } from "./providers/guard";
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
    expect(options.body.options).toContain(CAFE_INTENT);
    expect(options.body.options.length).toBeGreaterThanOrEqual(3);
    expect(options.body.options.length).toBeLessThanOrEqual(5);

    const improve = await post(server.url, "/api/improve", {
      sceneId: "cafe-order",
      utterance: "Coffee.",
      intent: CAFE_INTENT,
    });
    expect(improve.status).toBe(200);
    expect(improve.body.improvedUtterance).toBe("I'd like a coffee.");
    expect(improve.body.primaryDiff).toBe("I'd like a");
    expect(improve.body.originalUtterance).toBe("Coffee.");
  });

  it("fixture match is case/punctuation-insensitive", async () => {
    const options = await post(server.url, "/api/intent-options", {
      sceneId: "cafe-order",
      utterance: "coffee",
    });
    expect(options.body.options).toContain(CAFE_INTENT);
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
    for (const option of options.body.options) {
      expect(typeof option).toBe("string");
      expect(option.length).toBeGreaterThan(0);
    }

    const improve = await post(server.url, "/api/improve", {
      sceneId: "missing-order",
      utterance: "Where is my food",
      intent: options.body.options[0],
    });
    expect(improve.status).toBe(200);
    expect(improve.body.improvedUtterance).toContain(improve.body.primaryDiff);
    expect(improve.body.meaningJa).not.toBe(improve.body.reasonJa);
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
    expect(Object.keys(short.body).sort()).toEqual(["completionNote", "npcReply"]);
    expect(typeof short.body.npcReply).toBe("string");
    expect(typeof short.body.completionNote).toBe("string");

    const full = await post(server.url, "/api/respond", {
      sceneId: "cafe-order",
      utterance: "I'd like a large coffee, please.",
    });
    expect(full.body.completionNote).toBeNull();
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

describe("api routes with an over-long AI suggestion", () => {
  const longWinded: AiProvider = {
    getIntentOptions: () => Promise.resolve({ options: ["a", "b", "c"] }),
    improve: (_scene, utterance, intent) =>
      Promise.resolve({
        originalUtterance: utterance,
        selectedIntent: intent,
        improvedUtterance:
          "Excuse me, I was wondering if it might perhaps be possible for me to order one single cup of your finest coffee. Thank you so much.",
        primaryDiff: "Excuse me",
        meaningJa: "丁寧な言い方",
        reasonJa: "丁寧だから",
      }),
    respond: () => Promise.resolve({ npcReply: "ok", completionNote: null }),
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
