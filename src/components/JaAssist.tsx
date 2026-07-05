/**
 * JaAssist — D11 language system: UI chrome is simple English + icons;
 * Japanese only ever appears behind a tap-reveal 🇯🇵 chip (this component),
 * plus one global header toggle (JaAssistHeaderToggle) that can hide every
 * chip at once. Default: assist ON while the learner's average saved-card
 * masteryStage is below 1.5, OFF once it rises past that (D5/D11 fade); a
 * manual toggle always overrides the computed default.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Card } from "../../shared/types";
import { averageMasteryStage } from "../mastery";

const STORAGE_KEY = "ai-speak-lesson.jaAssist.v1";

interface JaAssistContextValue {
  enabled: boolean;
  toggle(): void;
}

const JaAssistContext = createContext<JaAssistContextValue>({ enabled: true, toggle: () => {} });

function readOverride(): boolean | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
    return null;
  } catch {
    return null;
  }
}

function writeOverride(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // best-effort only
  }
}

interface JaAssistProviderProps {
  cards: Card[];
  children: ReactNode;
}

export function JaAssistProvider({ cards, children }: JaAssistProviderProps) {
  const defaultEnabled = averageMasteryStage(cards) < 1.5;
  const [override, setOverride] = useState<boolean | null>(() => readOverride());
  const enabled = override ?? defaultEnabled;

  const value = useMemo<JaAssistContextValue>(
    () => ({
      enabled,
      toggle() {
        setOverride((prev) => {
          const next = !(prev ?? defaultEnabled);
          writeOverride(next);
          return next;
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled],
  );

  return <JaAssistContext.Provider value={value}>{children}</JaAssistContext.Provider>;
}

export function useJaAssist(): JaAssistContextValue {
  return useContext(JaAssistContext);
}

/** Single global header control cycling JA assist on/off (D11). */
export function JaAssistHeaderToggle() {
  const { enabled, toggle } = useJaAssist();
  return (
    <button
      type="button"
      className={`ja-assist-toggle${enabled ? " ja-assist-on" : ""}`}
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Hide Japanese assist" : "Show Japanese assist"}
      title={enabled ? "JA assist: on" : "JA assist: off"}
    >
      🇯🇵
    </button>
  );
}

interface JaAssistProps {
  /** The Japanese text revealed on tap. Renders nothing when empty. */
  ja: string | null | undefined;
  /** Accessible label read before the chip (not shown visually). */
  label?: string;
}

/**
 * Tap-reveal JA chip. Hidden entirely when the global assist is off (single
 * header toggle controls every chip at once); otherwise a small 🇯🇵 button
 * that toggles its own JA text inline.
 */
export default function JaAssist({ ja, label = "Japanese" }: JaAssistProps) {
  const { enabled } = useJaAssist();
  const [revealed, setRevealed] = useState(false);
  if (!enabled || !ja) return null;
  return (
    <span className="ja-assist">
      <button
        type="button"
        className="ja-assist-chip"
        aria-pressed={revealed}
        aria-label={`${label} 🇯🇵`}
        onClick={() => setRevealed((r) => !r)}
      >
        🇯🇵
      </button>
      {revealed && (
        <span className="ja-assist-text" lang="ja">
          {ja}
        </span>
      )}
    </span>
  );
}
