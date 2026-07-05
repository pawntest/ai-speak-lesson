import { describe, expect, it } from "vitest";
import { canShowImprovement, flowReducer, initialFlowState, type FlowState } from "./flow";
import type { Improvement, IntentOption } from "../shared/types";

const improvement: Improvement = {
  originalUtterance: "Coffee.",
  selectedIntent: "Order a coffee",
  improvedUtterance: "I'd like a coffee.",
  primaryDiff: "I'd like a",
  meaningEn: "A polite way to ask for something.",
  reasonEn: "It names what you want, not just the item.",
  meaningJa: "自分の希望を丁寧に伝える",
  reasonJa: "商品名だけでなく、注文の意思を伝えるため",
};

const intentOptions: IntentOption[] = [
  { textEn: "Order a coffee", textJa: "コーヒーを注文したかった", icon: "☕" },
  { textEn: "Ask them to wait", textJa: "少し待ってほしかった", icon: "✋" },
  { textEn: "Ask for a recommendation", textJa: "おすすめを聞きたかった", icon: "💡" },
];

function respondedState(overrides: Partial<{ done: boolean; npcReply: string | null }> = {}): FlowState {
  return flowReducer(initialFlowState, {
    type: "RESPONDED",
    utterance: "Coffee.",
    npcReply: overrides.npcReply ?? "Sure, one coffee.",
    completionNote: null,
    adequate: false,
    adequacyNote: null,
    done: overrides.done ?? false,
  });
}

function reachReflection(): FlowState {
  let state = respondedState();
  state = flowReducer(state, { type: "REFLECT" });
  return flowReducer(state, { type: "OPTIONS_LOADED", options: intentOptions });
}

