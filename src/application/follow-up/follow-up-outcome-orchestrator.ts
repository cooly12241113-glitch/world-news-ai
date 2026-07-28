import {
  classifyFollowUp,
  type ReplanDecision,
} from "../../follow-up";
import type { ReplanAdapter } from "../../replan/replan-adapter";
import { replanResultFingerprint } from "../../replan/replan-fingerprint";
import type { ReplanRequest } from "../../replan/replan-request";
import { ReplanResultSchema, type ReplanResult } from "../../replan/replan-result";
import { briefingScriptFingerprint } from "../../script/fingerprint";
import {
  BriefingSessionSchema,
  reduceBriefingSession,
  type BriefingSession,
  type SessionCommand,
  type SessionTransitionResult,
} from "../../session";
import {
  evaluateAppendSceneBudget,
  type AppendSceneBudgetOutcome,
} from "./append-scene-budget-policy";
import {
  FollowUpExecutionRequestSchema,
  type FollowUpExecutionRequest,
} from "./follow-up-execution-request";
import {
  withOutcomeFingerprint,
  type FollowUpExecutionOutcome,
  type OutcomeWithoutFingerprint,
} from "./follow-up-execution-outcome";
import { projectRecommendedUiAction } from "./follow-up-outcome-projector";

export interface FollowUpOutcomeOrchestratorDependencies {
  replanAdapter: ReplanAdapter;
  classifier?: typeof classifyFollowUp;
  sessionReducer?: typeof reduceBriefingSession;
}

function transitioned(result: SessionTransitionResult): BriefingSession {
  if (!result.success) throw new Error(result.structuredError.code);
  return result.nextSession;
}

function commonOutcome(
  original: BriefingSession,
  nextSession: BriefingSession,
  request: FollowUpExecutionRequest,
  decision?: ReplanDecision,
  result?: ReplanResult,
) {
  return {
    executionId: request.executionId,
    operationId: request.operationId,
    sessionId: request.sessionId,
    startedFromSessionFingerprint:
      nextSession.activeOperation?.startedFromSessionFingerprint ??
      request.expectedSessionFingerprint,
    previousSessionFingerprint: original.semanticFingerprint,
    nextSessionFingerprint: nextSession.semanticFingerprint,
    ...(decision ? { decisionFingerprint: decision.semanticFingerprint } : {}),
    ...(result ? { resultFingerprint: result.semanticFingerprint } : {}),
    policyVersion: request.policyVersion,
    nextSession,
  };
}

function applyResolution(
  session: BriefingSession,
  request: FollowUpExecutionRequest,
  result: Extract<
    ReplanResult,
    {
      outcome:
        | "current-context-answer"
        | "clarification-required"
        | "unsupported";
    }
  >,
  reducer: typeof reduceBriefingSession,
): BriefingSession {
  const resolution =
    result.outcome === "current-context-answer"
      ? {
          type: "current-context-answer" as const,
          answerPlanFingerprint: result.answerPlan.semanticFingerprint,
        }
      : {
          type: result.outcome,
          reasonCode: result.reasonCode,
        };
  return transitioned(reducer(session, {
    type: "REPLAN_RESOLVED",
    commandId: `${request.executionId}:resolved`,
    expectedSessionFingerprint: session.semanticFingerprint,
    operationId: result.operationId,
    startedFromSessionFingerprint: result.startedFromSessionFingerprint,
    resultFingerprint: result.semanticFingerprint,
    resolution,
    occurredAt:
      request.deterministicContext.outcomeTransition.transitionTimestamp,
  }, request.deterministicContext.outcomeTransition));
}

function staleOutcome(
  original: BriefingSession,
  request: FollowUpExecutionRequest,
  decision: ReplanDecision,
  result: ReplanResult,
  reason: "operation-mismatch" | "session-fingerprint-mismatch",
  currentOperationId?: string,
): FollowUpExecutionOutcome {
  return withOutcomeFingerprint({
    ...commonOutcome(original, original, request, decision, result),
    outcome: "stale-ignored",
    staleReason: reason,
    ignoredOperationId: result.operationId,
    ...(currentOperationId ? { currentOperationId } : {}),
    recommendedUiAction: projectRecommendedUiAction("stale-ignored"),
  });
}

function budgetClarificationResult(
  request: FollowUpExecutionRequest,
  startedFromSessionFingerprint: string,
  budget: Extract<AppendSceneBudgetOutcome, { outcome: "clarification-required" }>,
): Extract<ReplanResult, { outcome: "clarification-required" }> {
  const resultWithoutFingerprint = {
    resultId: request.deterministicContext.resultId,
    operationId: request.operationId,
    startedFromSessionFingerprint,
    policyVersion: request.policyVersion,
    outcome: "clarification-required" as const,
    reasonCode: budget.reasonCode,
  };
  return {
    ...resultWithoutFingerprint,
    semanticFingerprint: replanResultFingerprint(resultWithoutFingerprint),
  };
}

