import { z } from "zod";
import { createSemanticFingerprint } from "../../briefing/fingerprint";
import { FollowUpAnswerPlanSchema, type FollowUpAnswerPlan } from "../../follow-up";
import {
  BriefingSessionSchema,
  SceneCursorSchema,
  type BriefingSession,
  type SceneCursor,
  type SceneReplacementMapping,
} from "../../session";
import { RECOMMENDED_UI_ACTIONS, type RecommendedUiAction } from "./follow-up-outcome-projector";

interface OutcomeIdentity {
  executionId: string;
  operationId: string;
  sessionId: string;
  startedFromSessionFingerprint: string;
  previousSessionFingerprint: string;
  nextSessionFingerprint?: string;
  decisionFingerprint?: string;
  resultFingerprint?: string;
  policyVersion: string;
  nextSession: BriefingSession;
  recommendedUiAction: RecommendedUiAction;
  semanticFingerprint: string;
}

export type FollowUpExecutionOutcome =
  | (OutcomeIdentity & {
      outcome: "current-context-answer";
      answerPlan: FollowUpAnswerPlan;
      scriptFingerprint: string;
      sceneCursor: SceneCursor;
      evidenceContinuityStatus: "preserved";
    })
  | (OutcomeIdentity & {
      outcome: "replacement-applied";
      previousScriptFingerprint: string;
      replacementScriptFingerprint: string;
      mappingStrategy: SceneReplacementMapping["strategy"];
      changedSceneIds: string[];
      preservedSceneIds: string[];
      removedSceneIds: string[];
      evidenceContinuityStatus:
        | "preserved"
        | "partially-preserved"
        | "replaced";
      nextSceneCursor: SceneCursor;
    })
  | (OutcomeIdentity & {
      outcome: "clarification-required";
      reasonCode: string;
      clarificationOptions: string[];
      scriptFingerprint: string;
      sceneCursor: SceneCursor;
    })
  | (OutcomeIdentity & {
      outcome: "unsupported";
      reasonCode: string;
      userFacingCategory: "unsupported-action" | "evidence-policy";
      scriptFingerprint: string;
      sceneCursor: SceneCursor;
    })
  | (OutcomeIdentity & {
      outcome: "failed";
      errorCode: string;
      retryable: boolean;
      rollbackFingerprint: string;
      scriptFingerprint: string;
    })
  | (OutcomeIdentity & {
      outcome: "stale-ignored";
      staleReason: "operation-mismatch" | "session-fingerprint-mismatch";
      ignoredOperationId: string;
      currentOperationId?: string;
    });

const Id = z.string().trim().min(1);
const Common = {
  executionId: Id,
  operationId: Id,
  sessionId: Id,
  startedFromSessionFingerprint: Id,
  previousSessionFingerprint: Id,
  nextSessionFingerprint: Id.optional(),
  decisionFingerprint: Id.optional(),
  resultFingerprint: Id.optional(),
  policyVersion: Id,
  nextSession: BriefingSessionSchema,
  recommendedUiAction: z.enum(RECOMMENDED_UI_ACTIONS),
  semanticFingerprint: Id,
};

export const FollowUpExecutionOutcomeSchema:
  z.ZodType<FollowUpExecutionOutcome> = z.discriminatedUnion("outcome", [
    z.strictObject({
      ...Common,
      outcome: z.literal("current-context-answer"),
      answerPlan: FollowUpAnswerPlanSchema,
      scriptFingerprint: Id,
      sceneCursor: SceneCursorSchema,
      evidenceContinuityStatus: z.literal("preserved"),
    }),
    z.strictObject({
      ...Common,
      outcome: z.literal("replacement-applied"),
      previousScriptFingerprint: Id,
      replacementScriptFingerprint: Id,
      mappingStrategy: z.enum([
        "preserve-current-scene", "map-to-replacement-scene",
        "map-to-nearest-preceding-scene", "move-to-first-new-scene",
        "restart-at-opening",
      ]),
      changedSceneIds: z.array(Id),
      preservedSceneIds: z.array(Id),
      removedSceneIds: z.array(Id),
      evidenceContinuityStatus: z.enum([
        "preserved", "partially-preserved", "replaced",
      ]),
      nextSceneCursor: SceneCursorSchema,
    }),
    z.strictObject({
      ...Common,
      outcome: z.literal("clarification-required"),
      reasonCode: Id,
      clarificationOptions: z.array(Id).min(1),
      scriptFingerprint: Id,
      sceneCursor: SceneCursorSchema,
    }),
    z.strictObject({
      ...Common,
      outcome: z.literal("unsupported"),
      reasonCode: Id,
      userFacingCategory: z.enum(["unsupported-action", "evidence-policy"]),
      scriptFingerprint: Id,
      sceneCursor: SceneCursorSchema,
    }),
    z.strictObject({
      ...Common,
      outcome: z.literal("failed"),
      errorCode: Id,
      retryable: z.boolean(),
      rollbackFingerprint: Id,
      scriptFingerprint: Id,
    }),
    z.strictObject({
      ...Common,
      outcome: z.literal("stale-ignored"),
      staleReason: z.enum([
        "operation-mismatch", "session-fingerprint-mismatch",
      ]),
      ignoredOperationId: Id,
      currentOperationId: Id.optional(),
    }),
  ]) as z.ZodType<FollowUpExecutionOutcome>;

export type OutcomeWithoutFingerprint =
  FollowUpExecutionOutcome extends infer Outcome
    ? Outcome extends FollowUpExecutionOutcome
      ? Omit<Outcome, "semanticFingerprint">
      : never
    : never;

export function withOutcomeFingerprint<T extends OutcomeWithoutFingerprint>(
  outcome: T,
): T & { semanticFingerprint: string } {
  const semanticFingerprint = createSemanticFingerprint({
    outcome: outcome.outcome,
    operationId: outcome.operationId,
    previousSessionFingerprint: outcome.previousSessionFingerprint,
    nextSessionFingerprint: outcome.nextSessionFingerprint,
    decisionFingerprint: outcome.decisionFingerprint,
    resultFingerprint: outcome.resultFingerprint,
    ...("mappingStrategy" in outcome
      ? {
          mappingStrategy: outcome.mappingStrategy,
          evidenceContinuityStatus: outcome.evidenceContinuityStatus,
        }
      : {}),
    ...("reasonCode" in outcome ? { reasonCode: outcome.reasonCode } : {}),
    ...("errorCode" in outcome ? { errorCode: outcome.errorCode } : {}),
    ...("staleReason" in outcome ? { staleReason: outcome.staleReason } : {}),
    recommendedUiAction: outcome.recommendedUiAction,
    policyVersion: outcome.policyVersion,
  });
  return { ...outcome, semanticFingerprint };
}
