/**
 * SceneFlow — screens 2–6: scene experience → response → reflection →
 * context-difference → retry. The scene stage stays mounted (and alive)
 * the whole time; panels below change with the flow phase.
 *
 * D12: the experience/responded loop repeats (CONTINUE) until the exchange
 * is naturally `done`; a persistent 🆘 Help button opens StuckHelpOverlay at
 * any point in that loop, running the SAME INTENT_SELECTED/IMPROVEMENT_LOADED
 * reducer path as the main reflection flow (A2 holds for rescue cards too).
 *
 * improve() is only ever called from handleIntent/handleHelpIntent —
 * structurally after an intention has been chosen (A2). The reducer guards
 * it a second time.
 */
import { useCallback, useEffect, useReducer, useState } from "react";
import type { ConversationTurn, Scene } from "../../shared/types";
import { evaluateRetry, fetchIntentOptions, improve, respond, QuotaExceededError } from "../api";
import { cardStore } from "../store/cards";
import { flowReducer, initialFlowState } from "../flow";
import SceneStage from "../components/SceneStage";
import MicInput from "../components/MicInput";
import EnglishLine from "../components/EnglishLine";
import UpsellPanel, { type UpsellReason } from "../components/UpsellPanel";
import JaAssist from "../components/JaAssist";
import StuckHelpOverlay from "../components/StuckHelpOverlay";

const SERVER_NOT_READY = "The server isn't ready yet — your words are kept here, so you can carry on.";

/** D8: free plan saves up to 10 cards (server enforces the coach quota). */
export const FREE_CARD_LIMIT = 10;

interface SceneFlowProps {
  scene: Scene;
  licensed: boolean;
  onLicensed(): void;
  onExit(): void;
  onCardsChanged(): void;
}

function ConversationTranscript({ turns }: { turns: ConversationTurn[] }) {
  if (turns.length === 0) return null;
  const recent = turns.slice(-6);
  return (
    <div className="transcript" aria-label="Conversation so far">
      {recent.map((turn, i) => {
        const latest = i === recent.length - 1;
        return (
          <p
            key={`${i}-${turn.speaker}`}
            className={`transcript-line transcript-${turn.speaker}${latest ? " transcript-latest" : ""}`}
          >
            <span className="transcript-icon" aria-hidden>
              {turn.speaker === "learner" ? "🗣️" : "💬"}
            </span>
            <span lang="en">{turn.text}</span>
          </p>
        );
      })}
    </div>
  );
}

