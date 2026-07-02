/**
 * SceneStage — the cinematic heart of every screen.
 *
 * Renders location / visual cues / ambient cues as a staged composition
 * (emoji-scale actors, timed appearance, looping ambient motion) rather than
 * a list of text. The situation is never explained in Japanese; the only
 * words inside the stage are English (the NPC's speech and the slug line).
 *
 * `replayKey` restarts the whole staging (used to replay the decisive moment).
 */
import { useEffect, useRef, useState } from "react";
import type { Scene } from "../../shared/types";
import { speakLine } from "../speech";

interface SceneStageProps {
  scene: Scene;
  /** Bump to replay the staging (timers + animations) from the start. */
  replayKey?: number;
  /** NPC's reply to the learner; shown as speech and spoken aloud. */
  npcReply?: string | null;
  /** Keep the NPC visibly "alive" while waiting on the network. */
  thinking?: boolean;
  /** Shrink the stage when a panel below needs the room. */
  compact?: boolean;
}

interface StagePlan {
  /** ms before the NPC opening line appears. */
  openingDelayMs: number;
  /** speechSynthesis rate for the NPC voice. */
  voiceRate: number;
}

function planFor(sceneId: string): StagePlan {
  switch (sceneId) {
    case "did-not-understand":
      // "NPC speaks slightly faster than before"
      return { openingDelayMs: 1000, voiceRate: 1.18 };
    case "cafe-order":
      return { openingDelayMs: 1500, voiceRate: 1 };
    default:
      return { openingDelayMs: 1300, voiceRate: 1 };
  }
}

const CUE_GLYPHS: Array<[RegExp, string]> = [
  [/menu/i, "📋"],
  [/coffee|cafe/i, "☕"],
  [/cashier|clerk|staff/i, "🧑‍💼"],
  [/server|waiter/i, "🚶"],
  [/customer|people|crowd|waiting/i, "🧍"],
  [/receipt/i, "🧾"],
  [/food|plate|dish|table/i, "🍽️"],
  [/bag|luggage/i, "🧳"],
  [/question|ask/i, "💬"],
];

function glyphForCue(cue: string): string {
  for (const [re, glyph] of CUE_GLYPHS) {
    if (re.test(cue)) return glyph;
  }
  return "✨";
}

function CafeComposition() {
  return (
    <>
      <div className="st-wall st-wall-cafe" />
      <div className="st-menuboard st-appear" style={{ animationDelay: "0.2s" }} aria-hidden>
        <span className="st-menu-title">MENU</span>
        <span className="st-menu-line">☕ coffee · 3.50</span>
        <span className="st-menu-line">🥐 croissant · 2.80</span>
      </div>
      <div className="st-counter" />
      <div className="st-actor st-cashier st-appear" style={{ animationDelay: "0.5s" }} aria-hidden>
        🧑‍🍳
      </div>
      <div className="st-prop st-cup st-appear" style={{ animationDelay: "0.9s" }} aria-hidden>
        ☕
        <span className="st-steam" style={{ animationDelay: "1.2s" }}>
          〜
        </span>
        <span className="st-steam st-steam-2" style={{ animationDelay: "2s" }}>
          〜
        </span>
      </div>
      <div className="st-actor st-queue st-appear st-sway" style={{ animationDelay: "2.6s" }} aria-hidden>
        🧍
      </div>
      <div className="st-notes" aria-hidden>
        <span style={{ animationDelay: "0.5s" }}>♪</span>
        <span style={{ animationDelay: "3.4s" }}>♩</span>
      </div>
    </>
  );
}

function DiningComposition() {
  return (
    <>
      <div className="st-wall st-wall-dining" />
      <div className="st-neighbor st-neighbor-left st-appear" style={{ animationDelay: "0.3s" }} aria-hidden>
        <span className="st-neighbor-guest">🧑</span>
        <span className="st-dish st-pop" style={{ animationDelay: "1.3s" }}>
          🍝
        </span>
      </div>
      <div className="st-neighbor st-neighbor-right st-appear" style={{ animationDelay: "0.6s" }} aria-hidden>
        <span className="st-neighbor-guest">👩</span>
        <span className="st-dish st-pop" style={{ animationDelay: "2.5s" }}>
          🍛
        </span>
      </div>
      <div className="st-actor st-passing-server" aria-hidden>
        🚶
      </div>
      <div className="st-mytable st-appear" style={{ animationDelay: "0.9s" }} aria-hidden>
        <span className="st-empty-plate">🍽️</span>
        <span className="st-cutlery">🥄</span>
        <span className="st-waiting-dots">
          <i>·</i>
          <i>·</i>
          <i>·</i>
        </span>
      </div>
    </>
  );
}

