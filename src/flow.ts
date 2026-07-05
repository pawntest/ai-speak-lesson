/**
 * Pure screen-state machine for the scene flow (screens 2–6).
 *
 * Encodes the core product invariants as reducer guards:
 * - A2: no Improvement can enter state before an intention is selected.
 * - A4: "another intention" clears the improvement and returns to reflection,
 *   so the same scene can produce multiple cards.
 * - A8: retry replays the decisive moment from a clean slate (no stale reply).
 * - D12: the conversation loop (turns/done) is orthogonal to the phase, and
 *   the stuck-help overlay (helpOpen) is a second orthogonal flag — rescue
 *   intent selection reuses the SAME INTENT_SELECTED/IMPROVEMENT_LOADED path
 *   as the main reflection flow, so A2 holds for it too.
 *
 * All async work (API calls) lives in components; the reducer only records
 * results, so it stays a pure, unit-testable function.
 */
import type { ConversationTurn, Improvement, IntentOption, RetryEvaluation } from "../shared/types";

export type FlowPhase =
  | "experience" // scene staged; waiting for the learner's next utterance
  | "responded" // respond() settled; NPC reply (or friendly fallback) shown
  | "reflection" // "What did you want to say?" — no improvement visible yet
  | "diff" // context-difference view
  | "retry" // decisive moment replayed; waiting for the retry utterance
  | "retryResult"; // communicated-or-not shown

/** Phases where the stuck-help overlay may be opened (D12). */
const HELP_ELIGIBLE_PHASES: FlowPhase[] = ["experience", "responded", "reflection"];

export interface FlowState {
  phase: FlowPhase;
  /** The learner's most recent utterance — the one being improved/reflected on. */
  utterance: string | null;
  npcReply: string | null;
  completionNote: string | null;
  /** D9: the utterance already communicated well — celebrate, don't force reflection. */
  adequate: boolean;
  adequacyNote: string | null;
  /** respond() failed (e.g. 501 while the server is unfinished). */
  respondFailed: boolean;
  /** D12: the running scene conversation, oldest first. */
  turns: ConversationTurn[];
  /** D12: true once the exchange has naturally concluded. */
  done: boolean;
  /** D12: stuck-help overlay open flag — orthogonal to `phase`. */
  helpOpen: boolean;
  intentOptions: IntentOption[] | null;
  optionsFailed: boolean;
  selectedIntent: string | null;
  improveFailed: boolean;
  improvement: Improvement | null;
  retryUtterance: string | null;
  retryEvaluation: RetryEvaluation | null;
  /** evaluateRetry() failed; degrade gracefully without a verdict. */
  retryEvalFailed: boolean;
}

export const initialFlowState: FlowState = {
  phase: "experience",
  utterance: null,
  npcReply: null,
  completionNote: null,
  adequate: false,
  adequacyNote: null,
  respondFailed: false,
  turns: [],
  done: false,
  helpOpen: false,
  intentOptions: null,
  optionsFailed: false,
  selectedIntent: null,
  improveFailed: false,
  improvement: null,
  retryUtterance: null,
  retryEvaluation: null,
  retryEvalFailed: false,
};

export type FlowEvent =
  | {
      type: "RESPONDED";
      utterance: string;
      npcReply: string | null;
      completionNote: string | null;
      adequate: boolean;
      adequacyNote: string | null;
      done: boolean;
    }
  | { type: "RESPOND_FAILED"; utterance: string }
  | { type: "CONTINUE" }
  | { type: "REFLECT" }
  | { type: "OPTIONS_LOADED"; options: IntentOption[] }
  | { type: "OPTIONS_FAILED" }
  | { type: "INTENT_SELECTED"; intent: string }
  | { type: "IMPROVEMENT_LOADED"; improvement: Improvement }
  | { type: "IMPROVE_FAILED" }
  | { type: "HELP_OPENED" }
  | { type: "HELP_CLOSED" }
  | { type: "RETRY_STARTED" }
  | { type: "RETRY_EVALUATED"; utterance: string; evaluation: RetryEvaluation }
  | { type: "RETRY_EVAL_FAILED"; utterance: string }
  | { type: "ANOTHER_INTENT" }
  | { type: "RESET" };

/** True when the context-difference view may be rendered. */
export function canShowImprovement(state: FlowState): boolean {
  return state.selectedIntent !== null && state.improvement !== null;
}

