import { z } from "zod";
import type { FollowUpAnswerPlan, ReplanScope } from "../follow-up";
import { FollowUpAnswerPlanSchema, ReplanScopeSchema } from "../follow-up";
import type { ValidatedBriefingScript } from "../script";
import { BriefingScriptSchema } from "../script";
import type {
  ReplacementSessionIdentity,
  SceneReplacementMapping,
} from "../session";
import type { EvidenceContinuityAssessment } from "./evidence-continuity";
import { EvidenceContinuityAssessmentSchema } from "./evidence-continuity";
import {
  ReplacementSessionIdentitySchema,
  SceneReplacementMappingSchema,
} from "../session";
import type { ReplanRequest } from "./replan-request";

interface ResultIdentity {
  resultId: string;
  operationId: string;
  startedFromSessionFingerprint: string;
  policyVersion: string;
  semanticFingerprint: string;
}

export type ReplanResult =
  | (ResultIdentity & {
      outcome: "current-context-answer";
      answerPlan: FollowUpAnswerPlan;
    })
  | (ResultIdentity & {
      outcome: "replacement-ready";
      replacement: ReplacementSessionIdentity;
      validatedReplacementScript: ValidatedBriefingScript;
      sceneReplacementMapping: SceneReplacementMapping;
      evidenceContinuity: EvidenceContinuityAssessment;
      changedSceneIds: string[];
      preservedSceneIds: string[];
      removedSceneIds: string[];
    })
  | (ResultIdentity & {
      outcome: "clarification-required";
      reasonCode: string;
    })
  | (ResultIdentity & {
      outcome: "unsupported";
      reasonCode: string;
    })
  | (ResultIdentity & {
      outcome: "failed";
      error: { code: string; retryable: boolean };
      safeRollbackIdentity: {
        scriptFingerprint: string;
        contextPackageFingerprint: string;
        sceneId: string;
      };
    });

export interface ReplanAuditRecord {
  followUpId: string;
  sessionId: string;
  scope: ReplanScope;
  matchedRuleCodes: string[];
  decisionFingerprint: string;
  operationId: string;
  resultOutcome: ReplanResult["outcome"];
  previousScriptFingerprint: string;
  nextScriptFingerprint?: string;
  sceneMappingStrategy?: SceneReplacementMapping["strategy"];
  evidenceContinuityStatus?: EvidenceContinuityAssessment["continuityStatus"];
  errorCode?: string;
  policyVersion: string;
  occurredAt: string;
}

const Id = z.string().trim().min(1);
const ResultIdentitySchema = {
  resultId: Id,
  operationId: Id,
  startedFromSessionFingerprint: Id,
  policyVersion: Id,
  semanticFingerprint: Id,
};

export const ReplanResultSchema: z.ZodType<ReplanResult> =
  z.discriminatedUnion("outcome", [
    z.strictObject({
      ...ResultIdentitySchema,
      outcome: z.literal("current-context-answer"),
      answerPlan: FollowUpAnswerPlanSchema,
    }),
    z.strictObject({
      ...ResultIdentitySchema,
      outcome: z.literal("replacement-ready"),
      replacement: ReplacementSessionIdentitySchema,
      validatedReplacementScript: BriefingScriptSchema,
      sceneReplacementMapping: SceneReplacementMappingSchema,
      evidenceContinuity: EvidenceContinuityAssessmentSchema,
      changedSceneIds: z.array(Id),
      preservedSceneIds: z.array(Id),
      removedSceneIds: z.array(Id),
    }),
    z.strictObject({
      ...ResultIdentitySchema,
      outcome: z.literal("clarification-required"),
      reasonCode: Id,
    }),
    z.strictObject({
      ...ResultIdentitySchema,
      outcome: z.literal("unsupported"),
      reasonCode: Id,
    }),
    z.strictObject({
      ...ResultIdentitySchema,
      outcome: z.literal("failed"),
      error: z.strictObject({ code: Id, retryable: z.boolean() }),
      safeRollbackIdentity: z.strictObject({
        scriptFingerprint: Id,
        contextPackageFingerprint: Id,
        sceneId: Id,
      }),
    }),
  ]) as z.ZodType<ReplanResult>;

export const ReplanAuditRecordSchema: z.ZodType<ReplanAuditRecord> =
  z.strictObject({
    followUpId: Id,
    sessionId: Id,
    scope: ReplanScopeSchema,
    matchedRuleCodes: z.array(Id),
    decisionFingerprint: Id,
    operationId: Id,
    resultOutcome: z.enum([
      "current-context-answer",
      "replacement-ready",
      "clarification-required",
      "unsupported",
      "failed",
    ]),
    previousScriptFingerprint: Id,
    nextScriptFingerprint: Id.optional(),
    sceneMappingStrategy: z.enum([
      "preserve-current-scene",
      "map-to-replacement-scene",
      "map-to-nearest-preceding-scene",
      "move-to-first-new-scene",
      "restart-at-opening",
    ]).optional(),
    evidenceContinuityStatus: z.enum([
      "preserved", "partially-preserved", "replaced", "invalid",
    ]).optional(),
    errorCode: Id.optional(),
    policyVersion: Id,
    occurredAt: z.iso.datetime(),
  });

export function createReplanAuditRecord(
  request: ReplanRequest,
  result: ReplanResult,
): ReplanAuditRecord {
  return {
    followUpId: request.followUpRequest.followUpId,
    sessionId: request.sessionId,
    scope: request.replanDecision.scope,
    matchedRuleCodes: [...request.replanDecision.matchedRuleCodes],
    decisionFingerprint: request.replanDecision.semanticFingerprint,
    operationId: result.operationId,
    resultOutcome: result.outcome,
    previousScriptFingerprint: request.currentScriptFingerprint,
    ...(result.outcome === "replacement-ready"
      ? {
          nextScriptFingerprint: result.replacement.scriptFingerprint,
          sceneMappingStrategy: result.sceneReplacementMapping.strategy,
          evidenceContinuityStatus: result.evidenceContinuity.continuityStatus,
        }
      : result.outcome === "failed"
        ? { errorCode: result.error.code }
        : {}),
    policyVersion: result.policyVersion,
    occurredAt: request.deterministicContext.occurredAt,
  };
}
