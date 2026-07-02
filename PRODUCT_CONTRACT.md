# Product Contract — Context Diff English MVP

## 1. User and problem

Target:
English-beginner working adults who have studied vocabulary or grammar but cannot communicate smoothly.

Core problem:
They know words, but in a live situation they cannot connect the felt situation and intended meaning to an English expression. Existing apps usually show an answer too early, so the learner sees a corrected sentence without rebuilding the context inside themselves.

The product must create this learning loop:

```text
felt fixed scene
→ user speaks
→ user chooses what they actually wanted to communicate
→ system proposes one-step-better English
→ semantic difference is shown
→ user retries from the same felt moment
→ the pair is saved for later replay
```

## 2. What “context” means

Context is not a written category such as “request” or “ordering.”
It is the user's internal state created by the scene:

- someone is waiting;
- the user feels pressure;
- the user wants coffee;
- words do not come out;
- the user needs to communicate now.

Japanese labels may help at first, but the final learned connection must be:

```text
felt situation → English expression
```

not:

```text
Japanese sentence → English translation
```

## 3. Core user flow

### A. Scene
A fixed scene uses visuals, timing, NPC behavior, sound, and short speech.
Do not explain the whole situation in Japanese.

### B. User response
The user speaks; text input is a fallback.
A one-word response is allowed.

### C. Conversation continues
The NPC may use limited contextual completion so the scene does not collapse.
Any completion must be recorded for review.

### D. Reflection
Ask:

`本当は何を伝えたかった？`

Generate 3–5 neutral Japanese choices.
Always include `その他 / 自分で入力`.

The AI must not mark one choice as correct.
The user may select a different intention when replaying the same scene.

### E. Incremental improvement
Only after the user chooses an intention, generate one main improved expression.

Rules:
- preserve as much of the user's original utterance as possible;
- teach one primary semantic chunk;
- do not default to the longest or most polite sentence;
- prefer a short, natural expression the learner can immediately retry.

Example:

```text
User: Coffee.
Chosen intention: コーヒーを注文したかった
Improved: I'd like a coffee.
Primary difference: I'd like a
```

### F. Difference explanation
Show:
1. before;
2. after;
3. highlighted semantic difference;
4. what the difference means;
5. why it is used in this scene.

Do not finish with only a Japanese translation.
Do not turn the page into a grammar lecture.

### G. Retry
Replay the decisive scene moment.
The user speaks again.
Evaluate whether the selected intention is communicated, not exact string matching.

### H. Collection
Save a context-difference card containing:

- scene reference;
- user's original utterance;
- user's selected intention;
- improved utterance;
- primary semantic chunk;
- meaning;
- contextual reason;
- mastery state;
- review history.

The same scene can create multiple cards from different intentions.

## 4. MVP screens

1. Today / scene selection
2. Scene experience
3. Voice or text response
4. Intention selection
5. Context-difference view
6. Retry
7. Collection
8. Card detail / replay

## 5. Required behavior

### Intent options
- 3–5 plausible choices
- same level of abstraction
- non-leading wording
- no “recommended” or “correct”
- free-text fallback

### Improved expression
- one main answer
- one primary semantic chunk
- beginner-appropriate length
- consistent with scene, relationship, and selected intention
- may differ for the same scene when intention differs

### Japanese scaffolding
- first review: Japanese shown
- later review: Japanese collapsed
- later: English + scene only
- final: scene only, spontaneous speech
- learner can temporarily reveal support

## 6. Initial scenarios

Canonical fixtures are in `SCENARIOS.json`.

MVP must support at least:
1. ordering at a cafe;
2. order not arriving;
3. not understanding what the NPC said.

At least one scenario must run fully from scene to saved card and replay.

## 7. Minimal architecture

Required boundaries:
- scene data;
- conversation/NPC adapter;
- speech-to-text adapter;
- intention-option generator;
- incremental expression coach;
- semantic diff aligner;
- card persistence;
- replay/review state.

Requirements:
- mock mode works without external AI;
- external AI calls are server-side;
- structured AI output is schema-validated;
- provider interfaces are replaceable;
- no unnecessary framework or abstraction.

## 8. Acceptance criteria

The MVP is accepted only if:

1. The learner can complete a scene by voice or text.
2. No improved expression is shown before intention selection.
3. The learner can select an AI option or enter free text.
4. The same scene can generate two different cards from different chosen intentions.
5. The improved expression preserves the user's original words where reasonable.
6. The primary learned difference is visually isolated.
7. Meaning and contextual reason are separate fields.
8. The learner can replay the decisive scene moment and retry.
9. Japanese support can be hidden.
10. Saved cards persist after reload.
11. Mock mode supports the principal flow.
12. Type check, tests, build, and browser verification succeed.
13. API keys are not exposed to the client.
14. Raw audio is not persisted without explicit consent.

## 9. Out of scope

- open world or large 3D system
- native mobile apps
- human conversation
- social features
- payment and advertising
- multilingual learning
- detailed grammar curriculum
- advanced pronunciation scoring
- automatic full curriculum generation

## 10. Main product risks

### Scene does not create a feeling
Fix scene timing, visuals, sound, or NPC behavior.
Do not add explanatory text as the first response.

### AI gives the answer
Do not reveal improvement or imply the correct intention before user choice.

### Improvement is too long
Reduce to one semantic chunk and one immediate retry.

### AI over-completes
Record completion and reduce assistance on later attempts.

### Japanese remains the learned representation
Make collection and replay scene-first; progressively hide Japanese.

### Product becomes a generic tutor
Reject flows centered on free chat, scores, grammar lessons, or word lists.
