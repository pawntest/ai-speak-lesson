/**
 * SceneFlow — screens 2–6: scene experience → response → reflection →
 * context-difference → retry. The scene stage stays mounted (and alive)
 * the whole time; panels below change with the flow phase.
 *
 * improve() is only ever called from handleIntent — structurally after an
 * intention has been chosen (A2). The reducer guards it a second time.
 */
import { useCallback, useEffect, useReducer, useState } from "react";
import type { Scene } from "../../shared/types";
import { evaluateRetry, fetchIntentOptions, improve, respond, QuotaExceededError } from "../api";
import { cardStore } from "../store/cards";
import { flowReducer, initialFlowState } from "../flow";
import SceneStage from "../components/SceneStage";
import MicInput from "../components/MicInput";
import EnglishLine from "../components/EnglishLine";
import UpsellPanel, { type UpsellReason } from "../components/UpsellPanel";

const SERVER_NOT_READY = "サーバーの準備がまだ整っていないみたいです。";

/** D8: free plan saves up to 10 cards (server enforces the coach quota). */
export const FREE_CARD_LIMIT = 10;

interface SceneFlowProps {
  scene: Scene;
  licensed: boolean;
  onLicensed(): void;
  onExit(): void;
  onCardsChanged(): void;
}

export default function SceneFlow({ scene, licensed, onLicensed, onExit, onCardsChanged }: SceneFlowProps) {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [busy, setBusy] = useState(false);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [freeIntent, setFreeIntent] = useState("");
  const [upsell, setUpsell] = useState<UpsellReason | null>(null);

  const { phase } = state;

  const loadOptions = useCallback(async () => {
    if (state.utterance === null) return;
    setOptionsBusy(true);
    try {
      const result = await fetchIntentOptions(scene.id, state.utterance);
      dispatch({ type: "OPTIONS_LOADED", options: result.options });
    } catch {
      dispatch({ type: "OPTIONS_FAILED" });
    } finally {
      setOptionsBusy(false);
    }
  }, [scene.id, state.utterance]);

  // Fetch intent options when reflection opens (once; kept across intents).
  useEffect(() => {
    if (phase === "reflection" && state.intentOptions === null && !state.optionsFailed) {
      void loadOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function handleFirstUtterance(text: string) {
    setBusy(true);
    try {
      const result = await respond(scene.id, text);
      dispatch({
        type: "RESPONDED",
        utterance: text,
        npcReply: result.npcReply,
        completionNote: result.completionNote,
        adequate: result.adequate,
        adequacyNote: result.adequacyNote,
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
      meaningJa: state.improvement.meaningJa,
      reasonJa: state.improvement.reasonJa,
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

  return (
    <div className="scene-flow">
      <header className="flow-top">
        <button type="button" className="ghost-btn" onClick={onExit}>
          ← 今日へ
        </button>
        <span className="flow-title">{scene.title}</span>
      </header>

      <SceneStage
        scene={scene}
        replayKey={replayKey}
        npcReply={showNpcReply}
        thinking={busy && (phase === "experience" || phase === "retry")}
        compact={stageCompact}
      />

      <section className="flow-panel">
        {phase === "experience" && (
          <div className="panel-block">
            <p className="coax">あなたの番。声でも、入力でも。一言でだいじょうぶ。</p>
            <MicInput onSubmit={handleFirstUtterance} disabled={busy} autoFocus />
          </div>
        )}

        {phase === "responded" && (
          <div className="panel-block">
            {state.respondFailed && (
              <div className="notice" role="status">
                {SERVER_NOT_READY}
                あなたの言葉はこの場で受け取りました。このまま振り返りに進めます。
              </div>
            )}
            <p className="recap">
              あなた <EnglishLine sentence={`“${state.utterance ?? ""}”`} />
            </p>
            {state.completionNote && (
              <p className="completion-note" lang="en">
                {state.completionNote}
              </p>
            )}
            {state.adequate ? (
              /* D9: the words already worked — celebrate; reflection is optional. */
              <div className="adequate-block">
                <div className="verdict verdict-ok">
                  <span className="verdict-title">伝わりました！</span>
                  {state.adequacyNote && <p className="verdict-note">{state.adequacyNote}</p>}
                </div>
                <div className="actions">
                  <button type="button" className="primary-btn" onClick={onExit}>
                    次の場面へ
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => dispatch({ type: "REFLECT" })}>
                    それでも振り返ってみる
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="primary-btn" onClick={() => dispatch({ type: "REFLECT" })}>
                本当は何を伝えたかった？
              </button>
            )}
          </div>
        )}

        {phase === "reflection" && (
          <div className="panel-block">
            <h2 className="reflect-heading">本当は何を伝えたかった？</h2>
            <p className="recap">
              あなた <EnglishLine sentence={`“${state.utterance ?? ""}”`} />
            </p>

            {optionsBusy && <p className="soft-hint">選択肢を用意しています…</p>}
            {state.optionsFailed && (
              <div className="notice" role="status">
                候補を用意できませんでした。{SERVER_NOT_READY}
                下の欄に自分の言葉で書けます。{" "}
                <button type="button" className="ghost-btn" onClick={() => void loadOptions()}>
                  もう一度取得
                </button>
              </div>
            )}

            {state.intentOptions && (
              <div className="intent-options" role="group" aria-label="伝えたかったこと">
                {state.intentOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="intent-option"
                    disabled={busy}
                    onClick={() => void handleIntent(option)}
                  >
                    {option}
                  </button>
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
              <label htmlFor="free-intent">その他 / 自分で入力</label>
              <div className="intent-free-row">
                <input
                  id="free-intent"
                  type="text"
                  value={freeIntent}
                  onChange={(e) => setFreeIntent(e.target.value)}
                  placeholder="例：もう少し待ってほしかった"
                  disabled={busy}
                />
                <button type="submit" className="say-submit" disabled={busy || !freeIntent.trim()}>
                  これで振り返る
                </button>
              </div>
            </form>

            {state.improveFailed && (
              <div className="notice" role="status">
                言い方の提案を取得できませんでした。{SERVER_NOT_READY}
                少し待って、もう一度選んでみてください。
              </div>
            )}
            {busy && <p className="soft-hint">この場面に合う言い方をさがしています…</p>}
            {upsell === "quota" && <UpsellPanel reason="quota" onActivated={handleActivated} />}
          </div>
        )}

        {phase === "diff" && state.improvement && (
          <div className="panel-block diff-view">
            <p className="intent-tag">「{state.improvement.selectedIntent}」を伝えるなら</p>
            <div className="diff-pair">
              <div className="diff-block diff-before">
                <span className="diff-label">あなたの言葉</span>
                <p>
                  <EnglishLine sentence={state.improvement.originalUtterance} />
                </p>
              </div>
              <div className="diff-block diff-after">
                <span className="diff-label">この場面なら</span>
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
                <span className="chunk-label">意味</span>
                <p>{state.improvement.meaningJa}</p>
              </div>
              <div className="chunk-note chunk-reason">
                <span className="chunk-label">この場面でのニュアンス</span>
                <p>{state.improvement.reasonJa}</p>
              </div>
            </div>
            <div className="actions">
              <button type="button" className="primary-btn" onClick={startRetry}>
                いま声に出して言ってみよう
              </button>
              <div className="actions-row">
                <button type="button" className="ghost-btn" onClick={handleSave} disabled={saved}>
                  {saved ? "カードに保存済み ✓" : "カードに保存"}
                </button>
                <button type="button" className="ghost-btn" onClick={anotherIntent}>
                  別の意図で振り返る
                </button>
              </div>
            </div>
            {upsell === "cards" && <UpsellPanel reason="cards" onActivated={handleActivated} />}
          </div>
        )}

        {phase === "retry" && (
          <div className="panel-block">
            <p className="coax">
              同じ瞬間にもどりました。「{state.selectedIntent}」— 今度は伝わるように。
            </p>
            <MicInput onSubmit={handleRetryUtterance} disabled={busy} submitLabel="もう一度伝える" autoFocus />
          </div>
        )}

        {phase === "retryResult" && (
          <div className="panel-block">
            {state.retryEvaluation ? (
              <div className={`verdict ${state.retryEvaluation.communicated ? "verdict-ok" : "verdict-soft"}`}>
                <span className="verdict-title">
                  {state.retryEvaluation.communicated ? "伝わった！" : "もう少しで伝わりそう"}
                </span>
                <p className="verdict-note">{state.retryEvaluation.note}</p>
              </div>
            ) : (
              <div className="notice" role="status">
                判定はまだできませんでした。{SERVER_NOT_READY}
                声に出せたこと自体が、いちばんの練習です。
              </div>
            )}
            {state.retryUtterance && (
              <p className="recap">
                あなた <EnglishLine sentence={`“${state.retryUtterance}”`} />
              </p>
            )}
            <div className="actions">
              <button type="button" className="primary-btn" onClick={handleSave} disabled={saved}>
                {saved ? "カードに保存済み ✓" : "この気づきをカードに保存"}
              </button>
              <div className="actions-row">
                <button type="button" className="ghost-btn" onClick={startRetry}>
                  もう一度この瞬間へ
                </button>
                <button type="button" className="ghost-btn" onClick={anotherIntent}>
                  別の意図で振り返る
                </button>
              </div>
              <button type="button" className="ghost-btn subtle" onClick={onExit}>
                今日の場面へ戻る
              </button>
            </div>
            {upsell === "cards" && <UpsellPanel reason="cards" onActivated={handleActivated} />}
          </div>
        )}
      </section>
    </div>
  );
}
