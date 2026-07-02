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

## D6 — AI provider cost policy (user directive 2026-07-02)
Prefer free APIs; among free candidates pick the best performance.
- Default: `AI_PROVIDER=mock` — zero cost, deterministic, full principal flow.
- Real AI: `AI_PROVIDER=gemini` using Google Gemini API free tier, model `gemini-2.5-flash` (best-performing free-tier structured-output model; JSON schema output supported). Key via `GEMINI_API_KEY`, server-side only.
- Speech-to-text: browser Web Speech API (free, on-device/vendor-provided) — no paid STT.
- Anthropic provider: NOT included in MVP (paid); interface stays replaceable so it can be added later.

## D7 — Experience quality bar (user directive 2026-07-02)
The user's end goal is speaking the target language without struggle; the loop must feel exceptionally comfortable and be learning-effective.
- Zero-friction loop: mic/text ready without extra taps; one-tap retry from the decisive moment; one-tap "same scene, different intention"; auto-focus inputs; Enter submits.
- Comfort: encouraging, non-punishing feedback tone; no scores/red X; latency masked by in-scene animation (NPC keeps living while waiting); graceful JA-friendly errors.
- Effectiveness: retry immediately after seeing the diff (speak it out loud now); Today screen surfaces due reviews (lowest mastery first); mastery progress visible as gentle stage indicator; NPC lines spoken aloud (speechSynthesis) with replay button for listening practice.
- Accessibility/comfort details: large tap targets, readable type, reduced-motion respect, works one-handed on mobile.

## D5 — Mastery stages
0: JA shown; 1: JA collapsed (tap to reveal); 2: EN + scene only; 3: scene only. Review success advances stage, failure regresses one. Temporary reveal never changes stage.

## Foundation notes
- Two flat tsconfig projects (`tsconfig.app.json`: src+shared with DOM libs; `tsconfig.server.json`: server+shared with node types); `npm run typecheck` runs both. Root `tsconfig.json` is references-only for editors. Test files live under src/server so they typecheck with their project; the foundation smoke test is `src/foundation.smoke.test.ts` (it needs DOM types for the CardStore).
- Routes module exports a factory `createApiRouter(): Router` from `server/routes/index.ts` (not a bare Router instance) so the AI implementer can inject providers later without changing `server/index.ts`. `server/index.ts` also exports `createApp()` for supertest-style route tests.
- Raw fixtures loader: `loadRawScenarios()` in `server/fixtures.ts` (cached, loosely typed). Scene mapping is an explicit allowlist in `server/scenes.ts` — `felt_targets_for_testing_only` and `mock_attempts` can never leak to `/api/scenes` (verified by curl).
- Added `RespondResult` ({ npcReply, completionNote }) to shared/types.ts to type the D3 `/api/respond` response; `DiffAligner` interface deferred to the AI implementer (not in the frozen shared surface per foundation scope).
- CardStore: `createCardStore(storage?)` factory + `cardStore` default export. `updateMastery(cardId, success)` changes stage only; `recordReview(cardId, success)` appends a ReviewEntry AND applies the stage change (UI should call recordReview per review; temporary JA reveal calls neither). New cards start at masteryStage 0. Non-browser envs fall back to in-memory storage.
- `ReviewEntry` = { reviewedAt: ISO string, success: boolean, stageAfter: MasteryStage }; Card timestamps are ISO strings (JSON-safe in localStorage).
- Zod: `intentOptionsResultSchema` enforces 3–5 non-empty options; schemas use `satisfies z.ZodType<T>` so they cannot drift from shared/types.ts.
- Prod `start`/`preview` run the TS server via tsx (`node --import tsx server/index.ts`) — no separate server transpile step in MVP. Server serves dist/ only when it exists and SPA-fallbacks non-/api GETs.
- api.ts throws `ApiError` (has `.status`) on non-2xx and parses `{ error }` bodies into the message.
