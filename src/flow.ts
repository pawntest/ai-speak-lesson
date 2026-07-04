/**
 * Pure screen-state machine for the scene flow (screens 2–6).
 *
 * Encodes the core product invariants as reducer guards:
 * - A2: no Improvement can enter state before an intention is selected.
 * - A4: "another intention" clears the improvement and returns to reflection,
 *   so the same scene can produce multiple cards.
 * - A8: retry replays the decisive moment from a clean slate (no stale reply).
 *
 * All async work (API calls) lives in components; the reducer only records
 * results, so it stays a pure, unit-testable function.
 */
import type { Improvement, RetryEvaluation } from "../shared/types";

export type FlowPhase =
  | "experience" // scene staged; waiting for the learner's first utterance
  | "responded" // respond() settled; NPC reply (or friendly fallback) shown
  | "reflection" // 「本当は何を伝えたかった？」 — no improvement visible yet
  | "diff" // context-difference view
  | "retry" // decisive moment replayed; waiting for the retry utterance
  | "retryResult"; // communicated-or-not shown

export interface FlowState {
  phase: FlowPhase;
  /** The learner's first utterance — the one being improved. */
  utterance: string | null;
  npcReply: string | null;
  completionNote: string | null;
  /** D9: the first utterance already communicated — celebrate, don't force reflection. */
  adequate: boolean;
  adequacyNote: string | null;
  /** respond() failed (e.g. 501 while the server is unfinished). */
  respondFailed: boolean;
  intentOptions: string[] | null;
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
    }
  | { type: "RESPOND_FAILED"; utterance: string }
  | { type: "REFLECT" }
  | { type: "OPTIONS_LOADED"; options: string[] }
  | { type: "OPTIONS_FAILED" }
  | { type: "INTENT_SELECTED"; intent: string }
  | { type: "IMPROVEMENT_LOADED"; improvement: Improvement }
  | { type: "IMPROVE_FAILED" }
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
    case "RESPONDED":
      if (state.phase !== "experience") return state;
      return {
        ...state,
        phase: "responded",
        utterance: event.utterance,
        npcReply: event.npcReply,
        completionNote: event.completionNote,
        adequate: event.adequate,
        adequacyNote: event.adequacyNote,
        respondFailed: false,
      };

    case "RESPOND_FAILED":
      // Keep the learner's words and let the loop continue (friendly degrade).
      if (state.phase !== "experience") return state;
      return { ...state, phase: "responded", utterance: event.utterance, respondFailed: true };

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
      if (state.phase !== "reflection") return state;
      const intent = event.intent.trim();
      if (!intent) return state;
      return { ...state, selectedIntent: intent, improveFailed: false };
    }

    case "IMPROVEMENT_LOADED":
      // INVARIANT (A2): an improvement can never land without a chosen intention.
      if (state.phase !== "reflection" || state.selectedIntent === null) return state;
      return { ...state, phase: "diff", improvement: event.improvement, improveFailed: false };

    case "IMPROVE_FAILED":
      if (state.phase !== "reflection") return state;
      return { ...state, improveFailed: true };

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
