/**
 * Typed API client — the only place the UI talks to the server (decision D2/D3).
 * All functions throw ApiError on non-2xx responses.
 */
import type {
  ConversationTurn,
  Improvement,
  IntentOptionsResult,
  RespondResult,
  RetryEvaluation,
  Scene,
} from "../shared/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** HTTP 402 — the free daily coach quota is used up (D8 freemium). */
export class QuotaExceededError extends ApiError {
  constructor(message: string) {
    super(402, message);
    this.name = "QuotaExceededError";
  }
}

/* ----------------------------------------------------------------------------
 * D8: client identity + license plumbing (display/transport only — all
 * enforcement is server-side; no secrets ever live in the client).
 * ------------------------------------------------------------------------- */

const CLIENT_ID_KEY = "ai-speak-lesson.clientId.v1";
const LICENSE_KEY_KEY = "ai-speak-lesson.licenseKey.v1";

function safeStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

let memoryClientId: string | null = null;

/** Opaque per-device id (uuid), persisted in localStorage. */
export function getClientId(): string {
  const storage = safeStorage();
  const existing = storage?.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  if (!storage && memoryClientId) return memoryClientId;
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (storage) storage.setItem(CLIENT_ID_KEY, id);
  else memoryClientId = id;
  return id;
}

export function getStoredLicenseKey(): string | null {
  return safeStorage()?.getItem(LICENSE_KEY_KEY) ?? null;
}

/** Store a license key ONLY after the server validated it. */
export function storeLicenseKey(key: string): void {
  safeStorage()?.setItem(LICENSE_KEY_KEY, key);
}

export function hasStoredLicense(): boolean {
  return getStoredLicenseKey() !== null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      if (body && typeof body.error === "string") detail = `: ${body.error}`;
    } catch {
      // non-JSON error body; keep the status-only message
    }
    const message = `${init?.method ?? "GET"} ${path} failed (${res.status})${detail}`;
    if (res.status === 402) throw new QuotaExceededError(message);
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "x-client-id": getClientId() };
  const license = getStoredLicenseKey();
  if (license) headers["x-license-key"] = license;
  return request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function fetchScenes(): Promise<Scene[]> {
  return request<Scene[]>("/api/scenes");
}

export function respond(
  sceneId: string,
  utterance: string,
  turns?: ConversationTurn[],
): Promise<RespondResult> {
  return post<RespondResult>("/api/respond", { sceneId, utterance, ...(turns ? { turns } : {}) });
}

export function fetchIntentOptions(
  sceneId: string,
  utterance: string,
  turns?: ConversationTurn[],
): Promise<IntentOptionsResult> {
  return post<IntentOptionsResult>("/api/intent-options", { sceneId, utterance, ...(turns ? { turns } : {}) });
}

export function improve(sceneId: string, utterance: string, intent: string): Promise<Improvement> {
  return post<Improvement>("/api/improve", { sceneId, utterance, intent });
}

export function evaluateRetry(sceneId: string, intent: string, utterance: string): Promise<RetryEvaluation> {
  return post<RetryEvaluation>("/api/evaluate-retry", { sceneId, intent, utterance });
}

/** D8: validate a Pro license key server-side. */
export function activateLicense(key: string): Promise<{ valid: boolean }> {
  return post<{ valid: boolean }>("/api/license/activate", { key });
}
