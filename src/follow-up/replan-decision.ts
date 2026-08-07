import { z } from "zod";
import type { BriefingPresentationPreference } from "../script/models";
import { BriefingPresentationPreferenceSchema } from "../script/validation";
import type { SceneReplacementMapping } from "../session";
import { SceneReplacementMappingSchema } from "../session";
import type { ReplanScope } from "./replan-scope";
import { ReplanScopeSchema } from "./replan-scope";

export const FOLLOW_UP_RULE_CODES = [
  "CURRENT_CONTEXT_SOURCE_REQUEST",
  "CURRENT_SCENE_COUNTEREVIDENCE",
  "APPEND_IMPACT_SCENE",
  "REPLACE_REMAINING_FROM_HERE",
  "FULL_REBUILD_RESTART",
  "FULL_REBUILD_PERSONAL_CONTEXT_CHANGE",
  "FULL_REBUILD_REMOVE_PERSONALIZATION",
  "CURRENT_CONTEXT_PERSONAL_IMPACT_EXPLANATION",
  "CURRENT_CONTEXT_VALIDATED_COUNTER_SCENARIO",
  "AMBIGUOUS_REFERENT",
  "UNSUPPORTED_SYSTEM_ACTION",
  "COMPOUND_SCOPE_REQUIRES_CLARIFICATION",
  "NO_EXPLICIT_SCOPE",
] as const;
export type FollowUpRuleCode = (typeof FOLLOW_UP_RULE_CODES)[number];

export interface ReplanDecision {
  decisionId: string;
  followUpId: string;
  scope: ReplanScope;
  confidenceBand: "high" | "medium" | "low";
  matchedRuleCodes: FollowUpRuleCode[];
  clarificationReason?: string;
  unsupportedReason?: string;
  preservesCurrentScript: boolean;
  requiresReplacementScript: boolean;
  requiresNewEvidence: boolean;
  suggestedSceneMappingPolicy?: SceneReplacementMapping["strategy"];
  requestedPresentationPreference?: BriefingPresentationPreference;
  policyVersion: string;
  semanticFingerprint: string;
}

const Id = z.string().trim().min(1);
export const ReplanDecisionSchema: z.ZodType<ReplanDecision> = z.strictObject({
  decisionId: Id,
  followUpId: Id,
  scope: ReplanScopeSchema,
  confidenceBand: z.enum(["high", "medium", "low"]),
  matchedRuleCodes: z.array(z.enum(FOLLOW_UP_RULE_CODES)).min(1),
  clarificationReason: Id.optional(),
  unsupportedReason: Id.optional(),
  preservesCurrentScript: z.boolean(),
  requiresReplacementScript: z.boolean(),
  requiresNewEvidence: z.boolean(),
  suggestedSceneMappingPolicy: z.enum([
    "preserve-current-scene",
    "map-to-replacement-scene",
    "map-to-nearest-preceding-scene",
    "move-to-first-new-scene",
    "restart-at-opening",
  ]).optional(),
  requestedPresentationPreference: BriefingPresentationPreferenceSchema.optional(),
  policyVersion: Id,
  semanticFingerprint: Id,
}).superRefine((decision, context) => {
  if (decision.scope === "clarification-required" && !decision.clarificationReason) {
    context.addIssue({ code: "custom", message: "Clarification reason is required." });
  }
  if (decision.scope === "unsupported" && !decision.unsupportedReason) {
    context.addIssue({ code: "custom", message: "Unsupported reason is required." });
  }
});
