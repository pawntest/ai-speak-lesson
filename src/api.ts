/**
 * Typed API client — the only place the UI talks to the server (decision D2/D3).
 * All functions throw ApiError on non-2xx responses.
 */
import type {
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
    throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} failed (${res.status})${detail}`);
  }
  return (await res.json()) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function fetchScenes(): Promise<Scene[]> {
  return request<Scene[]>("/api/scenes");
}

export function respond(sceneId: string, utterance: string): Promise<RespondResult> {
  return post<RespondResult>("/api/respond", { sceneId, utterance });
}

export function fetchIntentOptions(sceneId: string, utterance: string): Promise<IntentOptionsResult> {
  return post<IntentOptionsResult>("/api/intent-options", { sceneId, utterance });
}

export function improve(sceneId: string, utterance: string, intent: string): Promise<Improvement> {
  return post<Improvement>("/api/improve", { sceneId, utterance, intent });
}

export function evaluateRetry(sceneId: string, intent: string, utterance: string): Promise<RetryEvaluation> {
  return post<RetryEvaluation>("/api/evaluate-retry", { sceneId, intent, utterance });
}
