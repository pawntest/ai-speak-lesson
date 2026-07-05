/**
 * Zod schemas mirroring the AI-produced shared types.
 * Used server-side to validate structured AI output before it reaches clients
 * (product-summary failure mode 5: malformed AI JSON must never crash the flow).
 */
import { z } from "zod";
import type {
  ConversationTurn,
  Improvement,
  IntentOption,
  IntentOptionsResult,
  RespondResult,
  RetryEvaluation,
} from "./types";

export const intentOptionSchema = z.object({
  textEn: z.string().min(1),
  textJa: z.string().min(1),
  icon: z.string().min(1),
}) satisfies z.ZodType<IntentOption>;

export const intentOptionsResultSchema = z.object({
  options: z.array(intentOptionSchema).min(3).max(5),
}) satisfies z.ZodType<IntentOptionsResult>;

export const improvementSchema = z.object({
  originalUtterance: z.string(),
  selectedIntent: z.string(),
  improvedUtterance: z.string().min(1),
  primaryDiff: z.string().min(1),
  meaningEn: z.string().min(1),
  reasonEn: z.string().min(1),
  meaningJa: z.string().min(1),
  reasonJa: z.string().min(1),
}) satisfies z.ZodType<Improvement>;

export const retryEvaluationSchema = z.object({
  communicated: z.boolean(),
  note: z.string(),
}) satisfies z.ZodType<RetryEvaluation>;

export const conversationTurnSchema = z.object({
  speaker: z.enum(["learner", "npc"]),
  text: z.string().min(1),
}) satisfies z.ZodType<ConversationTurn>;

export const respondResultSchema = z.object({
  npcReply: z.string().nullable(),
  completionNote: z.string().nullable(),
  adequate: z.boolean(),
  adequacyNote: z.string().nullable(),
  done: z.boolean(),
}) satisfies z.ZodType<RespondResult>;
