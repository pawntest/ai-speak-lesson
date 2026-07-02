/**
 * Provider selection (D6 cost policy): mock by default (zero cost),
 * Gemini only when explicitly enabled AND a key is present.
 */
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import type { AiProvider } from "./types";

export function selectProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const apiKey = env.GEMINI_API_KEY;
  if (env.AI_PROVIDER === "gemini" && apiKey) {
    return new GeminiProvider({ apiKey });
  }
  return new MockProvider();
}

export { GeminiProvider } from "./gemini";
export { MockProvider } from "./mock";
export type { AiProvider } from "./types";
