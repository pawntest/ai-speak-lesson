/**
 * Maps raw snake_case scenario fixtures to the client-facing shared Scene type.
 * IMPORTANT: this mapping is an allowlist — `felt_targets_for_testing_only`
 * and `mock_attempts` must never be sent to the client.
 */
import type { Scene } from "../shared/types";
import { loadRawScenarios } from "./fixtures";

export function loadScenes(): Scene[] {
  return loadRawScenarios().scenarios.map((s) => ({
    id: s.id,
    title: s.title,
    level: s.level,
    location: s.scene.location,
    visualCues: s.scene.visual_cues,
    ambientCues: s.scene.ambient_cues,
    npcOpening: s.scene.npc_opening,
  }));
}