describe("flowReducer", () => {
  it("walks the happy path and only reaches the diff after an intention is selected", () => {
    let state = reachReflection();
    expect(state.phase).toBe("reflection");
    expect(canShowImprovement(state)).toBe(false);

    state = flowReducer(state, { type: "INTENT_SELECTED", intent: "Order a coffee" });
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
    state = flowReducer(state, { type: "INTENT_SELECTED", intent: "Order a coffee" });
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

  it("records adequacy so the UI can celebrate instead of forcing reflection (D9)", () => {
    const state = flowReducer(initialFlowState, {
      type: "RESPONDED",
      utterance: "I'd like a coffee.",
      npcReply: "Sure — coming right up!",
      completionNote: null,
      adequate: true,
      adequacyNote: "That one line already worked.",
      done: true,
    });
    expect(state.phase).toBe("responded");
    expect(state.adequate).toBe(true);
    expect(state.done).toBe(true);
    // Reflection stays reachable as an OPTIONAL path.
    expect(flowReducer(state, { type: "REFLECT" }).phase).toBe("reflection");
  });

  it("degrades gracefully when respond() fails: the learner's words survive and reflection is reachable", () => {
    let state = flowReducer(initialFlowState, { type: "RESPOND_FAILED", utterance: "Order?" });
    expect(state.phase).toBe("responded");
    expect(state.respondFailed).toBe(true);
    expect(state.utterance).toBe("Order?");
    expect(state.turns).toEqual([{ speaker: "learner", text: "Order?" }]);

    state = flowReducer(state, { type: "REFLECT" });
    expect(state.phase).toBe("reflection");
  });

  describe("D12: multi-turn conversation", () => {
    it("RESPONDED appends learner + npc turns and records adequate/done", () => {
      const state = respondedState({ npcReply: "Sure, one coffee.", done: false });
      expect(state.turns).toEqual([
        { speaker: "learner", text: "Coffee." },
        { speaker: "npc", text: "Sure, one coffee." },
      ]);
      expect(state.done).toBe(false);
      expect(state.adequate).toBe(false);
    });

    it("CONTINUE loops back to experience after a non-done reply, keeping turns", () => {
      let state = respondedState({ npcReply: "Sure, one coffee.", done: false });
      state = flowReducer(state, { type: "CONTINUE" });
      expect(state.phase).toBe("experience");
      expect(state.turns).toHaveLength(2);
      expect(state.npcReply).toBeNull();

      // A second turn round-trips and keeps accumulating turns.
      state = flowReducer(state, {
        type: "RESPONDED",
        utterance: "Anything else?",
        npcReply: "That's everything, thanks!",
        completionNote: null,
        adequate: true,
        adequacyNote: null,
        done: true,
      });
      expect(state.turns).toHaveLength(4);
      expect(state.done).toBe(true);
    });

    it("CONTINUE is rejected once done (conversation naturally concluded)", () => {
      const state = respondedState({ done: true });
      const after = flowReducer(state, { type: "CONTINUE" });
      expect(after).toBe(state);
      expect(after.phase).toBe("responded");
    });

    it("CONTINUE is rejected outside the responded phase", () => {
      const state = reachReflection();
      const after = flowReducer(state, { type: "CONTINUE" });
      expect(after).toBe(state);
    });
  });

  describe("D12: stuck-help overlay", () => {
    it("HELP_OPENED/HELP_CLOSED toggle helpOpen during experience/responded/reflection", () => {
      let state = flowReducer(initialFlowState, { type: "HELP_OPENED" });
      expect(state.helpOpen).toBe(true);
      expect(state.phase).toBe("experience");

      state = flowReducer(state, { type: "HELP_CLOSED" });
      expect(state.helpOpen).toBe(false);

      state = respondedState();
      state = flowReducer(state, { type: "HELP_OPENED" });
      expect(state.helpOpen).toBe(true);

      state = flowReducer(reachReflection(), { type: "HELP_OPENED" });
      expect(state.helpOpen).toBe(true);
    });

    it("HELP_OPENED is rejected outside experience/responded/reflection", () => {
      let state = reachReflection();
      state = flowReducer(state, { type: "INTENT_SELECTED", intent: "Order a coffee" });
      state = flowReducer(state, { type: "IMPROVEMENT_LOADED", improvement }); // → diff
      expect(state.phase).toBe("diff");
      const after = flowReducer(state, { type: "HELP_OPENED" });
      expect(after).toBe(state);
      expect(after.helpOpen).toBe(false);
    });

    it("rescue intent selection goes through INTENT_SELECTED+IMPROVEMENT_LOADED while helpOpen, respecting A2, without leaving the base phase", () => {
      let state = respondedState({ done: false });
      state = flowReducer(state, { type: "HELP_OPENED" });
      expect(state.helpOpen).toBe(true);

      // A2 still holds: no improvement before an intent, even in the overlay.
      const blocked = flowReducer(state, { type: "IMPROVEMENT_LOADED", improvement });
      expect(blocked).toBe(state);
      expect(blocked.improvement).toBeNull();

      state = flowReducer(state, { type: "INTENT_SELECTED", intent: "Ask for a recommendation" });
      expect(state.selectedIntent).toBe("Ask for a recommendation");
      expect(state.phase).toBe("responded"); // base phase untouched

      state = flowReducer(state, { type: "IMPROVEMENT_LOADED", improvement });
      expect(state.improvement).toEqual(improvement);
      expect(state.phase).toBe("responded"); // still untouched — overlay shows it, not the main diff view
      expect(canShowImprovement(state)).toBe(true);

      // "Keep talking" closes the overlay with a clean slate for the main flow.
      state = flowReducer(state, { type: "HELP_CLOSED" });
      expect(state.helpOpen).toBe(false);
      expect(state.selectedIntent).toBeNull();
      expect(state.improvement).toBeNull();
      expect(state.phase).toBe("responded");
    });

    it("rescue path from the reflection phase does not disturb the main reflection intent options", () => {
      let state = reachReflection();
      state = flowReducer(state, { type: "HELP_OPENED" });
      state = flowReducer(state, { type: "INTENT_SELECTED", intent: "Ask them to wait" });
      state = flowReducer(state, { type: "IMPROVEMENT_LOADED", improvement });
      expect(state.phase).toBe("reflection");
      expect(state.intentOptions).not.toBeNull();

      state = flowReducer(state, { type: "HELP_CLOSED" });
      expect(state.phase).toBe("reflection");
      expect(state.intentOptions).not.toBeNull();
      expect(state.selectedIntent).toBeNull();
    });
  });

  describe("D12: done=true reachable", () => {
    it("done becomes true when the exchange naturally concludes", () => {
      const state = respondedState({ done: true });
      expect(state.done).toBe(true);
      // once done, CONTINUE no longer re-opens the loop
      expect(flowReducer(state, { type: "CONTINUE" })).toBe(state);
    });
  });
});
