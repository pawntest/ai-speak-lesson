/**
 * MockProvider — default, deterministic, zero-cost (D6).
 *
 * 1. Fixture path: SCENARIOS.json `mock_attempts` matched case/punctuation-
 *    insensitively (supports both the flat shape and the `variants` shape).
 * 2. Rule-based fallback for ANY unseen utterance/intent so the flow never
 *    dead-ends: neutral IntentOption objects (D11: textEn/textJa/icon) from
 *    scene + conversation context; improvement that preserves the learner's
 *    words and adds exactly ONE semantic chunk.
 * 3. D12 multi-turn: respond() replays the scene's scripted follow_up_turns
 *    keyed by the learner-turn count, then closes with done=true.
 * No randomness anywhere: same input -> same output.
 */
import type {
  ConversationTurn,
  Improvement,
  IntentOption,
  IntentOptionsResult,
  RespondResult,
  RetryEvaluation,
  Scene,
} from "../../shared/types";
import { loadRawScenarios } from "../fixtures";
import type { AiProvider } from "./types";

/** Case/punctuation-insensitive comparison key. Keeps letters/digits/apostrophes. */
export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface FixtureVariant {
  selected_intent: string;
  improved_utterance: string;
  primary_diff: string;
  meaning_en: string;
  reason_en: string;
  meaning_ja: string;
  reason_ja: string;
}

/** D11 raw fixture option shape (snake_case mirror of IntentOption). */
interface FixtureIntentOption {
  text_en?: unknown;
  text_ja?: unknown;
  icon?: unknown;
}

interface FixtureAttempt {
  user_utterance?: string;
  intent_options?: FixtureIntentOption[];
  variants?: FixtureVariant[];
  selected_intent?: string;
  improved_utterance?: string;
  primary_diff?: string;
  meaning_en?: string;
  reason_en?: string;
  meaning_ja?: string;
  reason_ja?: string;
}

function findAttempt(sceneId: string, utterance: string): FixtureAttempt | null {
  const scenario = loadRawScenarios().scenarios.find((s) => s.id === sceneId);
  if (!scenario) return null;
  const wanted = normalizeUtterance(utterance);
  if (!wanted) return null;
  for (const raw of scenario.mock_attempts) {
    const attempt = raw as FixtureAttempt;
    if (
      typeof attempt.user_utterance === "string" &&
      normalizeUtterance(attempt.user_utterance) === wanted
    ) {
      return attempt;
    }
  }
  return null;
}

