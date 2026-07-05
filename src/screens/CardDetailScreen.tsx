/**
 * CardDetailScreen — screen 8: card replay with mastery-stage scaffolding (D5).
 *
 * - Scaffolding fades by stage; 「日本語を表示」 is a temporary reveal that
 *   never touches the store (A9).
 * - A review = one attempt + one evaluation → exactly one
 *   cardStore.recordReview call. When the server can't judge, the learner
 *   self-evaluates (still one recordReview).
 */
import { useState } from "react";
import type { Card, RetryEvaluation, Scene } from "../../shared/types";
import { evaluateRetry } from "../api";
import { cardStore } from "../store/cards";
import { scaffoldingForStage, STAGE_LABELS } from "../mastery";
import SceneStage from "../components/SceneStage";
import MicInput from "../components/MicInput";
import EnglishLine from "../components/EnglishLine";
import StageDots from "../components/StageDots";
import JaAssist from "../components/JaAssist";

interface Attempt {
  utterance: string;
  evaluation: RetryEvaluation | null;
  evalFailed: boolean;
}

interface CardDetailScreenProps {
  card: Card;
  scene: Scene | null;
  onBack(): void;
  onCardsChanged(): void;
}

export default function CardDetailScreen({ card, scene, onBack, onCardsChanged }: CardDetailScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<boolean | null>(null);

  const scaffolding = scaffoldingForStage(card.masteryStage, revealed);

  function record(success: boolean) {
    if (recorded) return; // one recordReview per review
    cardStore.recordReview(card.id, success);
    setRecorded(true);
    setLastSuccess(success);
    onCardsChanged();
  }

  async function handleAttempt(text: string) {
    setBusy(true);
    try {
      const evaluation = await evaluateRetry(card.sceneId, card.selectedIntent, text);
      setAttempt({ utterance: text, evaluation, evalFailed: false });
      record(evaluation.communicated);
    } catch {
      setAttempt({ utterance: text, evaluation: null, evalFailed: true });
    } finally {
      setBusy(false);
    }
  }

  function reviewAgain() {
    setAttempt(null);
    setRecorded(false);
    setLastSuccess(null);
    setRevealed(false);
    setReplayKey((k) => k + 1);
  }

  return (
    <div className="scene-flow card-detail">
      <header className="flow-top">
        <button type="button" className="ghost-btn" onClick={onBack}>
          ← Back
        </button>
        <span className="flow-title card-stage-meta">
          {card.via === "rescue" && <span className="rescue-chip">📌 Rescue</span>}
          <StageDots stage={card.masteryStage} />
          <span className="stage-label">{STAGE_LABELS[card.masteryStage]}</span>
        </span>
      </header>

      {scene ? (
        <SceneStage scene={scene} replayKey={replayKey} thinking={busy} />
      ) : (
        <div className="stage stage-missing">
          <span className="st-slug">{card.sceneId}</span>
        </div>
      )}

      <section className="flow-panel">
        <div className="panel-block">
          {card.via === "rescue" && card.contextNote && (
            <p className="context-note">
              📌 Needed at: <span lang="en">{card.contextNote}</span>
            </p>
          )}

          {scaffolding.promptSpontaneous && !attempt && (
            <p className="coax">Your turn — say it your own way.</p>
          )}

          {scaffolding.showEnglish && (
            <div className="diff-pair">
              <div className="diff-block diff-before">
                <span className="diff-label">You said</span>
                <p>
                  <EnglishLine sentence={card.originalUtterance} />
                </p>
              </div>
              <div className="diff-block diff-after">
                <span className="diff-label">In this scene</span>
                <p className="diff-after-line">
                  <EnglishLine sentence={card.improvedUtterance} chunk={card.primaryDiff} speakable />
                </p>
              </div>
            </div>
          )}

          {scaffolding.showJapanese && (
            <div className="chunk-notes">
              <div className="chunk-note chunk-intent">
                <span className="chunk-label">Intent</span>
                <p lang="en">{card.selectedIntent}</p>
              </div>
              <div className="chunk-note chunk-meaning">
                <span className="chunk-label">Meaning</span>
                {card.meaningEn && <p lang="en">{card.meaningEn}</p>}
                <p lang="ja" className={card.meaningEn ? "chunk-ja-secondary" : undefined}>
                  {card.meaningJa}
                </p>
              </div>
              <div className="chunk-note chunk-reason">
                <span className="chunk-label">Why it fits</span>
                {card.reasonEn && <p lang="en">{card.reasonEn}</p>}
                <p lang="ja" className={card.reasonEn ? "chunk-ja-secondary" : undefined}>
                  {card.reasonJa}
                </p>
              </div>
            </div>
          )}

          {scaffolding.canReveal && (
            <button
              type="button"
              className="ghost-btn reveal-toggle"
              aria-pressed={revealed}
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? "🇯🇵 Hide" : "🇯🇵 Show"}
            </button>
          )}
        </div>

        <div className="panel-block review-block">
          {!attempt && (
            <>
              <p className="coax">Say it again, right here.</p>
              <MicInput onSubmit={handleAttempt} disabled={busy} submitLabel="Say it" />
            </>
          )}

          {attempt && attempt.evaluation && (
            <div className={`verdict ${attempt.evaluation.communicated ? "verdict-ok" : "verdict-soft"}`}>
              <span className="verdict-title">
                {attempt.evaluation.communicated ? "It worked!" : "Almost there"}
              </span>
              <JaAssist ja={attempt.evaluation.note} label="Note" />
            </div>
          )}

          {attempt && attempt.evalFailed && !recorded && (
            <div className="self-eval">
              <div className="notice" role="status">
                Couldn't judge that one. How did it feel?
              </div>
              <div className="actions-row">
                <button type="button" className="primary-btn" onClick={() => record(true)}>
                  I said it
                </button>
                <button type="button" className="ghost-btn" onClick={() => record(false)}>
                  Still tricky
                </button>
              </div>
            </div>
          )}

          {attempt && (
            <p className="recap">
              You said <EnglishLine sentence={`"${attempt.utterance}"`} />
            </p>
          )}

          {recorded && (
            <>
              <p className="soft-hint stage-shift">
                {lastSuccess ? "Nice — this one's sinking in." : "No worries — a bit more support next time."}
              </p>
              <div className="actions-row">
                <button type="button" className="primary-btn" onClick={reviewAgain}>
                  🔁 Try again
                </button>
                <button type="button" className="ghost-btn" onClick={onBack}>
                  ← Back
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
