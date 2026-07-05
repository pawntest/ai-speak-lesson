/**
 * Server-side provider contract. One object serves all four AI-ish endpoints
 * (D3). Implementations: MockProvider (default, deterministic) and
 * GeminiProvider (opt-in via AI_PROVIDER=gemini + GEMINI_API_KEY, D6).
 */
import type {
  CoachProvider,
  ConversationTurn,
  IntentOptionProvider,
  RespondResult,
  RetryEvaluator,
  Scene,
} from "../../shared/types";

export interface AiProvider extends IntentOptionProvider, CoachProvider, RetryEvaluator {
  /**
   * NPC reply with limited contextual completion. Never coaches.
   * D12: `turns` is the conversation so far (learner + npc lines, NOT
   * including `utterance`); drives the scripted multi-turn continuation and
   * `done` (exchange naturally concluded).
   */
  respond(scene: Scene, utterance: string, turns?: ConversationTurn[]): Promise<RespondResult>;
}
