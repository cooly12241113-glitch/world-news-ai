import {
  reduceBriefingSession,
  type BriefingSession,
  type DeterministicSessionContext,
  type SessionCommand,
  type SessionTransitionResult,
} from "../session";
import type { ReplanResult } from "./replan-result";

export interface ReplanApplicationContext {
  commandId: string;
  sessionContext: DeterministicSessionContext;
}

export function applyReplanResultToSession(
  session: BriefingSession,
  result: ReplanResult,
  context: ReplanApplicationContext,
): SessionTransitionResult {
  const common = {
    commandId: context.commandId,
    expectedSessionFingerprint:
      session.activeOperation?.startedFromSessionFingerprint ===
      result.startedFromSessionFingerprint
        ? session.semanticFingerprint
        : result.startedFromSessionFingerprint,
    operationId: result.operationId,
  };
  let command: SessionCommand;
  if (result.outcome === "replacement-ready") {
    command = {
      ...common,
      type: "REPLAN_COMPLETED",
      replacement: result.replacement,
      mapping: result.sceneReplacementMapping,
    };
  } else if (result.outcome === "failed") {
    command = {
      ...common,
      type: "REPLAN_FAILED",
      failure: {
        code: result.error.code,
        message: "Replan failed safely.",
        retryable: result.error.retryable,
      },
    };
  } else {
    command = {
      ...common,
      type: "REPLAN_RESOLVED",
      startedFromSessionFingerprint: result.startedFromSessionFingerprint,
      resultFingerprint: result.semanticFingerprint,
      resolution:
        result.outcome === "current-context-answer"
          ? {
              type: "current-context-answer",
              answerPlanFingerprint: result.answerPlan.semanticFingerprint,
            }
          : {
              type: result.outcome,
              reasonCode: result.reasonCode,
            },
      occurredAt: context.sessionContext.transitionTimestamp,
    };
  }
  return reduceBriefingSession(session, command, context.sessionContext);
}
