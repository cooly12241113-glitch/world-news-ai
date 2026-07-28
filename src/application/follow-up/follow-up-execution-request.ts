import { z } from "zod";
import {
  FollowUpContextSchema,
  FollowUpRequestSchema,
  type FollowUpContext,
  type FollowUpRequest,
  type FollowUpClassifierPolicy,
} from "../../follow-up";
import type { DeterministicSessionContext } from "../../session";

export interface FollowUpExecutionRequest {
  executionId: string;
  operationId: string;
  sessionId: string;
  followUpRequest: FollowUpRequest;
  followUpContext: FollowUpContext;
  classifierPolicy: FollowUpClassifierPolicy;
  fixtureScenarioId: string;
  appendBudget?: {
    requestedAdditionalSceneCount: number;
    maximumScenes: number;
  };
  deterministicContext: {
    submitTransition: DeterministicSessionContext;
    startTransition: DeterministicSessionContext;
    outcomeTransition: DeterministicSessionContext;
    resultId: string;
    answerPlanId: string;
  };
  expectedSessionFingerprint: string;
  policyVersion: string;
}

const Id = z.string().trim().min(1);
const SessionContext = z.strictObject({
  transitionTimestamp: z.iso.datetime(),
  eventId: Id,
  auditRecordId: Id,
  policyVersion: Id,
});

export const FollowUpExecutionRequestSchema:
  z.ZodType<FollowUpExecutionRequest> = z
  .strictObject({
    executionId: Id,
    operationId: Id,
    sessionId: Id,
    followUpRequest: FollowUpRequestSchema,
    followUpContext: FollowUpContextSchema,
    classifierPolicy: z.strictObject({
      decisionId: Id,
      policyVersion: Id,
    }),
    fixtureScenarioId: Id,
    appendBudget: z.strictObject({
      requestedAdditionalSceneCount: z.number().int().positive(),
      maximumScenes: z.number().int().positive(),
    }).optional(),
    deterministicContext: z.strictObject({
      submitTransition: SessionContext,
      startTransition: SessionContext,
      outcomeTransition: SessionContext,
      resultId: Id,
      answerPlanId: Id,
    }),
    expectedSessionFingerprint: Id,
    policyVersion: Id,
  })
  .superRefine((request, context) => {
    if (
      request.sessionId !== request.followUpRequest.sessionId ||
      request.sessionId !== request.followUpContext.sessionId ||
      request.expectedSessionFingerprint !==
        request.followUpRequest.expectedSessionFingerprint
    ) {
      context.addIssue({ code: "custom", message: "Execution identity is inconsistent." });
    }
  });
