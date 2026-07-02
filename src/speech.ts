/**
 * Web Speech API adapter (decision D1, acceptance A14).
 * - Recognition: transcript only — raw audio is never stored anywhere.
 * - Synthesis: best-effort, always optional; failures are silent.
 */

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  const w = globalThis as Record<string, unknown>;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as SpeechRecognitionCtor) : null;
}

export function speechRecognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

export interface DictationHandle {
  cancel(): void;
}

export interface DictationCallbacks {
  /** Called with the best transcript (interim and final). */
  onTranscript(transcript: string, isFinal: boolean): void;
  onEnd(): void;
  onError(): void;
}

/** Start one-shot en-US dictation. Returns null when unsupported. */
export function startDictation(callbacks: DictationCallbacks): DictationHandle | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  let recognition: SpeechRecognitionLike;
  try {
    recognition = new Ctor();
  } catch {
    return null;
  }
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i += 1) {
      const alt = event.results[i]?.[0];
      if (alt) text += alt.transcript;
    }
    if (text.trim()) callbacks.onTranscript(text.trim(), false);
  };
  recognition.onend = () => callbacks.onEnd();
  recognition.onerror = () => callbacks.onError();
  try {
    recognition.start();
  } catch {
    return null;
  }
  return {
    cancel() {
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
    },
  };
}

/** Speak an English line aloud (optional listening practice). */
export function speakLine(text: string, rate = 1): void {
  try {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    synth.speak(utterance);
  } catch {
    // synthesis is strictly optional
  }
}

export function stopSpeaking(): void {
  try {
    globalThis.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
}
