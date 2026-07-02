/**
 * App — top-level screen switcher (no router; a simple screen union).
 * Screens: today / scene flow (2–6) / collection / card detail / pro.
 */
import { useCallback, useEffect, useState } from "react";
import type { Card, Scene } from "../shared/types";
import { fetchScenes, hasStoredLicense } from "./api";
import { cardStore } from "./store/cards";
import TodayScreen from "./screens/TodayScreen";
import SceneFlow from "./screens/SceneFlow";
import CollectionScreen from "./screens/CollectionScreen";
import CardDetailScreen from "./screens/CardDetailScreen";
import ProScreen from "./screens/ProScreen";
import "./styles.css";

type Screen =
  | { name: "today" }
  | { name: "scene"; scene: Scene }
  | { name: "collection" }
  | { name: "card"; cardId: string }
  | { name: "pro" };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "today" });
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [scenesFailed, setScenesFailed] = useState(false);
  const [cards, setCards] = useState<Card[]>(() => cardStore.listCards());
  const [licensed, setLicensed] = useState(() => hasStoredLicense());

  const refreshCards = useCallback(() => setCards(cardStore.listCards()), []);

  const loadScenes = useCallback(() => {
    setScenesFailed(false);
    fetchScenes()
      .then(setScenes)
      .catch(() => setScenesFailed(true));
  }, []);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  const inScene = screen.name === "scene" || screen.name === "card";

  return (
    <div className="app">
      {screen.name === "today" && (
        <TodayScreen
          scenes={scenes}
          scenesFailed={scenesFailed}
          cards={cards}
          licensed={licensed}
          onOpenScene={(scene) => setScreen({ name: "scene", scene })}
          onOpenCard={(cardId) => setScreen({ name: "card", cardId })}
          onRetryScenes={loadScenes}
        />
      )}

      {screen.name === "scene" && (
        <SceneFlow
          scene={screen.scene}
          licensed={licensed}
          onLicensed={() => setLicensed(true)}
          onExit={() => setScreen({ name: "today" })}
          onCardsChanged={refreshCards}
        />
      )}

      {screen.name === "collection" && (
        <CollectionScreen
          cards={cards}
          scenes={scenes}
          licensed={licensed}
          onOpenCard={(cardId) => setScreen({ name: "card", cardId })}
          onGoToday={() => setScreen({ name: "today" })}
          onOpenPro={() => setScreen({ name: "pro" })}
        />
      )}

      {screen.name === "card" &&
        (() => {
          const card = cards.find((c) => c.id === screen.cardId);
          if (!card) {
            return (
              <div className="screen">
                <div className="empty-state">
                  <p>カードが見つかりませんでした。</p>
                  <button type="button" className="primary-btn" onClick={() => setScreen({ name: "collection" })}>
                    コレクションへ
                  </button>
                </div>
              </div>
            );
          }
          return (
            <CardDetailScreen
              card={card}
              scene={scenes?.find((s) => s.id === card.sceneId) ?? null}
              onBack={() => setScreen({ name: "collection" })}
              onCardsChanged={refreshCards}
            />
          );
        })()}

      {screen.name === "pro" && (
        <ProScreen
          licensed={licensed}
          onLicensed={() => setLicensed(true)}
          onBack={() => setScreen({ name: "collection" })}
        />
      )}

      {!inScene && screen.name !== "pro" && (
        <nav className="bottom-nav" aria-label="メイン">
          <button
            type="button"
            className={screen.name === "today" ? "nav-tab nav-on" : "nav-tab"}
            onClick={() => setScreen({ name: "today" })}
          >
            <span aria-hidden>🎬</span> 今日
          </button>
          <button
            type="button"
            className={screen.name === "collection" ? "nav-tab nav-on" : "nav-tab"}
            onClick={() => setScreen({ name: "collection" })}
          >
            <span aria-hidden>🗂</span> カード{cards.length > 0 ? ` ${cards.length}` : ""}
          </button>
        </nav>
      )}
    </div>
  );
}
