import { createSemanticFingerprint } from "../briefing";
import type { ReplanResult } from "./replan-result";

export type ReplanResultFingerprintInput =
  ReplanResult extends infer Result
    ? Result extends ReplanResult
      ? Omit<Result, "semanticFingerprint">
      : never
    : never;

export function replanResultFingerprint(
  result: ReplanResultFingerprintInput | ReplanResult,
): string {
  if (result.outcome === "replacement-ready") {
    return createSemanticFingerprint({
      outcome: result.outcome,
      operationId: result.operationId,
      startedFromSessionFingerprint: result.startedFromSessionFingerprint,
      replacement: result.replacement,
      mapping: result.sceneReplacementMapping,
      evidenceContinuity: result.evidenceContinuity,
      changedSceneIds: [...result.changedSceneIds].sort(),
      preservedSceneIds: [...result.preservedSceneIds].sort(),
      removedSceneIds: [...result.removedSceneIds].sort(),
      policyVersion: result.policyVersion,
    });
  }
  return createSemanticFingerprint({
    outcome: result.outcome,
    operationId: result.operationId,
    startedFromSessionFingerprint: result.startedFromSessionFingerprint,
    ...(result.outcome === "current-context-answer"
      ? { answerPlanFingerprint: result.answerPlan.semanticFingerprint }
      : result.outcome === "failed"
        ? { error: result.error, safeRollbackIdentity: result.safeRollbackIdentity }
        : { reasonCode: result.reasonCode }),
    policyVersion: result.policyVersion,
  });
}
