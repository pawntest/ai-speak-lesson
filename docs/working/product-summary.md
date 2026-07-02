# Product Summary — Implementation Contract

## Learning loop
felt scene → user speaks (voice/text, one word OK) → user picks true intention (3–5 neutral JA options + free text) → system shows ONE one-chunk-better English expression → semantic diff highlighted with meaning + contextual reason (separate) → retry the decisive moment → save context-difference card → later replay with Japanese progressively hidden.

## Non-negotiable behavior
1. AI never decides or implies the user's true intention.
2. No improved expression is visible before intention selection.
3. Intent options: 3–5, neutral, same abstraction level, never marked correct/recommended, always include "その他 / 自分で入力".
4. Improvement: exactly one primary semantic chunk; preserve the learner's original words where reasonable; short and natural, not longest/most polite.
5. Meaning (what the chunk means) and contextual reason (why it fits this scene) are separate fields, always both shown.
6. Same scene + different intention ⇒ different card. Multiple cards per scene allowed.
7. Retry replays the decisive moment; success = intention communicated, not string match.
8. Japanese is scaffolding: first review shows JA, later collapsed, then EN+scene, then scene only; learner can temporarily reveal.
9. Mock mode runs the full principal flow with no external AI. External AI calls are server-side only; structured output schema-validated with safe fallback.
10. Raw audio never persisted; no API keys client-side.

## States / screens (8)
1. Today / scene selection
2. Scene experience (visual cues, ambient cues, NPC opening; scene visually primary, no JA situation explanation)
3. Response (speech via Web Speech API; text fallback)
4. Intention selection (neutral options + free text)
5. Context-difference view (before / after / highlighted chunk / meaning / reason)
6. Retry (replay decisive moment, speak again, communicated-intent evaluation)
7. Collection (cards grouped by scene)
8. Card detail / replay (JA-hidden review stages)

## Shared data contracts
- `Scene`: id, title, level, location, visualCues[], ambientCues[], npcOpening (nullable).
- `IntentOptionsResult`: options: string[] (3–5, JA), plus implicit free-text; no ranking field.
- `Improvement`: originalUtterance, selectedIntent, improvedUtterance, primaryDiff (chunk), meaningJa, reasonJa.
- `Card`: id, sceneId, originalUtterance, selectedIntent, improvedUtterance, primaryDiff, meaningJa, reasonJa, masteryStage (0–3), reviewHistory[], createdAt.
- `RetryEvaluation`: communicated: boolean, note.
- Providers (replaceable interfaces): IntentOptionProvider, CoachProvider, RetryEvaluator, DiffAligner. Mock implementations are deterministic and driven by `SCENARIOS.json` fixtures + rule-based fallback for unseen utterances.

## Acceptance tests (from contract §8)
A1 scene completes by voice or text; A2 no improvement before intention; A3 AI option or free text; A4 same scene → two different cards; A5 original words preserved; A6 primary diff visually isolated; A7 meaning ≠ reason fields; A8 replay decisive moment + retry; A9 JA hideable; A10 cards persist after reload; A11 mock mode covers principal flow; A12 typecheck/tests/build/browser pass; A13 no client-side keys; A14 no raw audio persisted.

## Top five failure modes
1. Improvement leaks before intention choice (UI ordering or API returning both at once) → API must not return improvement in the intent-options response.
2. Mock coach returns multi-chunk / long rewrite → enforce one-chunk rule in provider + test.
3. Options imply a correct answer (ordering, wording, styling) → neutral rendering, stable but non-ranked order.
4. Cards keyed by scene only → second intention overwrites first → key card identity by (scene, intent, utterance) uniqueness.
5. Malformed AI JSON crashes flow → zod validation + deterministic fallback expression.

## Traceability
A1→flow e2e test + browser; A2→server test: options endpoint response contains no improvement + UI state machine test; A3→free-text intent test; A4→two-cards test (missing-order fixture has 2 variants); A5/A6→diff aligner test (primaryDiff ⊂ improved, original preserved); A7→schema fields distinct + UI shows both; A8→retry route test; A9→mastery-stage rendering test; A10→localStorage persistence reload test; A11→mock provider e2e; A12→CI commands; A13→key only read in server env; A14→speech adapter discards audio, stores transcript only.
