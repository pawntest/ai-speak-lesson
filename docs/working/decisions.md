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

## D8 — Monetization (user goal 2026-07-02: ≥¥10,000/month)
User directive overrides the contract's "no payment" scope item. Design in docs/working/monetization.md.
- Freemium: Free = 3 improvements/day + 10 saved cards; Pro ¥600/月 = unlimited + Gemini dynamic coaching. 17–18 subscribers reach the goal.
- Rails: Stripe Payment Link URL via `VITE_UPGRADE_URL` (display-only, no secret); unlock via HMAC license keys (`LICENSE_SECRET` server-side, generator script `scripts/generate-license.mjs`).
- Enforcement server-side: `/api/improve` checks Pro license or daily quota; over-quota returns 402 with upgrade info. New endpoint `POST /api/license/activate` validates a key.
- Funnel is gentle (D7): core loop stays free; upsell only at quota/save limits and a quiet Pro entry in Collection.

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

## AI-learning notes
- Provider contract: `AiProvider` (server/providers/types.ts) = shared IntentOptionProvider + CoachProvider + RetryEvaluator + `respond()`. `createApiRouter(provider?: AiProvider)` keeps the foundation zero-arg signature; default is `selectProvider(process.env)` (server/providers/index.ts): `AI_PROVIDER=gemini` + `GEMINI_API_KEY` ⇒ GeminiProvider, anything else ⇒ MockProvider (D6).
- MockProvider (server/providers/mock.ts): fixture match on `mock_attempts.user_utterance` is case/punctuation-insensitive (Unicode-aware normalize, apostrophes kept); supports both the flat improvement shape and `variants` (missing-order A4 case). Unseen utterance/intent falls to a deterministic rule engine: intent wording picks ONE chunk (recommend / attention "Excuse me" / slow / repeat "Could you say that again" / confirm ", right?" / wait / already-polite / default "I'd like"), learner words preserved (capped at 9 words so the result stays ≤12 words). No randomness anywhere.
- Guard (server/providers/guard.ts): `findImprovementViolation()` enforces shared zod schema + ≤12 words + single sentence + primaryDiff ⊂ improvedUtterance + meaningJa ≠ reasonJa. Applied in BOTH GeminiProvider and the routes (defense in depth): any violation swaps in the deterministic mock result for that call — malformed AI output can never 500 or leak long multi-chunk rewrites.
- GeminiProvider (server/providers/gemini.ts): plain fetch to `v1beta/models/gemini-2.5-flash:generateContent`, no SDK; structured output via responseMimeType=application/json + responseSchema; key sent in `x-goog-api-key` header only (never in URL). `originalUtterance`/`selectedIntent` are always overwritten from the request, never trusted from the model. Tests stub fetch; the real API is never called in tests.
- Retry evaluation (mock) is communicated-intent, not string equality: (1) ≥60% content-word overlap with any fixture improvement for that intent, (2) politeness/request frame + ≥1 content word, (3) intent-specific cue table (e.g. attention intent satisfied by "Excuse me" alone). Notes are short, warm JA per D7 — the false case gently names the missing chunk (its would-be primaryDiff), never scolds.
- /api/respond mock: friendly per-scene NPC line; `completionNote` (JA) is non-null only when the utterance was fragmentary (≤2 words), describing what the NPC charitably assumed. Never coaches.
- Route hardening: request bodies zod-validated (400), unknown sceneId → 404; responses rebuilt key-by-key so intent-options can never carry improvement fields and `felt_targets` can never leak (both under test).
- D8 (server/license.ts): `validateLicenseKey` recomputes HMAC-SHA256 over the base64url payload with `LICENSE_SECRET`, timing-safe compare of the 16-hex prefix; missing secret ⇒ always invalid, never a crash (a test execs the real scripts/generate-license.mjs to prevent scheme drift). `POST /api/license/activate` { key } → { valid }. Quota: /api/improve only — free (no/invalid `x-license-key`) = 3/day per `x-client-id` (missing header ⇒ one shared anonymous bucket), over ⇒ 402 { error: "quota_exceeded", limit: 3 }; valid license ⇒ unlimited. KNOWN MVP LIMITATION: quota is in-memory per process, so a server restart resets the daily counters.
- Tests live in server/**/*.test.ts (42 tests). No supertest dependency added: route tests run the real router on an ephemeral listener (`app.listen(0)`) and use global fetch; test requests send unique `x-client-id`s so the D8 quota never bleeds between tests.
