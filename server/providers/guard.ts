/**
 * Rule enforcement for AI-produced structured output (product-summary
 * failure modes 2 and 5). Anything that fails here is replaced by a safe
 * deterministic MockProvider result — never a 500 to the user.
 */
import { z } from "zod";
import { improvementSchema } from "../../shared/schemas";
import type { Improvement, RespondResult } from "../../shared/types";

/** One-chunk-better means SHORT: beginner-level, single sentence, <= 12 words. */
export const MAX_IMPROVED_WORDS = 12;

/** Zod schema for the D3 /api/respond response (not part of shared/schemas). */
export const respondResultSchema = z.object({
  npcReply: z.string().nullable(),
  completionNote: z.string().nullable(),
}) satisfies z.ZodType<RespondResult>;

/**
 * Returns null when the improvement satisfies every product rule, otherwise a
 * short reason string (used for logging / fallback decisions):
 * - matches the shared zod schema
 * - improvedUtterance is one short sentence (<= MAX_IMPROVED_WORDS words)
 * - primaryDiff is a substring of improvedUtterance
 * - meaningJa and reasonJa are distinct texts
 */
export function findImprovementViolation(value: unknown): string | null {
  const parsed = improvementSchema.safeParse(value);
  if (!parsed.success) {
    return `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
  }
  const imp: Improvement = parsed.data;

  const words = imp.improvedUtterance.trim().split(/\s+/).filter(Boolean);
  if (words.length > MAX_IMPROVED_WORDS) {
    return `improvedUtterance too long (${words.length} words > ${MAX_IMPROVED_WORDS})`;
  }

  // Multi-sentence rewrites are more than one chunk. Strip the final
  // terminator, then any remaining terminator means a second sentence.
  const body = imp.improvedUtterance.trim().replace(/[.!?。！？]+$/u, "");
  if (/[.!?。！？]/u.test(body)) {
    return "improvedUtterance is multi-sentence (must be one chunk)";
  }

  if (!imp.improvedUtterance.includes(imp.primaryDiff)) {
    return "primaryDiff is not a substring of improvedUtterance";
  }

  if (imp.meaningJa.trim() === imp.reasonJa.trim()) {
    return "meaningJa and reasonJa must be distinct texts";
  }

  return null;
}
