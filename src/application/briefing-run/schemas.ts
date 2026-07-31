import { z } from "zod";
import { BriefingQuestionSchema } from "../../briefing";
import { BriefingPresentationPreferenceSchema, BriefingScriptSchema } from "../../script";
import { BriefingSessionSchema } from "../../session";
import {
  BRIEFING_RUN_STAGES,
  type BriefingRunOutcome,
  type BriefingRunSemanticLineage,
  type CreateBriefingRequest,
} from "./types";

const Fingerprint = z.string().trim().min(1);
const Reason = z.string().trim().min(1).optional();

export const CreateBriefingRequestSchema: z.ZodType<CreateBriefingRequest> =
  z.strictObject({
    question: BriefingQuestionSchema,
    presentationPreference: BriefingPresentationPreferenceSchema,
  });

export const BriefingRunStageSchema = z.enum(BRIEFING_RUN_STAGES);

export const BriefingRunSemanticLineageSchema:
z.ZodType<BriefingRunSemanticLineage> = z.strictObject({
  contractFingerprint: Fingerprint,
  contextFingerprint: Fingerprint,
  explanationPlanFingerprint: Fingerprint,
  scriptFingerprint: Fingerprint,
  sessionFingerprint: Fingerprint,
});

const nonTechnical = {
  finalStage: BriefingRunStageSchema,
  technical: z.literal(false),
  reason: Reason,
};

export const BriefingRunOutcomeSchema: z.ZodType<BriefingRunOutcome> =
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("completed"),
      finalStage: z.literal("completed"),
      technical: z.literal(false),
      script: BriefingScriptSchema.and(z.object({
        status: z.enum(["validated", "static-only"]),
      })),
      session: BriefingSessionSchema,
      lineage: BriefingRunSemanticLineageSchema,
    }),
    z.strictObject({ kind: z.literal("clarification-required"), ...nonTechnical }),
    z.strictObject({ kind: z.literal("insufficient-evidence"), ...nonTechnical }),
    z.strictObject({ kind: z.literal("generation-unavailable"), ...nonTechnical }),
    z.strictObject({ kind: z.literal("policy-rejected"), ...nonTechnical }),
    z.strictObject({ kind: z.literal("cancelled"), ...nonTechnical }),
    z.strictObject({
      kind: z.literal("failed"),
      finalStage: BriefingRunStageSchema,
      technical: z.literal(true),
      category: z.enum([
        "request-invalid",
        "contract-invalid",
        "context-failed",
        "generation-failed",
        "script-failed",
        "session-invalid",
        "lineage-mismatch",
        "unexpected",
      ]),
      reason: Reason,
    }),
  ]);