export function executeFollowUp(
  currentSessionInput: BriefingSession,
  executionRequestInput: FollowUpExecutionRequest,
  dependencies: FollowUpOutcomeOrchestratorDependencies,
): FollowUpExecutionOutcome {
  const original = BriefingSessionSchema.parse(currentSessionInput);
  const request = FollowUpExecutionRequestSchema.parse(executionRequestInput);
  if (
    original.sessionId !== request.sessionId ||
    original.semanticFingerprint !== request.expectedSessionFingerprint ||
    original.scriptFingerprint !== request.followUpContext.scriptFingerprint ||
    original.sceneCursor.sceneId !== request.followUpContext.currentSceneId
  ) {
    throw new Error("Execution request does not target the current session.");
  }
  const reducer = dependencies.sessionReducer ?? reduceBriefingSession;
  const classifier = dependencies.classifier ?? classifyFollowUp;
  let progressed = original;
  let decision: ReplanDecision | undefined;

  try {
    progressed = transitioned(reducer(progressed, {
      type: "SUBMIT_FOLLOW_UP",
      commandId: `${request.executionId}:submit`,
      expectedSessionFingerprint: progressed.semanticFingerprint,
      followUpId: request.followUpRequest.followUpId,
      operationId: request.operationId,
    }, request.deterministicContext.submitTransition));
    progressed = transitioned(reducer(progressed, {
      type: "REPLAN_STARTED",
      commandId: `${request.executionId}:start`,
      expectedSessionFingerprint: progressed.semanticFingerprint,
      operationId: request.operationId,
    }, request.deterministicContext.startTransition));

    decision = classifier(
      request.followUpRequest,
      request.followUpContext,
      request.classifierPolicy,
    );
    const startedFrom = progressed.activeOperation?.startedFromSessionFingerprint;
    if (!startedFrom) throw new Error("Active replan identity is unavailable.");

    let result: ReplanResult;
    if (decision.scope === "append-scenes" && request.appendBudget) {
      const budget = evaluateAppendSceneBudget({
        currentSceneCount: request.followUpContext.availableSceneIds.length,
        requestedAdditionalSceneCount:
          request.appendBudget.requestedAdditionalSceneCount,
        maximumScenes: request.appendBudget.maximumScenes,
        completedSceneIds: request.followUpContext.completedSceneIds,
        remainingSceneIds: request.followUpContext.remainingSceneIds,
        decisionScope: "append-scenes",
        policyVersion: request.policyVersion,
      });
      result =
        budget.outcome === "clarification-required"
          ? budgetClarificationResult(request, startedFrom, budget)
          : dependencies.replanAdapter.prepare(
              createReplanRequest(request, decision, startedFrom),
            );
    } else {
      result = dependencies.replanAdapter.prepare(
        createReplanRequest(request, decision, startedFrom),
      );
    }

    const parsedResult = ReplanResultSchema.safeParse(result);
    if (
      !parsedResult.success ||
      replanResultFingerprint(result) !== result.semanticFingerprint
    ) {
      throw new Error("Replan result failed runtime validation.");
    }
    result = parsedResult.data;
    const active = progressed.activeOperation;
    if (result.operationId !== active?.operationId) {
      return staleOutcome(
        original, request, decision, result, "operation-mismatch",
        active?.operationId,
      );
    }
    if (
      result.startedFromSessionFingerprint !==
      active.startedFromSessionFingerprint
    ) {
      return staleOutcome(
        original, request, decision, result,
        "session-fingerprint-mismatch", active.operationId,
      );
    }

    if (result.outcome === "current-context-answer") {
      const next = applyResolution(progressed, request, result, reducer);
      return withOutcomeFingerprint({
        ...commonOutcome(original, next, request, decision, result),
        outcome: "current-context-answer",
        answerPlan: result.answerPlan,
        scriptFingerprint: next.scriptFingerprint,
        sceneCursor: next.sceneCursor,
        evidenceContinuityStatus: "preserved",
        recommendedUiAction: projectRecommendedUiAction(result.outcome),
      });
    }
    if (result.outcome === "clarification-required") {
      const next = applyResolution(progressed, request, result, reducer);
      return withOutcomeFingerprint({
        ...commonOutcome(original, next, request, decision, result),
        outcome: "clarification-required",
        reasonCode: result.reasonCode,
        clarificationOptions: [
          "replace-remaining-scenes",
          "rebuild-entire-briefing",
          "keep-current-briefing",
        ],
        scriptFingerprint: next.scriptFingerprint,
        sceneCursor: next.sceneCursor,
        recommendedUiAction: projectRecommendedUiAction(result.outcome),
      });
    }
    if (result.outcome === "unsupported") {
      const next = applyResolution(progressed, request, result, reducer);
      return withOutcomeFingerprint({
        ...commonOutcome(original, next, request, decision, result),
        outcome: "unsupported",
        reasonCode: result.reasonCode,
        userFacingCategory: "unsupported-action",
        scriptFingerprint: next.scriptFingerprint,
        sceneCursor: next.sceneCursor,
        recommendedUiAction: projectRecommendedUiAction(result.outcome),
      });
    }
    if (result.outcome === "replacement-ready") {
      if (
        result.replacement.scriptFingerprint !==
          result.validatedReplacementScript.fingerprint ||
        briefingScriptFingerprint(result.validatedReplacementScript) !==
          result.validatedReplacementScript.fingerprint ||
        result.replacement.sceneIds.join("\u0000") !==
          result.validatedReplacementScript.scenes
            .map((scene) => scene.id)
            .join("\u0000")
      ) {
        throw new Error("Replacement result identities are inconsistent.");
      }
      const next = transitioned(reducer(progressed, {
        type: "REPLAN_COMPLETED",
        commandId: `${request.executionId}:completed`,
        expectedSessionFingerprint: progressed.semanticFingerprint,
        operationId: result.operationId,
        replacement: result.replacement,
        mapping: result.sceneReplacementMapping,
      }, request.deterministicContext.outcomeTransition));
      return withOutcomeFingerprint({
        ...commonOutcome(original, next, request, decision, result),
        outcome: "replacement-applied",
        previousScriptFingerprint: original.scriptFingerprint,
        replacementScriptFingerprint: next.scriptFingerprint,
        mappingStrategy: result.sceneReplacementMapping.strategy,
        changedSceneIds: result.changedSceneIds,
        preservedSceneIds: result.preservedSceneIds,
        removedSceneIds: result.removedSceneIds,
        evidenceContinuityStatus: result.evidenceContinuity.continuityStatus as
          "preserved" | "partially-preserved" | "replaced",
        nextSceneCursor: next.sceneCursor,
        recommendedUiAction: projectRecommendedUiAction("replacement-applied"),
      });
    }
    return technicalFailure(
      original, progressed, request, decision, result.error.code,
      result.error.retryable, reducer, result,
    );
  } catch {
    return technicalFailure(
      original,
      progressed,
      request,
      decision,
      "FOLLOW_UP_EXECUTION_FAILED",
      true,
      reducer,
    );
  }
}

