import { z } from "zod";
import { BriefingQuestionSchema } from "../../briefing";
import { BriefingPresentationPreferenceSchema, BriefingScriptSchema } from "../../script";
import { BriefingSessionSchema } from "../../session";
import { PersonalImpactContextSchema } from "../../personalization/validation";
import {
  BRIEFING_RUN_STAGES,
  type BriefingRunOutcome,
  type BriefingRunReceipt,
  type BriefingRunResult,
  type BriefingRunSemanticLineage,
  type CreateBriefingRequest,
} from "./types";

const Fingerprint = z.string().trim().min(1);
const Reason = z.string().trim().min(1).optional();

export const CreateBriefingRequestSchema: z.ZodType<CreateBriefingRequest> =
  z.strictObject({
    question: BriefingQuestionSchema,
    presentationPreference: BriefingPresentationPreferenceSchema,
    personalImpactContext: PersonalImpactContextSchema.optional(),
  }).superRefine((request, context) => {
    if (
      request.personalImpactContext?.consent.enabled === true &&
      !request.question.personalizationRequested
    ) {
      context.addIssue({
        code: "custom",
        path: ["question", "personalizationRequested"],
        message: "Enabled personal impact context requires an explicit personalization request.",
      });
    }
  });

export const BriefingRunStageSchema = z.enum(BRIEFING_RUN_STAGES);

export const RuntimeRunIdSchema = z.string().trim().min(1);

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

export const BriefingRunReceiptSchema: z.ZodType<BriefingRunReceipt> =
  z.strictObject({
    runId: RuntimeRunIdSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    finalStage: BriefingRunStageSchema,
    outcomeKind: z.enum([
      "completed",
      "clarification-required",
      "insufficient-evidence",
      "generation-unavailable",
      "policy-rejected",
      "cancelled",
      "failed",
    ]),
    contractFingerprint: Fingerprint.optional(),
    contextFingerprint: Fingerprint.optional(),
    explanationPlanFingerprint: Fingerprint.optional(),
    scriptFingerprint: Fingerprint.optional(),
    sessionFingerprint: Fingerprint.optional(),
    evidenceCount: z.number().int().nonnegative().optional(),
    sceneCount: z.number().int().nonnegative().optional(),
    failureCategory: z.enum([
      "invalid-request",
      "contract-invalid",
      "context-unavailable",
      "generation-unavailable",
      "invalid-proposal",
      "script-invalid",
      "session-invalid",
      "invariant-violation",
      "unexpected",
    ]).optional(),
  }).superRefine((receipt, context) => {
    if (receipt.completedAt < receipt.startedAt) {
      context.addIssue({ code: "custom", message: "Receipt completion precedes start." });
    }
    if (receipt.outcomeKind === "completed" && (
      receipt.finalStage !== "completed" ||
      !receipt.contractFingerprint ||
      !receipt.contextFingerprint ||
      !receipt.explanationPlanFingerprint ||
      !receipt.scriptFingerprint ||
      !receipt.sessionFingerprint
    )) {
      context.addIssue({ code: "custom", message: "Completed receipt requires full lineage." });
    }
    if (receipt.outcomeKind !== "completed" && receipt.finalStage === "completed") {
      context.addIssue({ code: "custom", message: "Only completed outcomes may finish at completed." });
    }
  });

export const BriefingRunResultSchema: z.ZodType<BriefingRunResult> =
  z.strictObject({
    runId: RuntimeRunIdSchema,
    outcome: BriefingRunOutcomeSchema,
    receipt: BriefingRunReceiptSchema,
  }).superRefine((result, context) => {
    if (result.runId !== result.receipt.runId) {
      context.addIssue({ code: "custom", message: "Result and receipt run IDs differ." });
    }
    if (
      result.outcome.kind !== result.receipt.outcomeKind ||
      result.outcome.finalStage !== result.receipt.finalStage
    ) {
      context.addIssue({ code: "custom", message: "Outcome and receipt terminal state differ." });
    }
  });