export default function SceneFlow({ scene, licensed, onLicensed, onExit, onCardsChanged }: SceneFlowProps) {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [busy, setBusy] = useState(false);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [freeIntent, setFreeIntent] = useState("");
  const [upsell, setUpsell] = useState<UpsellReason | null>(null);

  const [helpBusy, setHelpBusy] = useState(false);
  const [helpSavedCardId, setHelpSavedCardId] = useState<string | null>(null);
  const [helpUpsell, setHelpUpsell] = useState<UpsellReason | null>(null);

  const { phase } = state;

  const loadOptions = useCallback(async () => {
    if (state.utterance === null) return;
    setOptionsBusy(true);
    try {
      const result = await fetchIntentOptions(scene.id, state.utterance, state.turns);
      dispatch({ type: "OPTIONS_LOADED", options: result.options });
    } catch {
      dispatch({ type: "OPTIONS_FAILED" });
    } finally {
      setOptionsBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, state.utterance]);

  // Fetch intent options when reflection opens (once; kept across intents).
  useEffect(() => {
    if (phase === "reflection" && state.intentOptions === null && !state.optionsFailed) {
      void loadOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function handleUtterance(text: string) {
    // D12: no-op unless we're mid-conversation, waiting on the next reply.
    dispatch({ type: "CONTINUE" });
    setBusy(true);
    try {
      const result = await respond(scene.id, text, state.turns);
      dispatch({
        type: "RESPONDED",
        utterance: text,
        npcReply: result.npcReply,
        completionNote: result.completionNote,
        adequate: result.adequate,
        adequacyNote: result.adequacyNote,
        done: result.done,
      });
    } catch {
      dispatch({ type: "RESPOND_FAILED", utterance: text });
    } finally {
      setBusy(false);
    }
  }

  async function handleIntent(intent: string) {
    const trimmed = intent.trim();
    if (!trimmed || state.utterance === null || busy) return;
    dispatch({ type: "INTENT_SELECTED", intent: trimmed });
    setBusy(true);
    try {
      const improvement = await improve(scene.id, state.utterance, trimmed);
      dispatch({ type: "IMPROVEMENT_LOADED", improvement });
      setSavedCardId(null);
      setUpsell(null);
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        setUpsell("quota");
      } else {
        dispatch({ type: "IMPROVE_FAILED" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleHelpIntent(intent: string) {
    const trimmed = intent.trim();
    if (!trimmed || state.utterance === null || helpBusy) return;
    dispatch({ type: "INTENT_SELECTED", intent: trimmed });
    setHelpBusy(true);
    try {
      const improvement = await improve(scene.id, state.utterance, trimmed);
      dispatch({ type: "IMPROVEMENT_LOADED", improvement });
      if (!licensed && cardStore.listCards().length >= FREE_CARD_LIMIT) {
        setHelpUpsell("cards");
        setHelpSavedCardId(null);
      } else {
        const lastNpcLine = [...state.turns].reverse().find((t) => t.speaker === "npc")?.text ?? undefined;
        const card = cardStore.saveCard({
          sceneId: scene.id,
          originalUtterance: improvement.originalUtterance,
          selectedIntent: improvement.selectedIntent,
          improvedUtterance: improvement.improvedUtterance,
          primaryDiff: improvement.primaryDiff,
          meaningEn: improvement.meaningEn,
          reasonEn: improvement.reasonEn,
          meaningJa: improvement.meaningJa,
          reasonJa: improvement.reasonJa,
          via: "rescue",
          contextNote: lastNpcLine,
        });
        setHelpSavedCardId(card.id);
        setHelpUpsell(null);
        onCardsChanged();
      }
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        setHelpUpsell("quota");
      } else {
        dispatch({ type: "IMPROVE_FAILED" });
      }
    } finally {
      setHelpBusy(false);
    }
  }

  function closeHelp() {
    dispatch({ type: "HELP_CLOSED" });
    setHelpSavedCardId(null);
    setHelpUpsell(null);
  }

  function startRetry() {
    dispatch({ type: "RETRY_STARTED" });
    setReplayKey((k) => k + 1);
  }

  async function handleRetryUtterance(text: string) {
    if (state.selectedIntent === null) return;
    setBusy(true);
    try {
      const evaluation = await evaluateRetry(scene.id, state.selectedIntent, text);
      dispatch({ type: "RETRY_EVALUATED", utterance: text, evaluation });
    } catch {
      dispatch({ type: "RETRY_EVAL_FAILED", utterance: text });
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    if (!state.improvement) return;
    if (!licensed && cardStore.listCards().length >= FREE_CARD_LIMIT) {
      setUpsell("cards");
      return;
    }
    const card = cardStore.saveCard({
      sceneId: scene.id,
      originalUtterance: state.improvement.originalUtterance,
      selectedIntent: state.improvement.selectedIntent,
      improvedUtterance: state.improvement.improvedUtterance,
      primaryDiff: state.improvement.primaryDiff,
      meaningEn: state.improvement.meaningEn,
      reasonEn: state.improvement.reasonEn,
      meaningJa: state.improvement.meaningJa,
      reasonJa: state.improvement.reasonJa,
      via: "diff",
    });
    setSavedCardId(card.id);
    onCardsChanged();
  }

  function anotherIntent() {
    dispatch({ type: "ANOTHER_INTENT" });
    setSavedCardId(null);
    setFreeIntent("");
  }

  function handleActivated() {
    onLicensed();
    setUpsell(null);
  }

  const saved = savedCardId !== null;
  const stageCompact = phase === "reflection" || phase === "diff" || phase === "retryResult";
  const showNpcReply = phase === "responded" && !state.respondFailed ? state.npcReply : null;
  const showConversationPanel = phase === "experience" || (phase === "responded" && !state.done);
  const canOpenHelp = phase === "experience" || phase === "responded";

  return (
    <div className="scene-flow">
      <header className="flow-top">
        <button type="button" className="ghost-btn" onClick={onExit}>
          ← Today
        </button>
        <span className="flow-title">{scene.title}</span>
        {canOpenHelp && (
          <button
            type="button"
            className="help-btn"
            onClick={() => dispatch({ type: "HELP_OPENED" })}
          >
            🆘 Help…?
          </button>
        )}
      </header>

      <SceneStage
        scene={scene}
        replayKey={replayKey}
        npcReply={showNpcReply}
        thinking={busy && (phase === "experience" || phase === "retry")}
        compact={stageCompact}
      />

      <ConversationTranscript turns={state.turns} />

      <section className="flow-panel">
        {showConversationPanel && (
          <div className="panel-block">
            {state.respondFailed && (
              <div className="notice" role="status">
                {SERVER_NOT_READY}
              </div>
            )}
            {phase === "responded" && !state.respondFailed && state.completionNote && (
              <p className="completion-note">
                Heads up <JaAssist ja={state.completionNote} label="Heads up" />
              </p>
            )}
            {phase === "responded" && !state.respondFailed && state.adequate && (
              <div className="verdict verdict-ok verdict-inline">
                <span className="verdict-title">It worked!</span>
                {state.adequacyNote && <JaAssist ja={state.adequacyNote} label="It worked" />}
              </div>
            )}
            <p className="coax">Your turn — one word is fine.</p>
            <MicInput onSubmit={handleUtterance} disabled={busy} autoFocus />
            <button type="button" className="ghost-btn subtle" onClick={() => dispatch({ type: "REFLECT" })}>
              💭 What did I want to say?
            </button>
          </div>
        )}

        {phase === "responded" && state.done && (
          <div className="panel-block wrap-panel">
            <p className="wrap-title">Nice! You did it. 🎉</p>
            {state.adequate && state.adequacyNote && (
              <div className="verdict verdict-ok">
                <span className="verdict-title">It worked!</span>
                <JaAssist ja={state.adequacyNote} label="It worked" />
              </div>
            )}
            <div className="actions">
              <button type="button" className="primary-btn" onClick={onExit}>
                Next scene →
              </button>
              <button type="button" className="ghost-btn" onClick={() => dispatch({ type: "REFLECT" })}>
                💭 Reflect
              </button>
            </div>
          </div>
        )}

        {phase === "reflection" && (
          <div className="panel-block">
            <h2 className="reflect-heading">
              What did you want to say? <JaAssist ja="本当は何を伝えたかった？" label="Heading" />
            </h2>
            <p className="recap">
              You said <EnglishLine sentence={`"${state.utterance ?? ""}"`} />
            </p>

            {optionsBusy && <p className="soft-hint">Finding a few ideas…</p>}
            {state.optionsFailed && (
              <div className="notice" role="status">
                Couldn't load ideas. {SERVER_NOT_READY} You can still type your own below.{" "}
                <button type="button" className="ghost-btn" onClick={() => void loadOptions()}>
                  Try again
                </button>
              </div>
            )}

            {state.intentOptions && (
              <div className="intent-options" role="group" aria-label="Intentions">
                {state.intentOptions.map((option) => (
                  <div key={option.textEn} className="intent-option">
                    <button
                      type="button"
                      className="intent-option-pick"
                      disabled={busy}
                      onClick={() => void handleIntent(option.textEn)}
                    >
                      <span className="intent-option-icon" aria-hidden>
                        {option.icon}
                      </span>
                      <span className="intent-option-en" lang="en">
                        {option.textEn}
                      </span>
                    </button>
                    <JaAssist ja={option.textJa} label={option.textEn} />
                  </div>
                ))}
              </div>
            )}

            <form
              className="intent-free"
              onSubmit={(e) => {
                e.preventDefault();
                void handleIntent(freeIntent);
              }}
            >
              <label htmlFor="free-intent">Or type your own idea</label>
              <div className="intent-free-row">
                <input
                  id="free-intent"
                  type="text"
                  value={freeIntent}
                  onChange={(e) => setFreeIntent(e.target.value)}
                  placeholder="e.g. I wanted a recommendation"
                  disabled={busy}
                />
                <button type="submit" className="say-submit" disabled={busy || !freeIntent.trim()}>
                  Reflect
                </button>
              </div>
            </form>

            {state.improveFailed && (
              <div className="notice" role="status">
                Couldn't load a suggestion. {SERVER_NOT_READY}
              </div>
            )}
            {busy && <p className="soft-hint">Finding the right words for this scene…</p>}
            {upsell === "quota" && <UpsellPanel reason="quota" onActivated={handleActivated} />}
          </div>
        )}

        {phase === "diff" && state.improvement && (
          <div className="panel-block diff-view">
            <p className="intent-tag">To say: “{state.improvement.selectedIntent}”</p>
            <div className="diff-pair">
              <div className="diff-block diff-before">
                <span className="diff-label">You said</span>
                <p>
                  <EnglishLine sentence={state.improvement.originalUtterance} />
                </p>
              </div>
              <div className="diff-block diff-after">
                <span className="diff-label">In this scene</span>
                <p className="diff-after-line">
                  <EnglishLine
                    sentence={state.improvement.improvedUtterance}
                    chunk={state.improvement.primaryDiff}
                    speakable
                  />
                </p>
              </div>
            </div>
            <div className="chunk-notes">
              <div className="chunk-note chunk-meaning">
                <span className="chunk-label">Meaning</span>
                <p lang="en">{state.improvement.meaningEn}</p>
                <JaAssist ja={state.improvement.meaningJa} label="Meaning" />
              </div>
              <div className="chunk-note chunk-reason">
                <span className="chunk-label">Why it fits</span>
                <p lang="en">{state.improvement.reasonEn}</p>
                <JaAssist ja={state.improvement.reasonJa} label="Why it fits" />
              </div>
            </div>
            <div className="actions">
              <button type="button" className="primary-btn" onClick={startRetry}>
                🔊 Say it out loud
              </button>
              <div className="actions-row">
                <button type="button" className="ghost-btn" onClick={handleSave} disabled={saved}>
                  {saved ? "📌 Saved ✓" : "📌 Save card"}
                </button>
                <button type="button" className="ghost-btn" onClick={anotherIntent}>
                  Another intention
                </button>
              </div>
            </div>
            {upsell === "cards" && <UpsellPanel reason="cards" onActivated={handleActivated} />}
          </div>
        )}

        {phase === "retry" && (
          <div className="panel-block">
            <p className="coax">Same moment again — “{state.selectedIntent}”. Say it so it lands.</p>
            <MicInput onSubmit={handleRetryUtterance} disabled={busy} submitLabel="Say it again" autoFocus />
          </div>
        )}

        {phase === "retryResult" && (
          <div className="panel-block">
            {state.retryEvaluation ? (
              <div className={`verdict ${state.retryEvaluation.communicated ? "verdict-ok" : "verdict-soft"}`}>
                <span className="verdict-title">
                  {state.retryEvaluation.communicated ? "It worked!" : "Almost there"}
                </span>
                <JaAssist ja={state.retryEvaluation.note} label="Note" />
              </div>
            ) : (
              <div className="notice" role="status">
                {SERVER_NOT_READY} Saying it out loud is already good practice.
              </div>
            )}
            {state.retryUtterance && (
              <p className="recap">
                You said <EnglishLine sentence={`"${state.retryUtterance}"`} />
              </p>
            )}
            <div className="actions">
              <button type="button" className="primary-btn" onClick={handleSave} disabled={saved}>
                {saved ? "📌 Saved ✓" : "📌 Save card"}
              </button>
              <div className="actions-row">
                <button type="button" className="ghost-btn" onClick={startRetry}>
                  🔁 Try again
                </button>
                <button type="button" className="ghost-btn" onClick={anotherIntent}>
                  Another intention
                </button>
              </div>
              <button type="button" className="ghost-btn subtle" onClick={onExit}>
                ← Today
              </button>
            </div>
            {upsell === "cards" && <UpsellPanel reason="cards" onActivated={handleActivated} />}
          </div>
        )}
      </section>

      <StuckHelpOverlay
        open={state.helpOpen}
        sceneId={scene.id}
        utterance={state.utterance}
        turns={state.turns}
        busy={helpBusy}
        improvement={state.improvement}
        saved={helpSavedCardId !== null}
        upsell={helpUpsell}
        onPick={(intent) => void handleHelpIntent(intent)}
        onActivated={() => {
          setHelpUpsell(null);
          onLicensed();
        }}
        onClose={closeHelp}
      />
    </div>
  );
}
