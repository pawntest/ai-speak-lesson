/**
 * Pure helper for the context-difference view (acceptance A6):
 * isolate the primary chunk inside the improved utterance.
 */
export interface ChunkSplit {
  pre: string;
  chunk: string;
  post: string;
}

/**
 * Split `sentence` around the first occurrence of `chunk`.
 * Falls back to a case-insensitive match; returns null when the chunk
 * cannot be located (caller then highlights the whole sentence).
 */
export function splitByChunk(sentence: string, chunk: string): ChunkSplit | null {
  const trimmed = chunk.trim();
  if (!trimmed) return null;

  let idx = sentence.indexOf(trimmed);
  if (idx === -1) {
    idx = sentence.toLowerCase().indexOf(trimmed.toLowerCase());
  }
  if (idx === -1) return null;

  return {
    pre: sentence.slice(0, idx),
    chunk: sentence.slice(idx, idx + trimmed.length),
    post: sentence.slice(idx + trimmed.length),
  };
}
