/**
 * Loader for the raw SCENARIOS.json fixtures (snake_case, includes mock_attempts).
 * Server-side only. The AI-learning implementer consumes this for the mock providers.
 * NOTE: `felt_targets_for_testing_only` exists here — it must NEVER reach the client
 * (the /api/scenes mapping strips it).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface RawScenario {
  id: string;
  title: string;
  level: string;
  scene: {
    location: string;
    visual_cues: string[];
    ambient_cues: string[];
    npc_opening: string | null;
    felt_targets_for_testing_only?: string[];
    [key: string]: unknown;
  };
  /** Loosely typed on purpose; shape varies per scenario (variants etc.). */
  mock_attempts: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface RawScenariosFile {
  version: number;
  scenarios: RawScenario[];
}

const scenariosPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "SCENARIOS.json",
);

let cached: RawScenariosFile | null = null;

/** Returns the parsed SCENARIOS.json (cached after first read). */
export function loadRawScenarios(): RawScenariosFile {
  if (!cached) {
    cached = JSON.parse(readFileSync(scenariosPath, "utf-8")) as RawScenariosFile;
  }
  return cached;
}
