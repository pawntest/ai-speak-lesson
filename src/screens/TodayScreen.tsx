/**
 * TodayScreen — screen 1: scene selection + due reviews (D7).
 */
import type { Card, Scene } from "../../shared/types";
import { reviewQueue, STAGE_LABELS } from "../mastery";
import StageDots from "../components/StageDots";

const SCENE_GLYPHS: Record<string, string> = {
  "cafe-order": "☕",
  "missing-order": "🍽️",
  "did-not-understand": "🧾",
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: "🌱 Beginner",
  intermediate: "🌿 Intermediate",
  advanced: "🌳 Advanced",
};

interface TodayScreenProps {
  scenes: Scene[] | null;
  scenesFailed: boolean;
  cards: Card[];
  licensed: boolean;
  onOpenScene(scene: Scene): void;
  onOpenCard(cardId: string): void;
  onRetryScenes(): void;
}

export default function TodayScreen({
  scenes,
  scenesFailed,
  cards,
  licensed,
  onOpenScene,
  onOpenCard,
  onRetryScenes,
}: TodayScreenProps) {
  const due = reviewQueue(cards).slice(0, 3);
  const cardCount = (sceneId: string) => cards.filter((c) => c.sceneId === sceneId).length;

  return (
    <div className="screen today">
      <header className="app-header">
        <span className="wordmark">
          context <em>diff</em> english
          {licensed && <span className="pro-chip">Pro</span>}
        </span>
        <h1 className="today-title">🎬 Today</h1>
        <p className="today-sub">Pick a scene. Say one word — that's enough to start.</p>
      </header>

      {scenesFailed && (
        <div className="notice" role="status">
          Couldn't load scenes. Check your connection and try again.{" "}
          <button type="button" className="ghost-btn" onClick={onRetryScenes}>
            Reload
          </button>
        </div>
      )}

      {scenes === null && !scenesFailed && <p className="soft-hint">Setting up scenes…</p>}

      <div className="scene-list">
        {scenes?.map((scene) => {
          const count = cardCount(scene.id);
          return (
            <button key={scene.id} type="button" className="scene-card" onClick={() => onOpenScene(scene)}>
              <span className="scene-glyph" aria-hidden>
                {SCENE_GLYPHS[scene.id] ?? "🎬"}
              </span>
              <span className="scene-card-body">
                <span className="scene-card-title">{scene.title}</span>
                <span className="scene-card-meta">
                  <span className="level-chip">{LEVEL_LABELS[scene.level] ?? scene.level}</span>
                  {count > 0 && <span className="count-chip">📌 {count}</span>}
                </span>
              </span>
              <span className="scene-card-go" aria-hidden>
                →
              </span>
            </button>
          );
        })}
      </div>

      {due.length > 0 && (
        <section className="due-section">
          <h2 className="section-title">🔁 Due for review</h2>
          <div className="due-list">
            {due.map((card) => (
              <button key={card.id} type="button" className="due-row" onClick={() => onOpenCard(card.id)}>
                <span className="due-en" lang="en">
                  {card.improvedUtterance}
                </span>
                <span className="due-meta">
                  <StageDots stage={card.masteryStage} />
                  <span className="stage-label">{STAGE_LABELS[card.masteryStage]}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
