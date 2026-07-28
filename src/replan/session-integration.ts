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
  } else {
    const failure =
      result.outcome === "failed"
        ? result.error
        : {
            code:
              result.outcome === "current-context-answer"
                ? "CURRENT_CONTEXT_ANSWER_READY"
                : result.reasonCode,
            retryable: false,
          };
    command = {
      ...common,
      type: "REPLAN_FAILED",
      failure: {
        code: failure.code,
        message: "Replan completed without a Script replacement.",
        retryable: failure.retryable,
      },
    };
  }
  return reduceBriefingSession(session, command, context.sessionContext);
}
