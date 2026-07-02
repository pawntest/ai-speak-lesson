/**
 * MockProvider — default, deterministic, zero-cost (D6).
 *
 * 1. Fixture path: SCENARIOS.json `mock_attempts` matched case/punctuation-
 *    insensitively (supports both the flat shape and the `variants` shape).
 * 2. Rule-based fallback for ANY unseen utterance/intent so the flow never
 *    dead-ends: neutral JA intent options from scene context; improvement that
 *    preserves the learner's words and adds exactly ONE semantic chunk.
 * No randomness anywhere: same input -> same output.
 */
import type {
  Improvement,
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
  meaning_ja: string;
  reason_ja: string;
}

interface FixtureAttempt {
  user_utterance?: string;
  intent_options?: string[];
  variants?: FixtureVariant[];
  selected_intent?: string;
  improved_utterance?: string;
  primary_diff?: string;
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
    typeof attempt.meaning_ja === "string" &&
    typeof attempt.reason_ja === "string"
  ) {
    pool.push({
      selected_intent: attempt.selected_intent,
      improved_utterance: attempt.improved_utterance,
      primary_diff: attempt.primary_diff,
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
  let meaningJa: string;
  let reasonJa: string;

  if (/おすすめ|お薦め|recommend/iu.test(intent)) {
    improvedUtterance = "What do you recommend?";
    primaryDiff = "What do you recommend";
    meaningJa = "「おすすめは何ですか」と相手に提案を求める言い方";
    reasonJa = `${scene.location}では、相手に選択を委ねる一言で会話が自然に進むから`;
  } else if (/気付|気づ|呼び|呼んで|注意|attention|notice/iu.test(intent)) {
    improvedUtterance = `Excuse me, ${lowered}.`;
    primaryDiff = "Excuse me";
    meaningJa = "「すみません」と相手の注意をこちらへ向ける丁寧な呼びかけ";
    reasonJa = `${scene.location}では、用件の前にまず一言で相手に気付いてもらう必要があるから`;
  } else if (/ゆっくり|slow/iu.test(intent)) {
    improvedUtterance = "Could you speak more slowly?";
    primaryDiff = "Could you speak more";
    meaningJa = "「〜してもらえますか」と相手に負担なくお願いする形";
    reasonJa = `${scene.location}で聞き取りづらいとき、責めずに速さだけを変えてもらえるから`;
  } else if (/もう一度|もう1度|聞き|聞こえ|繰り返|repeat|again|pardon/iu.test(intent)) {
    improvedUtterance = "Could you say that again?";
    primaryDiff = "Could you say that";
    meaningJa = "相手に同じ内容をもう一度言ってもらうお願いの形";
    reasonJa = `${scene.location}で聞き取れなかったとき、丁寧に繰り返しを頼めるから`;
  } else if (/確認|確かめ|check|confirm|clarify/iu.test(intent)) {
    improvedUtterance = `${capitalize(lowered)}, right?`;
    primaryDiff = "right";
    meaningJa = "「〜で合っていますか」と軽く確かめる付け足しの一言";
    reasonJa = `${scene.location}では、短い確認を添えるだけで認識違いを防げるから`;
  } else if (/待|時間|wait|moment/iu.test(intent)) {
    improvedUtterance = "One moment, please.";
    primaryDiff = "One moment";
    meaningJa = "「少し待ってください」と時間がほしいことを伝える定型表現";
    reasonJa = `${scene.location}では、黙るより一言伝える方が相手も安心して待てるから`;
  } else if (/i'?d like|i would like|could you|can i|may i|please/iu.test(core)) {
    // The learner already used a politeness frame — keep it and just finish
    // the sentence cleanly; the frame itself is the chunk to reinforce.
    improvedUtterance = `${capitalize(core)}.`;
    const match = /i'?d like|i would like|could you|can i|may i|please/iu.exec(improvedUtterance);
    primaryDiff = match ? match[0] : improvedUtterance.slice(0, -1);
    meaningJa = "自分の希望をお願いの形で伝える言い方";
    reasonJa = `${scene.location}では、この形にすると要求ではなく依頼として伝わるから`;
  } else {
    improvedUtterance = `I'd like ${lowered}.`;
    primaryDiff = "I'd like";
    meaningJa = "「〜がほしいです」と自分の希望を丁寧に伝える形";
    reasonJa = `${scene.location}では、単語だけより希望の形にすると意図がはっきり伝わるから`;
  }

  return {
    originalUtterance: utterance,
    selectedIntent: intent,
    improvedUtterance,
    primaryDiff,
    meaningJa,
    reasonJa,
  };
}

/** Deterministic neutral JA options built from scene context (no ranking). */
function fallbackIntentOptions(scene: Scene): IntentOptionsResult {
  return {
    options: [
      scene.npcOpening
        ? "相手の言ったことを確認したかった"
        : "相手に気付いてほしかった",
      "自分の用件を伝えたかった",
      "質問をしたかった",
      "少し時間がほしかった",
    ],
  };
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

export class MockProvider implements AiProvider {
  getIntentOptions(scene: Scene, utterance: string): Promise<IntentOptionsResult> {
    const attempt = findAttempt(scene.id, utterance);
    const fixtureOptions = attempt?.intent_options?.filter(
      (o) => typeof o === "string" && o.trim().length > 0,
    );
    if (fixtureOptions && fixtureOptions.length >= 3) {
      return Promise.resolve({ options: fixtureOptions.slice(0, 5) });
    }
    return Promise.resolve(fallbackIntentOptions(scene));
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
          meaningJa: hit.meaning_ja,
          reasonJa: hit.reason_ja,
        });
      }
    }
    return Promise.resolve(ruleBasedImprovement(scene, utterance, intent));
  }

  respond(scene: Scene, utterance: string): Promise<RespondResult> {
    const words = normalizeUtterance(utterance).split(" ").filter(Boolean);
    // The NPC "completes" only when the utterance was fragmentary (<= 2 words).
    const completed = words.length > 0 && words.length <= 2;

    let npcReply: string;
    let completion: string;
    switch (scene.id) {
      case "cafe-order":
        npcReply = "Sure — coming right up!";
        completion = "店員は「これを1つ注文したい」という意味に補って受け取りました。";
        break;
      case "missing-order":
        npcReply = "Oh — let me check on that for you.";
        completion = "店員は「注文がまだ届いていない」という意味に補って受け取りました。";
        break;
      case "did-not-understand":
        npcReply = "Sure — would you like a receipt?";
        completion = "相手は聞き返しだと補って受け取り、もう一度言い直してくれました。";
        break;
      default:
        npcReply = "Okay, got it!";
        completion = "相手は文脈から意味を補って受け取りました。";
        break;
    }

    return Promise.resolve({
      npcReply,
      completionNote: completed ? completion : null,
    });
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
