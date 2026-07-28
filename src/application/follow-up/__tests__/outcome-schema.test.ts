import { describe, expect, it } from "vitest";
import {
  FollowUpExecutionOutcomeSchema,
  executeFollowUp,
  withOutcomeFingerprint,
} from "..";
import { adapter, activeSession, executionRequest } from "./fixtures";

const cases = [
  ["source", "current-context", "current-context-answer"],
  ["revise this scene", "revise", "replacement-applied"],
  ["what did they do", "clarification", "clarification-required"],
  ["delete a file", "unsupported", "unsupported"],
  ["add a scene", "failure", "failed"],
] as const;

describe("FollowUpExecutionOutcome schema", () => {
  it.each(cases)("accepts %s outcome", (text, scenario, expected) => {
    const current = activeSession();
    const outcome = executeFollowUp(
      current,
      executionRequest(current, text, scenario),
      { replanAdapter: adapter() },
    );
    expect(outcome.outcome).toBe(expected);
    expect(FollowUpExecutionOutcomeSchema.safeParse(outcome).success).toBe(true);
  });

  it("rejects unknown fields", () => {
    const current = activeSession();
    const outcome = executeFollowUp(
      current,
      executionRequest(current, "source", "current-context"),
      { replanAdapter: adapter() },
    );
    expect(FollowUpExecutionOutcomeSchema.safeParse({
      ...outcome,
      rawFollowUpText: "forbidden",
    }).success).toBe(false);
  });

  it("accepts stale-ignored", () => {
    const current = activeSession();
    const outcome = withOutcomeFingerprint({
      executionId: "execution-stale",
      operationId: "old-operation",
      sessionId: current.sessionId,
      startedFromSessionFingerprint: current.semanticFingerprint,
      previousSessionFingerprint: current.semanticFingerprint,
      nextSessionFingerprint: current.semanticFingerprint,
      policyVersion: "application-policy-v1",
      nextSession: current,
      outcome: "stale-ignored",
      staleReason: "operation-mismatch",
      ignoredOperationId: "old-operation",
      currentOperationId: "new-operation",
      recommendedUiAction: "ignore-stale-result",
    });
    expect(FollowUpExecutionOutcomeSchema.safeParse(outcome).success).toBe(true);
  });

  it("rejects an outcome with fields from another variant", () => {
    const current = activeSession();
    const outcome = executeFollowUp(
      current,
      executionRequest(current, "source", "current-context"),
      { replanAdapter: adapter() },
    );
    expect(FollowUpExecutionOutcomeSchema.safeParse({
      ...outcome,
      errorCode: "NOT_ALLOWED",
    }).success).toBe(false);
  });
});