export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "RESPONDED": {
      if (state.phase !== "experience") return state;
      const turns: ConversationTurn[] = [
        ...state.turns,
        { speaker: "learner", text: event.utterance },
        ...(event.npcReply ? [{ speaker: "npc", text: event.npcReply } satisfies ConversationTurn] : []),
      ];
      return {
        ...state,
        phase: "responded",
        utterance: event.utterance,
        npcReply: event.npcReply,
        completionNote: event.completionNote,
        adequate: event.adequate,
        adequacyNote: event.adequacyNote,
        respondFailed: false,
        turns,
        done: event.done,
      };
    }

    case "RESPOND_FAILED":
      // Keep the learner's words and let the loop continue (friendly degrade).
      if (state.phase !== "experience") return state;
      return {
        ...state,
        phase: "responded",
        utterance: event.utterance,
        respondFailed: true,
        turns: [...state.turns, { speaker: "learner", text: event.utterance }],
      };

    case "CONTINUE":
      // D12: after a non-done NPC reply, go back to "experience" so the
      // learner can speak again — turns/done/helpOpen survive untouched.
      if (state.phase !== "responded" || state.done) return state;
      return {
        ...state,
        phase: "experience",
        npcReply: null,
        completionNote: null,
        adequate: false,
        adequacyNote: null,
        respondFailed: false,
      };

    case "REFLECT":
      if (state.phase !== "responded") return state;
      return { ...state, phase: "reflection" };

    case "OPTIONS_LOADED":
      if (state.phase !== "reflection") return state;
      return { ...state, intentOptions: event.options, optionsFailed: false };

    case "OPTIONS_FAILED":
      if (state.phase !== "reflection") return state;
      // Free-text intention entry stays available; nothing is blocked.
      return { ...state, optionsFailed: true };

    case "INTENT_SELECTED": {
      // D12: the rescue overlay reuses this same event while helpOpen, from
      // whichever base phase the conversation was in when help was opened.
      if (state.phase !== "reflection" && !state.helpOpen) return state;
      const intent = event.intent.trim();
      if (!intent) return state;
      return { ...state, selectedIntent: intent, improveFailed: false };
    }

    case "IMPROVEMENT_LOADED": {
      // INVARIANT (A2): an improvement can never land without a chosen intention.
      if (state.selectedIntent === null) return state;
      if (state.phase !== "reflection" && !state.helpOpen) return state;
      if (state.helpOpen) {
        // Rescue path: the overlay renders the improvement itself; the base
        // phase (experience/responded/reflection) stays exactly as it was.
        return { ...state, improvement: event.improvement, improveFailed: false };
      }
      return { ...state, phase: "diff", improvement: event.improvement, improveFailed: false };
    }

    case "IMPROVE_FAILED":
      if (state.phase !== "reflection" && !state.helpOpen) return state;
      return { ...state, improveFailed: true };

    case "HELP_OPENED":
      if (!HELP_ELIGIBLE_PHASES.includes(state.phase)) return state;
      return { ...state, helpOpen: true };

    case "HELP_CLOSED":
      if (!state.helpOpen) return state;
      // Whatever selectedIntent/improvement exist here were necessarily set
      // by the rescue path (see IMPROVEMENT_LOADED) — clear them so the main
      // reflection flow (if any) resumes with a clean slate.
      return {
        ...state,
        helpOpen: false,
        selectedIntent: null,
        improvement: null,
        improveFailed: false,
      };

    case "RETRY_STARTED":
      if (state.phase !== "diff" && state.phase !== "retryResult") return state;
      return {
        ...state,
        phase: "retry",
        retryUtterance: null,
        retryEvaluation: null,
        retryEvalFailed: false,
      };

    case "RETRY_EVALUATED":
      if (state.phase !== "retry") return state;
      return {
        ...state,
        phase: "retryResult",
        retryUtterance: event.utterance,
        retryEvaluation: event.evaluation,
        retryEvalFailed: false,
      };

    case "RETRY_EVAL_FAILED":
      if (state.phase !== "retry") return state;
      return {
        ...state,
        phase: "retryResult",
        retryUtterance: event.utterance,
        retryEvaluation: null,
        retryEvalFailed: true,
      };

    case "ANOTHER_INTENT":
      // A4: same scene, different intention → back to reflection for a new card.
      if (state.phase !== "diff" && state.phase !== "retry" && state.phase !== "retryResult") {
        return state;
      }
      return {
        ...state,
        phase: "reflection",
        selectedIntent: null,
        improvement: null,
        improveFailed: false,
        retryUtterance: null,
        retryEvaluation: null,
        retryEvalFailed: false,
      };

    case "RESET":
      return initialFlowState;

    default:
      return state;
  }
}