/** All improvement variants a fixture attempt offers (flat shape counts as one). */
function attemptVariants(attempt: FixtureAttempt): FixtureVariant[] {
  const pool: FixtureVariant[] = [];
  if (Array.isArray(attempt.variants)) pool.push(...attempt.variants);
  if (
    typeof attempt.selected_intent === "string" &&
    typeof attempt.improved_utterance === "string" &&
    typeof attempt.primary_diff === "string" &&
    typeof attempt.meaning_en === "string" &&
    typeof attempt.reason_en === "string" &&
    typeof attempt.meaning_ja === "string" &&
    typeof attempt.reason_ja === "string"
  ) {
    pool.push({
      selected_intent: attempt.selected_intent,
      improved_utterance: attempt.improved_utterance,
      primary_diff: attempt.primary_diff,
      meaning_en: attempt.meaning_en,
      reason_en: attempt.reason_en,
      meaning_ja: attempt.meaning_ja,
      reason_ja: attempt.reason_ja,
    });
  }
  return pool;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowercaseFirst(text: string): string {
  // Keep "I" / "I'd" etc. capitalized — lowercasing them is ungrammatical.
  if (/^I(?=$|[\s'])/u.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Deterministic one-chunk improvement for unseen (utterance, intent) pairs.
 * Preserves the learner's words where reasonable and adds one semantic chunk
 * chosen from the intent's wording (attention / clarification / politeness…).
 */
export function ruleBasedImprovement(
  scene: Scene,
  utterance: string,
  intent: string,
): Improvement {
  // Preserve original words: strip trailing punctuation, cap at 9 words so the
  // result always stays a short single sentence (guard: <= 12 words).
  const core = utterance
    .trim()
    .replace(/[\s.?!,。？！、]+$/u, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 9)
    .join(" ");
  const lowered = core ? lowercaseFirst(core) : "this";

  let improvedUtterance: string;
  let primaryDiff: string;
  let meaningEn: string;
  let reasonEn: string;
  let meaningJa: string;
  let reasonJa: string;

  if (/おすすめ|お薦め|recommend/iu.test(intent)) {
    improvedUtterance = "What do you recommend?";
    primaryDiff = "What do you recommend";
    meaningEn = "This asks the other person for their idea.";
    reasonEn = "The staff here can pick something good for you.";
    meaningJa = "「おすすめは何ですか」と相手に提案を求める言い方";
    reasonJa = `${scene.location}では、相手に選択を委ねる一言で会話が自然に進むから`;
  } else if (/気付|気づ|呼び|呼んで|注意|attention|notice/iu.test(intent)) {
    improvedUtterance = `Excuse me, ${lowered}.`;
    primaryDiff = "Excuse me";
    meaningEn = "'Excuse me' politely gets someone's attention.";
    reasonEn = "The person here must notice you before you speak.";
    meaningJa = "「すみません」と相手の注意をこちらへ向ける丁寧な呼びかけ";
    reasonJa = `${scene.location}では、用件の前にまず一言で相手に気付いてもらう必要があるから`;
  } else if (/ゆっくり|slow/iu.test(intent)) {
    improvedUtterance = "Could you speak more slowly?";
    primaryDiff = "Could you speak more";
    meaningEn = "'Could you' asks for something in a soft way.";
    reasonEn = "It asks only for slower speech, with no blame.";
    meaningJa = "「〜してもらえますか」と相手に負担なくお願いする形";
    reasonJa = `${scene.location}で聞き取りづらいとき、責めずに速さだけを変えてもらえるから`;
  } else if (/もう一度|もう1度|聞き|聞こえ|繰り返|repeat|again|pardon/iu.test(intent)) {
    improvedUtterance = "Could you say that again?";
    primaryDiff = "Could you say that";
    meaningEn = "This asks someone to say it one more time.";
    reasonEn = "You can hear the missed words here again.";
    meaningJa = "相手に同じ内容をもう一度言ってもらうお願いの形";
    reasonJa = `${scene.location}で聞き取れなかったとき、丁寧に繰り返しを頼めるから`;
  } else if (/確認|確かめ|check|confirm|clarify/iu.test(intent)) {
    improvedUtterance = `${capitalize(lowered)}, right?`;
    primaryDiff = "right";
    meaningEn = "'Right?' asks if something is correct.";
    reasonEn = "A small check here stops a mistake early.";
    meaningJa = "「〜で合っていますか」と軽く確かめる付け足しの一言";
    reasonJa = `${scene.location}では、短い確認を添えるだけで認識違いを防げるから`;
  } else if (/待|時間|wait|moment/iu.test(intent)) {
    improvedUtterance = "One moment, please.";
    primaryDiff = "One moment";
    meaningEn = "This asks for a little time, politely.";
    reasonEn = "The other person here can wait calmly after it.";
    meaningJa = "「少し待ってください」と時間がほしいことを伝える定型表現";
    reasonJa = `${scene.location}では、黙るより一言伝える方が相手も安心して待てるから`;
  } else if (/i'?d like|i would like|could you|can i|may i|please/iu.test(core)) {
    // The learner already used a politeness frame — keep it and just finish
    // the sentence cleanly; the frame itself is the chunk to reinforce.
    improvedUtterance = `${capitalize(core)}.`;
    const match = /i'?d like|i would like|could you|can i|may i|please/iu.exec(improvedUtterance);
    primaryDiff = match ? match[0] : improvedUtterance.slice(0, -1);
    meaningEn = "This form asks for something politely.";
    reasonEn = "It sounds like a kind request in this place.";
    meaningJa = "自分の希望をお願いの形で伝える言い方";
    reasonJa = `${scene.location}では、この形にすると要求ではなく依頼として伝わるから`;
  } else {
    improvedUtterance = `I'd like ${lowered}.`;
    primaryDiff = "I'd like";
    meaningEn = "'I'd like' means 'I want', said politely.";
    reasonEn = "It makes your wish clear in this place.";
    meaningJa = "「〜がほしいです」と自分の希望を丁寧に伝える形";
    reasonJa = `${scene.location}では、単語だけより希望の形にすると意図がはっきり伝わるから`;
  }

  return {
    originalUtterance: utterance,
    selectedIntent: intent,
    improvedUtterance,
    primaryDiff,
    meaningEn,
    reasonEn,
    meaningJa,
    reasonJa,
  };
}

/** D11 fallback candidates: each JA intent paired with an EN name + icon. */
const FALLBACK_OPTION: Record<string, IntentOption> = {
  order: { textEn: "I wanted to order it", textJa: "それを注文したかった", icon: "🛎" },
  repeat: { textEn: "I wanted them to repeat", textJa: "もう一度言ってほしかった", icon: "🔁" },
  directions: { textEn: "I wanted to know the way", textJa: "行き方・場所を知りたかった", icon: "🗺️" },
  procedure: { textEn: "I wanted to check in", textJa: "手続きを進めたかった", icon: "🏨" },
  wait: { textEn: "I wanted them to wait", textJa: "少し待ってほしかった", icon: "⏳" },
  attention: { textEn: "I wanted them to notice me", textJa: "相手に気付いてほしかった", icon: "🙋" },
  confirmQuestion: { textEn: "I wanted to ask and check", textJa: "質問をして確かめたかった", icon: "🧐" },
  confirmHeard: { textEn: "I wanted to check their words", textJa: "相手の言ったことを確認したかった", icon: "✅" },
  tellNeed: { textEn: "I wanted to say my need", textJa: "自分の用件を伝えたかった", icon: "💬" },
  moreTime: { textEn: "I wanted more time", textJa: "少し時間がほしかった", icon: "🕐" },
  askQuestion: { textEn: "I wanted to ask a question", textJa: "質問をしたかった", icon: "❓" },
  didNotUnderstand: { textEn: "I didn't understand you", textJa: "聞き取れなかった", icon: "🤔" },
};

/**
 * Deterministic neutral options conditioned on what the learner actually said
 * (発話対応) and, when provided, the conversation so far (D12): the LAST NPC
 * line adds cues (e.g. the NPC asked a question → a comprehension option).
 * Cue-derived candidates come first, scene-generic fillers complete 4 options.
 * D11: every option is an IntentOption object {textEn, textJa, icon}.
 */
export function fallbackIntentOptions(
  scene: Scene,
  utterance: string,
  turns?: ConversationTurn[],
): IntentOptionsResult {
  const norm = normalizeUtterance(utterance);
  const options: IntentOption[] = [];
  const add = (option: IntentOption) => {
    if (options.length < 5 && !options.some((o) => o.textJa === option.textJa)) {
      options.push(option);
    }
  };

  // Conversation cue (D12): the learner reacted to the last NPC line.
  const lastNpc = turns
    ?.slice()
    .reverse()
    .find((t) => t.speaker === "npc");
  if (lastNpc && /[?？]\s*$/.test(lastNpc.text.trim())) {
    // The NPC asked a question — the learner may simply not have caught it.
    add(FALLBACK_OPTION.didNotUnderstand);
  }

  // Utterance-content cues → corresponding intents.
  if (/coffee|tea|water|juice|menu|croissant|sandwich|cake|food|drink|order/.test(norm)) {
    add(FALLBACK_OPTION.order);
  }
  if (/again|pardon|sorry|what|repeat|slowly/.test(norm)) {
    add(FALLBACK_OPTION.repeat);
  }
  if (/where|way|go|station|street|map|find/.test(norm)) {
    add(FALLBACK_OPTION.directions);
  }
  if (/check in|checkin|room|reservation|booking/.test(norm)) {
    add(FALLBACK_OPTION.procedure);
  }
  if (/wait|moment|minute|second/.test(norm)) {
    add(FALLBACK_OPTION.wait);
  }
  if (/excuse me|hello|hi\b/.test(norm)) {
    add(FALLBACK_OPTION.attention);
  }
  if (/[?？]\s*$/.test(utterance.trim())) {
    add(FALLBACK_OPTION.confirmQuestion);
  }

  // Scene-generic fillers keep the set at 4 neutral, same-abstraction options.
  add(scene.npcOpening ? FALLBACK_OPTION.confirmHeard : FALLBACK_OPTION.attention);
  add(FALLBACK_OPTION.tellNeed);
  add(FALLBACK_OPTION.moreTime);
  add(FALLBACK_OPTION.askQuestion);

  return { options: options.slice(0, 4) };
}

/* -------------------------------------------------------------------------
 * Retry evaluation heuristics (communicated-intent, NOT string equality)
 * ---------------------------------------------------------------------- */

const REQUEST_FRAMES = [
  "could you",
  "can you",
  "would you",
  "i'd like",
  "i would like",
  "may i",
  "can i",
  "please",
  "excuse me",
];

const FRAME_WORDS = new Set(
  REQUEST_FRAMES.flatMap((f) => f.split(" ")).concat(["i'd", "id"]),
);

const STOP_WORDS = new Set([
  "a", "an", "the", "to", "of", "that", "this", "it", "is", "for", "me", "my",
]);

/** intent wording -> content cues that satisfy it even without a frame. */
const INTENT_CUES: Array<[RegExp, string[]]> = [
  [/注文|order/iu, ["order", "have", "get", "like"]],
  [/気付|気づ|呼|attention|notice/iu, ["excuse me", "hello", "hi", "sorry"]],
  [/もう一度|繰り返|聞き|聞こえ|repeat|again|pardon/iu, ["again", "repeat", "say", "pardon", "sorry", "slowly"]],
  [/待|時間|wait|moment/iu, ["moment", "minute", "second", "wait"]],
  [/おすすめ|recommend/iu, ["recommend", "suggest", "popular", "best"]],
  [/確認|check|confirm/iu, ["right", "correct", "check", "still"]],
];

function tokenOverlapRatio(reference: string, candidate: string): number {
  const refTokens = reference.split(" ").filter((t) => !STOP_WORDS.has(t));
  if (refTokens.length === 0) return 0;
  const candidateTokens = new Set(candidate.split(" "));
  const matched = refTokens.filter((t) => candidateTokens.has(t));
  return matched.length / refTokens.length;
}

/** Friendly deterministic closing line once a scene's script is exhausted. */
export const MOCK_CLOSING_LINE = "Great — you're all set. Have a nice day!";

export class MockProvider implements AiProvider {
  getIntentOptions(
    scene: Scene,
    utterance: string,
    turns?: ConversationTurn[],
  ): Promise<IntentOptionsResult> {
    const attempt = findAttempt(scene.id, utterance);
    const fixtureOptions = (attempt?.intent_options ?? [])
      .filter(
        (o): o is { text_en: string; text_ja: string; icon: string } =>
          typeof o === "object" &&
          o !== null &&
          typeof o.text_en === "string" &&
          o.text_en.trim().length > 0 &&
          typeof o.text_ja === "string" &&
          o.text_ja.trim().length > 0 &&
          typeof o.icon === "string" &&
          o.icon.trim().length > 0,
      )
      .map((o): IntentOption => ({ textEn: o.text_en, textJa: o.text_ja, icon: o.icon }));
    if (fixtureOptions.length >= 3) {
      return Promise.resolve({ options: fixtureOptions.slice(0, 5) });
    }
    return Promise.resolve(fallbackIntentOptions(scene, utterance, turns));
  }

  improve(scene: Scene, utterance: string, intent: string): Promise<Improvement> {
    const attempt = findAttempt(scene.id, utterance);
    if (attempt) {
      const wanted = intent.trim();
      const hit = attemptVariants(attempt).find((v) => v.selected_intent.trim() === wanted);
      if (hit) {
        return Promise.resolve({
          originalUtterance: utterance,
          selectedIntent: intent,
          improvedUtterance: hit.improved_utterance,
          primaryDiff: hit.primary_diff,
          meaningEn: hit.meaning_en,
          reasonEn: hit.reason_en,
          meaningJa: hit.meaning_ja,
          reasonJa: hit.reason_ja,
        });
      }
    }
    return Promise.resolve(ruleBasedImprovement(scene, utterance, intent));
  }

  respond(scene: Scene, utterance: string, turns?: ConversationTurn[]): Promise<RespondResult> {
    const norm = normalizeUtterance(utterance);
    const words = norm.split(" ").filter(Boolean);
    // 発話が既に十分伝わるなら、UIは意図選択を強制せず祝福する(D9)。
    const adequate = this.judgeAdequate(scene, norm);
    // The NPC "completes" only when the utterance was fragmentary (<= 2 words).
    const completed = !adequate && words.length > 0 && words.length <= 2;

    // D12 deterministic script: the current utterance is learner turn N
    // (0-based, counted from `turns`), answered by follow_up_turns[N];
    // past the script the NPC closes the exchange.
    const scenario = loadRawScenarios().scenarios.find((s) => s.id === scene.id);
    const followUps = Array.isArray(scenario?.follow_up_turns)
      ? scenario.follow_up_turns.filter((t): t is string => typeof t === "string" && t.length > 0)
      : [];
    const learnerTurnsSoFar = (turns ?? []).filter((t) => t.speaker === "learner").length;
    const scripted = learnerTurnsSoFar < followUps.length ? followUps[learnerTurnsSoFar] : null;
    const npcReply = scripted ?? MOCK_CLOSING_LINE;
    // Done when the script is exhausted (this reply is the closing line) or
    // the utterance already communicated adequately (D12: adequate ⇒ done).
    const done = scripted === null || adequate;

    let completion: string;
    switch (scene.id) {
      case "cafe-order":
        completion = "店員は「これを1つ注文したい」という意味に補って受け取りました。";
        break;
      case "missing-order":
        completion = "店員は「注文がまだ届いていない」という意味に補って受け取りました。";
        break;
      case "did-not-understand":
        completion = "相手は聞き返しだと補って受け取り、もう一度言い直してくれました。";
        break;
      default:
        completion = "相手は文脈から意味を補って受け取りました。";
        break;
    }

    return Promise.resolve({
      npcReply,
      completionNote: completed ? completion : null,
      adequate,
      adequacyNote: adequate
        ? "そのひとことで、ちゃんと伝わりました。この場面はもう自分のものです。"
        : null,
      done,
    });
  }

  /**
   * Communicative adequacy of the FIRST utterance, judged without any chosen
   * intention (the AI never decides the intention — only whether the words
   * already work in this scene). Conservative: fixture-overlap or an explicit
   * request frame plus content.
   */
  private judgeAdequate(scene: Scene, norm: string): boolean {
    if (!norm) return false;

    const scenario = loadRawScenarios().scenarios.find((s) => s.id === scene.id);
    if (scenario) {
      for (const raw of scenario.mock_attempts) {
        for (const variant of attemptVariants(raw as FixtureAttempt)) {
          const reference = normalizeUtterance(variant.improved_utterance);
          if (reference && tokenOverlapRatio(reference, norm) >= 0.8) return true;
        }
      }
    }

    if (REQUEST_FRAMES.some((frame) => norm.includes(frame))) {
      const content = norm
        .split(" ")
        .filter((t) => t.length >= 3 && !FRAME_WORDS.has(t) && !STOP_WORDS.has(t));
      if (content.length >= 1) return true;
    }

    return false;
  }

  evaluateRetry(scene: Scene, intent: string, utterance: string): Promise<RetryEvaluation> {
    const norm = normalizeUtterance(utterance);
    const communicated = this.judgeCommunicated(scene, intent, norm);
    // D7: encouraging, non-punishing feedback in both outcomes. The false case
    // gently points toward the missing chunk without scolding.
    const hint = ruleBasedImprovement(scene, utterance || "this", intent).primaryDiff;
    const note = communicated
      ? "意図がしっかり伝わりました!この一言があれば相手はすぐ動けます。"
      : `もう一歩です!「${hint} …」のようなひとことを添えると、選んだ意図がぐっと伝わりますよ。`;
    return Promise.resolve({ communicated, note });
  }

  private judgeCommunicated(scene: Scene, intent: string, norm: string): boolean {
    if (!norm) return false;

    // 1. Loose match against any fixture improvement for this intent in the
    //    scene (word overlap, not string equality).
    const scenario = loadRawScenarios().scenarios.find((s) => s.id === scene.id);
    if (scenario) {
      const wanted = intent.trim();
      for (const raw of scenario.mock_attempts) {
        for (const variant of attemptVariants(raw as FixtureAttempt)) {
          if (variant.selected_intent.trim() !== wanted) continue;
          const reference = normalizeUtterance(variant.improved_utterance);
          if (reference && tokenOverlapRatio(reference, norm) >= 0.6) return true;
        }
      }
    }

    // 2. Request/politeness frame + at least one content word beyond it.
    if (REQUEST_FRAMES.some((frame) => norm.includes(frame))) {
      const content = norm
        .split(" ")
        .filter((t) => t.length >= 3 && !FRAME_WORDS.has(t) && !STOP_WORDS.has(t));
      if (content.length >= 1) return true;
    }

    // 3. Intent-specific semantic cues (e.g. attention intents satisfied by
    //    "Excuse me" alone).
    for (const [pattern, cues] of INTENT_CUES) {
      if (pattern.test(intent) && cues.some((cue) => norm.includes(cue))) return true;
    }

    return false;
  }
}