function ServiceComposition() {
  return (
    <>
      <div className="st-wall st-wall-service" />
      <div className="st-counter st-counter-service" />
      <div className="st-actor st-clerk st-appear" style={{ animationDelay: "0.4s" }} aria-hidden>
        🧑‍💼
      </div>
      <div className="st-prop st-receipt st-appear st-wave" style={{ animationDelay: "0.9s" }} aria-hidden>
        🧾
      </div>
      <div className="st-notes st-notes-busy" aria-hidden>
        <span style={{ animationDelay: "0s" }}>♪</span>
        <span style={{ animationDelay: "1.4s" }}>♬</span>
        <span style={{ animationDelay: "2.6s" }}>♩</span>
      </div>
      <div className="st-self-thought st-appear" style={{ animationDelay: "2.4s" }} aria-hidden>
        …?
      </div>
    </>
  );
}

function GenericComposition({ scene }: { scene: Scene }) {
  return (
    <>
      <div className="st-wall st-wall-generic" />
      <div className="st-counter" />
      {scene.visualCues.slice(0, 4).map((cue, i) => (
        <div
          key={cue}
          className="st-actor st-generic st-appear"
          style={{ left: `${14 + i * 24}%`, animationDelay: `${0.4 + i * 0.8}s` }}
          aria-hidden
        >
          {glyphForCue(cue)}
        </div>
      ))}
      <div className="st-notes" aria-hidden>
        <span style={{ animationDelay: "1s" }}>♪</span>
      </div>
    </>
  );
}

function Composition({ scene }: { scene: Scene }) {
  switch (scene.id) {
    case "cafe-order":
      return <CafeComposition />;
    case "missing-order":
      return <DiningComposition />;
    case "did-not-understand":
      return <ServiceComposition />;
    default:
      return <GenericComposition scene={scene} />;
  }
}

export default function SceneStage({
  scene,
  replayKey = 0,
  npcReply = null,
  thinking = false,
  compact = false,
}: SceneStageProps) {
  const plan = planFor(scene.id);
  const [openingVisible, setOpeningVisible] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Timed appearance of the NPC opening (restarts on replay).
  useEffect(() => {
    setOpeningVisible(false);
    if (!scene.npcOpening) return;
    const timer = setTimeout(() => {
      setOpeningVisible(true);
      if (!mutedRef.current && scene.npcOpening) speakLine(scene.npcOpening, plan.voiceRate);
    }, plan.openingDelayMs);
    return () => clearTimeout(timer);
  }, [scene.id, scene.npcOpening, replayKey, plan.openingDelayMs, plan.voiceRate]);

  // Speak the NPC's reply when it arrives.
  useEffect(() => {
    if (npcReply && !mutedRef.current) speakLine(npcReply, plan.voiceRate);
  }, [npcReply, plan.voiceRate]);

  const spokenLine = npcReply ?? (openingVisible ? scene.npcOpening : null);

  return (
    <div className={`stage${compact ? " stage-compact" : ""}`} key={`${scene.id}-${replayKey}`}>
      <Composition scene={scene} />
      <div className="st-vignette" aria-hidden />
      <span className="st-slug">{scene.location}</span>
      <button
        type="button"
        className="st-mute"
        aria-label={muted ? "音声をオンにする" : "音声をオフにする"}
        onClick={() => setMuted((m) => !m)}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      {spokenLine ? (
        <div className="st-bubble st-pop" key={spokenLine}>
          <p lang="en">{spokenLine}</p>
          <button
            type="button"
            className="st-replay"
            aria-label="もう一度聞く"
            onClick={() => speakLine(spokenLine, plan.voiceRate)}
          >
            ▶
          </button>
        </div>
      ) : thinking ? (
        <div className="st-bubble st-bubble-thinking st-pop" aria-label="相手が考えています">
          <span className="st-dots">
            <i>·</i>
            <i>·</i>
            <i>·</i>
          </span>
        </div>
      ) : null}
    </div>
  );
}
