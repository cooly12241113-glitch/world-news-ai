import { z } from "zod";

export const REPLAN_SCOPES = [
  "answer-current-context",
  "revise-current-scene",
  "append-scenes",
  "replace-remaining-scenes",
  "rebuild-entire-briefing",
  "clarification-required",
  "unsupported",
] as const;

export type ReplanScope = (typeof REPLAN_SCOPES)[number];
export const ReplanScopeSchema = z.enum(REPLAN_SCOPES);
