/**
 * StuckHelpOverlay — D12 rescue path: "What did you want to say?"
 *
 * Slides in from the right over the live conversation. Offers contextual
 * IntentOption buttons (fetched with the running turns) or the learner's own
 * words, then shows the improved expression right there in the overlay. The
 * card is auto-saved (via: "rescue") by the parent as soon as an Improvement
 * arrives; this component only renders what it is given.
 *
 * improve() is only ever triggered through onPick, which the parent wires to
 * the SAME INTENT_SELECTED/IMPROVEMENT_LOADED reducer path used by the main
 * reflection flow — A2 (no improvement before intent) holds here too.
 */
import { useEffect, useState } from "react";
import type { ConversationTurn, Improvement, IntentOption } from "../../shared/types";
import { fetchIntentOptions } from "../api";
import EnglishLine from "./EnglishLine";
import MicInput from "./MicInput";
import UpsellPanel, { type UpsellReason } from "./UpsellPanel";
import JaAssist from "./JaAssist";

interface StuckHelpOverlayProps {
  open: boolean;
  sceneId: string;
  utterance: string | null;
  turns: ConversationTurn[];
  busy: boolean;
  improvement: Improvement | null;
  saved: boolean;
  upsell: UpsellReason | null;
  onPick(intent: string): void;
  onActivated(): void;
  onClose(): void;
}

export default function StuckHelpOverlay({
  open,
  sceneId,
  utterance,
  turns,
  busy,
  improvement,
  saved,
  upsell,
  onPick,
  onActivated,
  onClose,
}: StuckHelpOverlayProps) {
  const [options, setOptions] = useState<IntentOption[] | null>(null);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [optionsFailed, setOptionsFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOptionsBusy(true);
    setOptionsFailed(false);
    fetchIntentOptions(sceneId, utterance ?? "", turns)
      .then((result) => {
        if (!cancelled) setOptions(result.options);
      })
      .catch(() => {
        if (!cancelled) setOptionsFailed(true);
      })
      .finally(() => {
        if (!cancelled) setOptionsBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch each time the overlay opens fresh (new turns since last time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setOptions(null);
      setOptionsFailed(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="help-overlay-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="help-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="What did you want to say?"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-overlay-head">
          <h2 className="help-heading">
            🆘 What did you want to say?
            <JaAssist ja="本当は何を伝えたかった？" label="Heading" />
          </h2>
          <button type="button" className="ghost-btn help-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!improvement && (
          <div className="help-body">
            {optionsBusy && <p className="soft-hint">Finding a few ideas…</p>}
            {optionsFailed && (
              <div className="notice" role="status">
                Couldn't load ideas right now. Say it your own way below.
              </div>
            )}
            {options && (
              <div className="intent-options" role="group" aria-label="Intentions">
                {options.map((option) => (
                  <button
                    key={option.textEn}
                    type="button"
                    className="intent-option"
                    disabled={busy}
                    onClick={() => onPick(option.textEn)}
                  >
                    <span className="intent-option-icon" aria-hidden>
                      {option.icon}
                    </span>
                    <span className="intent-option-en" lang="en">
                      {option.textEn}
                    </span>
                    <JaAssist ja={option.textJa} label={option.textEn} />
                  </button>
                ))}
              </div>
            )}

            <p className="help-or">Or say it your own way:</p>
            <MicInput onSubmit={onPick} disabled={busy} submitLabel="Show me" placeholder="Your own words" />
            {busy && <p className="soft-hint">Finding the right words for this moment…</p>}
          </div>
        )}

        {improvement && (
          <div className="help-body help-result">
            <p className="diff-label">Try this</p>
            <p className="diff-after-line">
              <EnglishLine sentence={improvement.improvedUtterance} chunk={improvement.primaryDiff} speakable />
            </p>
            <div className="chunk-notes">
              <div className="chunk-note chunk-meaning">
                <span className="chunk-label">Meaning</span>
                <p lang="en">{improvement.meaningEn}</p>
                <JaAssist ja={improvement.meaningJa} label="Meaning" />
              </div>
              <div className="chunk-note chunk-reason">
                <span className="chunk-label">Why it fits</span>
                <p lang="en">{improvement.reasonEn}</p>
                <JaAssist ja={improvement.reasonJa} label="Why it fits" />
              </div>
            </div>

            {saved && (
              <p className="help-saved" role="status">
                📌 Saved to your cards
              </p>
            )}
            {upsell && <UpsellPanel reason={upsell} onActivated={onActivated} />}

            <button type="button" className="primary-btn help-continue" onClick={onClose}>
              Keep talking
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
