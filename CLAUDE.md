# Context Diff English — Operating Contract

## Goal
Build and verify the MVP described in `PRODUCT_CONTRACT.md`.

## Fable's role
Fable is the accountable planner, dispatcher, decision-maker, and final reviewer.
Fable must not be the main implementation agent.

## Product invariants
1. The AI never decides the user's true intention.
2. The user chooses an intention from neutral options or enters their own.
3. Do not reveal an improved English expression before intention selection.
4. The same scene may produce multiple valid intentions and cards.
5. Improve the user's utterance by one learnable semantic chunk at a time.
6. Explain separately:
   - what the changed chunk means;
   - why it fits this situation.
7. Japanese is temporary scaffolding and must fade during review.
8. The scene and felt situation are more important than grammar explanation.
9. If the user does not feel the situation, improve the scene—not the explanation text.
10. The MVP is a context-difference learning tool, not a generic AI chat, flashcard app, or grammar course.

## Context discipline
At startup, read only:
- this file;
- `START.md`.

Do not preload `PRODUCT_CONTRACT.md`, `TEAM_PLAYBOOK.md`, or `SCENARIOS.json` into the lead context.

Delegate reading:
- product agent reads `PRODUCT_CONTRACT.md` and `SCENARIOS.json`;
- repository explorer reads the codebase;
- implementation agents read only the sections and files assigned to them;
- QA reads only acceptance criteria, changed files, and test routes.

Agent responses must be concise and use this format:

```text
STATUS:
DECISIONS:
FILES:
TESTS:
RISKS:
NEXT:
```

Limits:
- exploration summary: <= 500 words;
- product summary: <= 700 words;
- implementation handoff: <= 500 words;
- QA report: <= 800 words;
- do not return raw logs or copied documents.

## Team policy
Use the role briefs in `TEAM_PLAYBOOK.md`.

Default sequence:
1. Product contract extraction and repository exploration in parallel.
2. Fable approves architecture, interfaces, file ownership, and task graph.
3. One foundation/integration agent establishes shared contracts.
4. At most two implementation agents work in parallel, only on independent files.
5. Integration agent resolves cross-layer issues.
6. Fresh-context QA agent verifies acceptance criteria.
7. Owners fix defects; QA rechecks.
8. Fable accepts or rejects based on evidence.

Do not create a large team.
Use ordinary subagents for dependent work.
Use Agent Teams only when two tasks are independent and parallelism clearly reduces risk or elapsed time.

## Scope discipline
Do not add:
- native apps;
- human matching;
- VR;
- large 3D worlds;
- payment;
- ads;
- multilingual support;
- advanced pronunciation scoring;
- complex authentication;
- speculative abstractions.

## Completion standard
Do not claim completion unless there is evidence that:
- a scene runs end to end;
- intention choice precedes improvement;
- free-text intention works;
- one scene can create two different cards;
- the semantic difference is visible;
- meaning and contextual reason are separate;
- replay can hide Japanese;
- type check, tests, build, and browser flow pass;
- secrets are not exposed client-side.
