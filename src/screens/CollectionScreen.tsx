/**
 * CollectionScreen — screen 7: saved cards grouped by scene.
 */
import type { Card, Scene } from "../../shared/types";
import { STAGE_LABELS } from "../mastery";
import StageDots from "../components/StageDots";

interface CollectionScreenProps {
  cards: Card[];
  scenes: Scene[] | null;
  onOpenCard(cardId: string): void;
  onGoToday(): void;
}

export default function CollectionScreen({ cards, scenes, onOpenCard, onGoToday }: CollectionScreenProps) {
  const sceneTitle = (sceneId: string) =>
    scenes?.find((s) => s.id === sceneId)?.title ?? sceneId;

  // Group by scene, keeping the scenes-list order first, unknown scenes after.
  const orderedSceneIds: string[] = [];
  for (const scene of scenes ?? []) {
    if (cards.some((c) => c.sceneId === scene.id)) orderedSceneIds.push(scene.id);
  }
  for (const card of cards) {
    if (!orderedSceneIds.includes(card.sceneId)) orderedSceneIds.push(card.sceneId);
  }

  return (
    <div className="screen collection">
      <header className="app-header">
        <h1 className="today-title">コレクション</h1>
        <p className="today-sub">
          {cards.length > 0 ? `場面から生まれたカード ${cards.length}枚` : "場面から生まれた気づきが、ここに集まります。"}
        </p>
      </header>

      {cards.length === 0 && (
        <div className="empty-state">
          <p>まだカードがありません。</p>
          <button type="button" className="primary-btn" onClick={onGoToday}>
            場面をひとつ体験してみる
          </button>
        </div>
      )}

      {orderedSceneIds.map((sceneId) => (
        <section key={sceneId} className="card-group">
          <h2 className="section-title">{sceneTitle(sceneId)}</h2>
          <div className="card-list">
            {cards
              .filter((c) => c.sceneId === sceneId)
              .map((card) => (
                <button key={card.id} type="button" className="card-row" onClick={() => onOpenCard(card.id)}>
                  <span className="card-row-en" lang="en">
                    {card.improvedUtterance}
                  </span>
                  <span className="card-row-meta">
                    <StageDots stage={card.masteryStage} />
                    <span className="stage-label">{STAGE_LABELS[card.masteryStage]}</span>
                  </span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
