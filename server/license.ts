/**
 * D8 monetization — server-side license validation + free-tier daily quota.
 *
 * License key format (must match scripts/generate-license.mjs exactly):
 *   CDE-<base64url(email|yyyymmdd)>-<hmac16>
 * where hmac16 = first 16 hex chars of HMAC-SHA256(payload, LICENSE_SECRET).
 * Validation is stateless per request; missing LICENSE_SECRET means every key
 * is invalid (never a crash). Comparison is timing-safe.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const KEY_PATTERN = /^CDE-([A-Za-z0-9_-]+)-([0-9a-f]{16})$/;

export function validateLicenseKey(
  key: unknown,
  secret: string | undefined = process.env.LICENSE_SECRET,
): boolean {
  if (!secret || typeof key !== "string") return false;
  const match = KEY_PATTERN.exec(key.trim());
  if (!match) return false;

  let payload: string;
  try {
    payload = Buffer.from(match[1], "base64url").toString("utf8");
  } catch {
    return false;
  }
  // Payload must at least look like `email|yyyymmdd`.
  if (!/^.+\|\d{8}$/.test(payload)) return false;

  const expected = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  const given = Buffer.from(match[2], "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/* -------------------------------------------------------------------------
 * Daily improve quota for free users (D8): 3/day per x-client-id.
 * In-memory with UTC-date rollover. KNOWN MVP LIMITATION: a server restart
 * resets counters (documented in decisions.md AI-learning notes).
 * ---------------------------------------------------------------------- */

export const FREE_DAILY_IMPROVE_LIMIT = 3;

/** Bucket used when the client sends no x-client-id header. */
export const ANONYMOUS_CLIENT_ID = "__anonymous__";

export interface QuotaStore {
  /** Consumes one use for clientId; returns false when the daily limit is hit. */
  consume(clientId: string, now?: Date): boolean;
}

export function createQuotaStore(limit: number = FREE_DAILY_IMPROVE_LIMIT): QuotaStore {
  let currentDay = "";
  let counts = new Map<string, number>();

  return {
    consume(clientId: string, now: Date = new Date()): boolean {
      const day = now.toISOString().slice(0, 10); // UTC date key
      if (day !== currentDay) {
        currentDay = day;
        counts = new Map();
      }
      const used = counts.get(clientId) ?? 0;
      if (used >= limit) return false;
      counts.set(clientId, used + 1);
      return true;
    },
  };
}
