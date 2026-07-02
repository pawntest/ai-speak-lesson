# Decisions

## D1 — Architecture (approved by Fable)
- Vite + React 18 + TypeScript SPA in `src/`, tiny Express (v4) API server in `server/`, shared domain types in `shared/`.
- Dev: vite proxies `/api` → localhost:8787. Prod build: `vite build` + `tsc`; server serves `dist/` statically.
- Tests: Vitest (server/domain logic + a few UI state tests). Typecheck: `tsc --noEmit` per tsconfig project.
- Persistence: cards in `localStorage` behind a `CardStore` boundary (contract allows; survives reload; no backend DB in MVP).
- Speech: Web Speech API adapter, transcript only (no audio persisted); text input fallback always visible.
- AI: provider interfaces in `shared/`; `MockProvider` (deterministic, SCENARIOS.json-driven + rule-based fallback) is default; optional Anthropic provider server-side only, enabled by `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (never sent to client). All structured output zod-validated with safe fallback.

## D2 — File ownership
- FOUNDATION: package.json, tsconfig*.json, vite.config.ts, .env.example, shared/**, server/index.ts (skeleton + routes wiring), src/api.ts (typed client), src/store/cards.ts (localStorage boundary), data wiring for SCENARIOS.json.
- AI-LEARNING implementer: server/providers/**, server/routes/**, server/**/*.test.ts (owns all server logic behind the route signatures fixed by foundation).
- EXPERIENCE implementer: src/** except src/api.ts and src/store/cards.ts signatures (may extend internals via new files), index.html, styling.
- QA: read-only.

## D3 — API surface (frozen by foundation)
- `GET /api/scenes` → Scene[]
- `POST /api/respond` { sceneId, utterance } → { npcReply: string|null, completionNote: string|null }  (records completion; no coaching here)
- `POST /api/intent-options` { sceneId, utterance } → { options: string[] }  (3–5 JA options; NEVER includes any improvement)
- `POST /api/improve` { sceneId, utterance, intent } → Improvement
- `POST /api/evaluate-retry` { sceneId, intent, utterance } → RetryEvaluation

## D4 — Card identity
Card id = uuid; duplicate-guard on (sceneId, selectedIntent, improvedUtterance). Same scene with different intent always creates a new card (acceptance A4).

## D5 — Mastery stages
0: JA shown; 1: JA collapsed (tap to reveal); 2: EN + scene only; 3: scene only. Review success advances stage, failure regresses one. Temporary reveal never changes stage.
