import { z } from "zod";
import type {
  FollowUpContext,
  FollowUpRequest,
  ReplanDecision,
} from "../follow-up";
import {
  FollowUpContextSchema,
  FollowUpRequestSchema,
  ReplanDecisionSchema,
} from "../follow-up";

export interface ReplanRequest {
  operationId: string;
  sessionId: string;
  startedFromSessionFingerprint: string;
  followUpRequest: FollowUpRequest;
  followUpContext: FollowUpContext;
  replanDecision: ReplanDecision;
  currentScriptId: string;
  currentScriptFingerprint: string;
  currentPlanId: string;
  currentPlanFingerprint: string;
  currentContextPackageId: string;
  currentContextPackageFingerprint: string;
  currentSceneId: string;
  completedSceneIds: string[];
  fixtureScenarioId: string;
  deterministicContext: {
    resultId: string;
    answerPlanId: string;
    occurredAt: string;
    policyVersion: string;
  };
}

const Id = z.string().trim().min(1);
export const ReplanRequestSchema: z.ZodType<ReplanRequest> = z
  .strictObject({
    operationId: Id,
    sessionId: Id,
    startedFromSessionFingerprint: Id,
    followUpRequest: FollowUpRequestSchema,
    followUpContext: FollowUpContextSchema,
    replanDecision: ReplanDecisionSchema,
    currentScriptId: Id,
    currentScriptFingerprint: Id,
    currentPlanId: Id,
    currentPlanFingerprint: Id,
    currentContextPackageId: Id,
    currentContextPackageFingerprint: Id,
    currentSceneId: Id,
    completedSceneIds: z.array(Id),
    fixtureScenarioId: Id,
    deterministicContext: z.strictObject({
      resultId: Id,
      answerPlanId: Id,
      occurredAt: z.iso.datetime(),
      policyVersion: Id,
    }),
  })
  .superRefine((request, context) => {
    if (
      request.sessionId !== request.followUpRequest.sessionId ||
      request.sessionId !== request.followUpContext.sessionId ||
      request.currentScriptFingerprint !==
        request.followUpContext.scriptFingerprint ||
      request.currentContextPackageFingerprint !==
        request.followUpContext.contextPackageFingerprint ||
      request.currentSceneId !== request.followUpContext.currentSceneId ||
      request.followUpRequest.followUpId !== request.replanDecision.followUpId
    ) {
      context.addIssue({ code: "custom", message: "Replan identity lineage is inconsistent." });
    }
  });
