import { describe, expect, it } from "vitest";
import { canShowImprovement, flowReducer, initialFlowState, type FlowState } from "./flow";
import type { Improvement } from "../shared/types";

const improvement: Improvement = {
  originalUtterance: "Coffee.",
  selectedIntent: "コーヒーを注文したかった",
  improvedUtterance: "I'd like a coffee.",
  primaryDiff: "I'd like a",
  meaningJa: "自分の希望を丁寧に伝える",
  reasonJa: "商品名だけでなく、注文の意思を伝えるため",
};

function reachReflection(): FlowState {
  let state = flowReducer(initialFlowState, {
    type: "RESPONDED",
    utterance: "Coffee.",
    npcReply: "Sure, one coffee.",
    completionNote: null,
  });
  state = flowReducer(state, { type: "REFLECT" });
  return flowReducer(state, {
    type: "OPTIONS_LOADED",
    options: ["コーヒーを注文したかった", "少し待ってほしかった", "おすすめを聞きたかった"],
  });
}

describe("flowReducer", () => {
  it("walks the happy path and only reaches the diff after an intention is selected", () => {
    let state = reachReflection();
    expect(state.phase).toBe("reflection");
    expect(canShowImprovement(state)).toBe(false);

    state = flowReducer(state, { type: "INTENT_SELECTED", intent: "コーヒーを注文したかった" });
    expect(state.phase).toBe("reflection"); // still no improvement visible
    expect(state.improvement).toBeNull();

    state = flowReducer(state, { type: "IMPROVEMENT_LOADED", improvement });
    expect(state.phase).toBe("diff");
    expect(canShowImprovement(state)).toBe(true);
  });

  it("rejects an improvement that arrives before any intention was selected (A2 invariant)", () => {
    const state = reachReflection();
    const after = flowReducer(state, { type: "IMPROVEMENT_LOADED", improvement });
    expect(after).toBe(state); // unchanged — improvement never enters state
    expect(after.improvement).toBeNull();
    expect(after.phase).toBe("reflection");
  });

  it("supports a second intention from the same scene (A4): back to reflection with a clean slate", () => {
    let state = reachReflection();
    state = flowReducer(state, { type: "INTENT_SELECTED", intent: "コーヒーを注文したかった" });
    state = flowReducer(state, { type: "IMPROVEMENT_LOADED", improvement });
    state = flowReducer(state, { type: "RETRY_STARTED" });
    state = flowReducer(state, {
      type: "RETRY_EVALUATED",
      utterance: "I'd like a coffee.",
      evaluation: { communicated: true, note: "Clear order." },
    });
    expect(state.phase).toBe("retryResult");

    state = flowReducer(state, { type: "ANOTHER_INTENT" });
    expect(state.phase).toBe("reflection");
    expect(state.selectedIntent).toBeNull();
    expect(state.improvement).toBeNull();
    expect(state.retryEvaluation).toBeNull();
    // options are kept so the second pick is one tap away
    expect(state.intentOptions).not.toBeNull();
    expect(canShowImprovement(state)).toBe(false);
  });

  it("degrades gracefully when respond() fails: the learner's words survive and reflection is reachable", () => {
    let state = flowReducer(initialFlowState, { type: "RESPOND_FAILED", utterance: "Order?" });
    expect(state.phase).toBe("responded");
    expect(state.respondFailed).toBe(true);
    expect(state.utterance).toBe("Order?");

    state = flowReducer(state, { type: "REFLECT" });
    expect(state.phase).toBe("reflection");
  });
});
