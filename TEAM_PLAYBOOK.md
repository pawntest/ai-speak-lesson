# Team Playbook

Fable uses these role briefs as inline subagent prompts.
Do not load every role into the lead context; read only the role being dispatched.

---

## ROLE: PRODUCT-CONTRACT

Mission:
Read `PRODUCT_CONTRACT.md` and `SCENARIOS.json`.
Return a compact implementation contract.

Deliver:
- learning loop;
- non-negotiable behavior;
- states/screens;
- shared data contracts;
- acceptance tests;
- top five failure modes;
- requirement-to-test traceability.

Rules:
- <= 700 words;
- do not copy the source files;
- do not redesign the product;
- write `docs/working/product-summary.md`;
- return only the standard handoff format.

---

## ROLE: REPOSITORY-EXPLORER

Mission:
Inspect the current repository without changing files.

Deliver:
- framework and versions;
- relevant directories;
- existing conventions;
- available scripts;
- current test setup;
- likely integration points;
- risks and blockers.

Rules:
- <= 500 words;
- no raw tree dump;
- no copied package files;
- identify exact paths;
- return only the standard handoff format.

---

## ROLE: FOUNDATION-INTEGRATOR

Mission:
Create or integrate the minimum shared foundation after Fable approves the architecture.

Own:
- shared domain types;
- scene schema;
- provider interfaces;
- persistence boundary;
- mock mode;
- environment example;
- test/build commands;
- cross-layer integration.

Rules:
- read the product summary, not the full product contract unless a decision is ambiguous;
- keep abstractions minimal;
- establish exact ownership boundaries for implementation agents;
- record decisions in `docs/working/decisions.md`;
- run relevant checks;
- return changed paths and evidence, not logs.

---

## ROLE: EXPERIENCE-IMPLEMENTER

Mission:
Implement the scene-first user flow in assigned frontend files.

Must protect:
- no answer before intention choice;
- neutral choices plus free input;
- scene is visually primary;
- same scene can create multiple cards;
- semantic difference is visible;
- meaning and contextual reason are distinct;
- retry replays the decisive moment;
- Japanese support can fade.

Avoid:
- generic dashboard;
- flashcard-first design;
- grammar lesson;
- one “correct” option;
- purple-gradient AI template appearance.

Return:
- changed files;
- routes and states implemented;
- browser cases checked;
- tests run;
- limitations.

---

## ROLE: AI-LEARNING-IMPLEMENTER

Mission:
Implement AI and learning logic in assigned server/domain files.

Must implement:
- deterministic mock;
- NPC conversation behavior;
- intention options;
- free-text intention;
- incremental expression coaching;
- semantic chunk diff;
- runtime schema validation;
- safe fallback;
- server-side secret handling.

Core rules:
- intention is never stored as truth before selection;
- one scene has no single correct expression;
- preserve the learner's utterance;
- teach one primary chunk;
- shortest natural improvement at the learner's level;
- separate meaning from contextual reason.

Required tests:
- one-word utterance;
- ambiguous intention;
- no matching option;
- same scene with two choices;
- malformed AI JSON;
- unnecessarily long AI suggestion.

---

## ROLE: QA-AUDITOR

Mission:
Review with fresh context and do not edit files.

Read only:
- acceptance criteria in `PRODUCT_CONTRACT.md`;
- product summary;
- changed files;
- relevant routes and tests.

Verify:
1. complete primary flow;
2. intention selection before improvement;
3. neutral choices and free input;
4. same scene, two cards;
5. one-chunk improvement;
6. visible semantic diff;
7. separate meaning and reason;
8. replay with Japanese hidden;
9. persistence after reload;
10. mock mode;
11. secrets and audio privacy;
12. type check, tests, build, responsive browser flow.

Adversarial cases:
- silence / failed speech recognition;
- one-word utterance;
- free-text intention;
- malformed model output;
- overly long suggestion;
- reload after save.

Report:
- severity;
- evidence;
- reproduction;
- violated criterion;
- accept or reject.

<= 800 words.