function createReplanRequest(
  request: FollowUpExecutionRequest,
  decision: ReplanDecision,
  startedFromSessionFingerprint: string,
): ReplanRequest {
  return {
    operationId: request.operationId,
    sessionId: request.sessionId,
    startedFromSessionFingerprint,
    followUpRequest: request.followUpRequest,
    followUpContext: request.followUpContext,
    replanDecision: decision,
    currentScriptId: request.followUpContext.scriptId,
    currentScriptFingerprint: request.followUpContext.scriptFingerprint,
    currentPlanId: request.followUpContext.planId,
    currentPlanFingerprint: request.followUpContext.planFingerprint,
    currentContextPackageId: request.followUpContext.contextPackageId,
    currentContextPackageFingerprint:
      request.followUpContext.contextPackageFingerprint,
    currentSceneId: request.followUpContext.currentSceneId,
    completedSceneIds: request.followUpContext.completedSceneIds,
    fixtureScenarioId: request.fixtureScenarioId,
    deterministicContext: {
      resultId: request.deterministicContext.resultId,
      answerPlanId: request.deterministicContext.answerPlanId,
      occurredAt:
        request.deterministicContext.outcomeTransition.transitionTimestamp,
      policyVersion: request.policyVersion,
    },
  };
}

function technicalFailure(
  original: BriefingSession,
  progressed: BriefingSession,
  request: FollowUpExecutionRequest,
  decision: ReplanDecision | undefined,
  errorCode: string,
  retryable: boolean,
  reducer: typeof reduceBriefingSession,
  result?: ReplanResult,
): FollowUpExecutionOutcome {
  let rollback = original;
  if (
    progressed.status === "replanning" &&
    progressed.activeOperation?.operationId === request.operationId
  ) {
    const transition = reducer(progressed, {
      type: "REPLAN_FAILED",
      commandId: `${request.executionId}:failed`,
      expectedSessionFingerprint: progressed.semanticFingerprint,
      operationId: request.operationId,
      failure: {
        code: errorCode.slice(0, 200) || "FOLLOW_UP_EXECUTION_FAILED",
        message: "Follow-up execution failed safely.",
        retryable,
      },
    }, request.deterministicContext.outcomeTransition);
    if (transition.success) rollback = transition.nextSession;
  }
  return withOutcomeFingerprint({
    ...commonOutcome(original, rollback, request, decision, result),
    outcome: "failed",
    errorCode: errorCode.slice(0, 200) || "FOLLOW_UP_EXECUTION_FAILED",
    retryable,
    rollbackFingerprint: rollback.semanticFingerprint,
    scriptFingerprint: rollback.scriptFingerprint,
    recommendedUiAction: projectRecommendedUiAction("failed", retryable),
  } as OutcomeWithoutFingerprint);
}
