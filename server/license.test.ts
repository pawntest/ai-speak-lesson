/**
 * Unit tests for D8 license validation and the daily improve quota store.
 */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createQuotaStore, FREE_DAILY_IMPROVE_LIMIT, validateLicenseKey } from "./license";

const SECRET = "unit-test-secret";

function makeKey(secret: string, email: string, yyyymmdd?: string): string {
  const date = yyyymmdd ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const payload = `${email}|${date}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  return `CDE-${Buffer.from(payload).toString("base64url")}-${sig}`;
}

describe("validateLicenseKey", () => {
  it("accepts a key produced by the documented scheme", () => {
    expect(validateLicenseKey(makeKey(SECRET, "buyer@example.com"), SECRET)).toBe(true);
  });

  it("accepts a key produced by the real scripts/generate-license.mjs", () => {
    const script = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "scripts",
      "generate-license.mjs",
    );
    const key = execFileSync(process.execPath, [script, "buyer@example.com"], {
      env: { ...process.env, LICENSE_SECRET: SECRET },
      encoding: "utf8",
    }).trim();
    expect(validateLicenseKey(key, SECRET)).toBe(true);
  });

  it("rejects tampered payloads and signatures", () => {
    const key = makeKey(SECRET, "buyer@example.com");
    const [prefix, payload, sig] = key.split("-");
    const otherPayload = Buffer.from("attacker@example.com|20260702").toString("base64url");
    expect(validateLicenseKey(`${prefix}-${otherPayload}-${sig}`, SECRET)).toBe(false);
    const flipped = sig.endsWith("0") ? `${sig.slice(0, -1)}1` : `${sig.slice(0, -1)}0`;
    expect(validateLicenseKey(`${prefix}-${payload}-${flipped}`, SECRET)).toBe(false);
    expect(validateLicenseKey(makeKey("wrong-secret", "buyer@example.com"), SECRET)).toBe(false);
  });

  it("rejects malformed inputs without throwing", () => {
    for (const bad of ["", "CDE--", "not-a-key", "CDE-!!!!-0123456789abcdef", 42, null, undefined, { key: "x" }]) {
      expect(validateLicenseKey(bad as never, SECRET)).toBe(false);
    }
    // Valid shape but payload is not email|yyyymmdd
    const payload = Buffer.from("no-separator").toString("base64url");
    const sig = createHmac("sha256", SECRET).update("no-separator").digest("hex").slice(0, 16);
    expect(validateLicenseKey(`CDE-${payload}-${sig}`, SECRET)).toBe(false);
  });

  it("missing LICENSE_SECRET ⇒ always invalid, never a crash", () => {
    expect(validateLicenseKey(makeKey(SECRET, "buyer@example.com"), undefined)).toBe(false);
    expect(validateLicenseKey(makeKey(SECRET, "buyer@example.com"), "")).toBe(false);
  });
});

describe("createQuotaStore", () => {
  it("allows the daily limit then blocks, per client id", () => {
    const store = createQuotaStore();
    for (let i = 0; i < FREE_DAILY_IMPROVE_LIMIT; i++) {
      expect(store.consume("alice")).toBe(true);
    }
    expect(store.consume("alice")).toBe(false);
    expect(store.consume("bob")).toBe(true); // independent bucket
  });

  it("rolls over on the next UTC day", () => {
    const store = createQuotaStore(1);
    const day1 = new Date("2026-07-02T23:59:00Z");
    const day2 = new Date("2026-07-03T00:01:00Z");
    expect(store.consume("alice", day1)).toBe(true);
    expect(store.consume("alice", day1)).toBe(false);
    expect(store.consume("alice", day2)).toBe(true);
  });
});
