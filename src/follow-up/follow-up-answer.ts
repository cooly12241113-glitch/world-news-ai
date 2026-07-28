import { z } from "zod";
import { createSemanticFingerprint } from "../briefing";
import type { EvidenceAllowlist } from "./follow-up-context";

export const FOLLOW_UP_ANSWER_TYPES = [
  "source-list",
  "evidence-summary",
  "data-provenance",
  "uncertainty-explanation",
  "claim-support-status",
] as const;

export interface FollowUpAnswerPlan {
  answerPlanId: string;
  followUpId: string;
  sessionId: string;
  sceneId: string;
  answerType: (typeof FOLLOW_UP_ANSWER_TYPES)[number];
  evidenceBindings: string[];
  statementTypes: Array<
    "confirmed-fact" | "attributed-claim" | "uncertainty" | "unknown"
  >;
  uncertaintyNotes: string[];
  missingEvidence: string[];
  semanticFingerprint: string;
}

const Id = z.string().trim().min(1);
export const FollowUpAnswerPlanSchema: z.ZodType<FollowUpAnswerPlan> =
  z.strictObject({
    answerPlanId: Id,
    followUpId: Id,
    sessionId: Id,
    sceneId: Id,
    answerType: z.enum(FOLLOW_UP_ANSWER_TYPES),
    evidenceBindings: z.array(Id),
    statementTypes: z.array(z.enum([
      "confirmed-fact", "attributed-claim", "uncertainty", "unknown",
    ])),
    uncertaintyNotes: z.array(Id),
    missingEvidence: z.array(Id),
    semanticFingerprint: Id,
  });

export function createFollowUpAnswerPlan(
  plan: Omit<FollowUpAnswerPlan, "semanticFingerprint">,
  allowlist: EvidenceAllowlist,
): FollowUpAnswerPlan {
  const allowed = new Set(Object.values(allowlist).flat());
  if (plan.evidenceBindings.some((id) => !allowed.has(id))) {
    throw new Error("Answer plan references evidence outside the allowlist.");
  }
  if (
    plan.statementTypes.includes("confirmed-fact") &&
    plan.evidenceBindings.length === 0
  ) {
    throw new Error("Confirmed facts require an allowlisted evidence binding.");
  }
  return {
    ...plan,
    semanticFingerprint: createSemanticFingerprint({
      followUpId: plan.followUpId,
      sessionId: plan.sessionId,
      sceneId: plan.sceneId,
      answerType: plan.answerType,
      evidenceBindings: [...plan.evidenceBindings].sort(),
      statementTypes: [...plan.statementTypes].sort(),
      uncertaintyNotes: plan.uncertaintyNotes,
      missingEvidence: plan.missingEvidence,
    }),
  };
}
