/**
 * MicInput — voice-first response bar with an always-visible text fallback.
 * Web Speech recognition (en-US) fills the input with the transcript only;
 * no audio is ever stored (A14). Enter submits; one-word answers are fine.
 */
import { useEffect, useRef, useState } from "react";
import { speechRecognitionSupported, startDictation, type DictationHandle } from "../speech";

interface MicInputProps {
  onSubmit(text: string): void;
  disabled?: boolean;
  submitLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function MicInput({
  onSubmit,
  disabled = false,
  submitLabel = "Say it",
  placeholder = "Say it in English — one word is fine",
  autoFocus = false,
}: MicInputProps) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const handleRef = useRef<DictationHandle | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const micSupported = speechRecognitionSupported();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    return () => handleRef.current?.cancel();
  }, []);

  function stopListening() {
    handleRef.current?.cancel();
    handleRef.current = null;
    setListening(false);
  }

  function toggleMic() {
    if (listening) {
      stopListening();
      return;
    }
    const handle = startDictation({
      onTranscript(transcript) {
        setText(transcript);
      },
      onEnd() {
        setListening(false);
        handleRef.current = null;
        inputRef.current?.focus();
      },
      onError() {
        setListening(false);
        handleRef.current = null;
      },
    });
    if (handle) {
      handleRef.current = handle;
      setListening(true);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    stopListening();
    setText("");
    onSubmit(trimmed);
  }

  return (
    <form className="say-bar" onSubmit={handleSubmit}>
      {micSupported && (
        <button
          type="button"
          className={`mic-btn${listening ? " mic-live" : ""}`}
          onClick={toggleMic}
          disabled={disabled}
          aria-label={listening ? "Stop listening" : "Answer by voice"}
          aria-pressed={listening}
        >
          {listening ? "●" : "🎙"}
        </button>
      )}
      <input
        ref={inputRef}
        className="say-input"
        type="text"
        lang="en"
        value={text}
        placeholder={listening ? "Listening…" : placeholder}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="send"
      />
      <button type="submit" className="say-submit" disabled={disabled || !text.trim()}>
        {submitLabel}
      </button>
    </form>
  );
}
