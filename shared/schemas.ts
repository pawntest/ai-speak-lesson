/**
 * Zod schemas mirroring the AI-produced shared types.
 * Used server-side to validate structured AI output before it reaches clients
 * (product-summary failure mode 5: malformed AI JSON must never crash the flow).
 */
import { z } from "zod";
import type { Improvement, IntentOptionsResult, RespondResult, RetryEvaluation } from "./types";

export const intentOptionsResultSchema = z.object({
  options: z.array(z.string().min(1)).min(3).max(5),
}) satisfies z.ZodType<IntentOptionsResult>;

export const improvementSchema = z.object({
  originalUtterance: z.string(),
  selectedIntent: z.string(),
  improvedUtterance: z.string().min(1),
  primaryDiff: z.string().min(1),
  meaningJa: z.string().min(1),
  reasonJa: z.string().min(1),
}) satisfies z.ZodType<Improvement>;

export const retryEvaluationSchema = z.object({
  communicated: z.boolean(),
  note: z.string(),
}) satisfies z.ZodType<RetryEvaluation>;

export const respondResultSchema = z.object({
  npcReply: z.string().nullable(),
  completionNote: z.string().nullable(),
  adequate: z.boolean(),
  adequacyNote: z.string().nullable(),
}) satisfies z.ZodType<RespondResult>;
