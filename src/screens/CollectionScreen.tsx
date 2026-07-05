/**
 * CollectionScreen — screen 7: saved cards grouped by scene.
 * D12: rescue cards (via: "rescue") get their own "📌 Rescue words" group
 * per scene, showing the contextNote (the moment they were needed).
 */
import type { Card, Scene } from "../../shared/types";
import { STAGE_LABELS } from "../mastery";
import StageDots from "../components/StageDots";

interface CollectionScreenProps {
  cards: Card[];
  scenes: Scene[] | null;
  licensed: boolean;
  onOpenCard(cardId: string): void;
  onGoToday(): void;
  onOpenPro(): void;
}

export default function CollectionScreen({
  cards,
  scenes,
  licensed,
  onOpenCard,
  onGoToday,
  onOpenPro,
}: CollectionScreenProps) {
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
        <h1 className="today-title">
          🗂 Cards
          {licensed && <span className="pro-chip">Pro</span>}
        </h1>
        <p className="today-sub">
          {cards.length > 0 ? `${cards.length} cards from your scenes` : "Cards from your scenes will collect here."}
        </p>
      </header>

      {cards.length === 0 && (
        <div className="empty-state">
          <p>No cards yet.</p>
          <button type="button" className="primary-btn" onClick={onGoToday}>
            Try a scene
          </button>
        </div>
      )}

      {orderedSceneIds.map((sceneId) => {
        const sceneCards = cards.filter((c) => c.sceneId === sceneId);
        const diffCards = sceneCards.filter((c) => c.via !== "rescue");
        const rescueCards = sceneCards.filter((c) => c.via === "rescue");
        return (
          <section key={sceneId} className="card-group">
            <h2 className="section-title">{sceneTitle(sceneId)}</h2>
            {diffCards.length > 0 && (
              <div className="card-list">
                {diffCards.map((card) => (
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
            )}

            {rescueCards.length > 0 && (
              <div className="rescue-group">
                <h3 className="rescue-group-title">📌 Rescue words</h3>
                <div className="card-list">
                  {rescueCards.map((card) => (
                    <button key={card.id} type="button" className="card-row card-row-rescue" onClick={() => onOpenCard(card.id)}>
                      <span className="card-row-en" lang="en">
                        {card.improvedUtterance}
                      </span>
                      {card.contextNote && (
                        <span className="card-row-context" lang="en">
                          from: “{card.contextNote}”
                        </span>
                      )}
                      <span className="card-row-meta">
                        <StageDots stage={card.masteryStage} />
                        <span className="stage-label">{STAGE_LABELS[card.masteryStage]}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {!licensed && (
        <footer className="pro-entry">
          <button type="button" className="ghost-btn subtle" onClick={onOpenPro}>
            About Pro — unlimited coaching &amp; cards
          </button>
        </footer>
      )}
    </div>
  );
}
