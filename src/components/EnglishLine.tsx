/**
 * EnglishLine — renders an improved utterance with the primary chunk
 * visually isolated inside the sentence (acceptance A6).
 */
import { splitByChunk } from "../diff";
import { speakLine } from "../speech";

interface EnglishLineProps {
  sentence: string;
  chunk?: string | null;
  /** Show a small listen button (D7 listening practice). */
  speakable?: boolean;
}

export default function EnglishLine({ sentence, chunk = null, speakable = false }: EnglishLineProps) {
  const split = chunk ? splitByChunk(sentence, chunk) : null;
  return (
    <span className="en-line" lang="en">
      {split ? (
        <>
          {split.pre}
          <mark className="en-chunk">{split.chunk}</mark>
          {split.post}
        </>
      ) : chunk ? (
        <mark className="en-chunk">{sentence}</mark>
      ) : (
        sentence
      )}
      {speakable && (
        <button
          type="button"
          className="en-listen"
          aria-label="聞いてみる"
          onClick={() => speakLine(sentence)}
        >
          ▶
        </button>
      )}
    </span>
  );
}
