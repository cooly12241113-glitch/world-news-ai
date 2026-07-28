import type { FollowUpExecutionRequest } from "..";
import {
  activeSession,
  followUpContext,
  followUpRequest,
  scenarios,
  timestamp,
} from "../../../follow-up/__tests__/fixtures";
import { FixtureReplanAdapter } from "../../../replan";
import type { BriefingSession } from "../../../session";

export { activeSession, scenarios };

export const adapter = () => new FixtureReplanAdapter(scenarios());

export function executionRequest(
  session: BriefingSession,
  text: string,
  fixtureScenarioId: string,
  appendBudget?: {
    requestedAdditionalSceneCount: number;
    maximumScenes: number;
  },
): FollowUpExecutionRequest {
  const request = followUpRequest(text);
  request.expectedSessionFingerprint = session.semanticFingerprint;
  const context = followUpContext();
  return {
    executionId: "execution-1",
    operationId: "operation-replan",
    sessionId: session.sessionId,
    followUpRequest: request,
    followUpContext: context,
    classifierPolicy: {
      decisionId: "decision-application",
      policyVersion: "classifier-v1",
    },
    fixtureScenarioId,
    ...(appendBudget ? { appendBudget } : {}),
    deterministicContext: {
      submitTransition: {
        transitionTimestamp: timestamp,
        eventId: "event-submit",
        auditRecordId: "audit-submit",
        policyVersion: "session-policy-v1",
      },
      startTransition: {
        transitionTimestamp: timestamp,
        eventId: "event-start",
        auditRecordId: "audit-start",
        policyVersion: "session-policy-v1",
      },
      outcomeTransition: {
        transitionTimestamp: timestamp,
        eventId: "event-outcome",
        auditRecordId: "audit-outcome",
        policyVersion: "session-policy-v1",
      },
      resultId: "result-application",
      answerPlanId: "answer-application",
    },
    expectedSessionFingerprint: session.semanticFingerprint,
    policyVersion: "application-policy-v1",
  };
}
