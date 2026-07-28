export type FollowUpExecutionErrorCode =
  | "INVALID_EXECUTION_REQUEST"
  | "SESSION_IDENTITY_MISMATCH"
  | "SUBMIT_TRANSITION_FAILED"
  | "REPLAN_START_FAILED"
  | "CLASSIFICATION_FAILED"
  | "APPEND_BUDGET_EXCEEDED"
  | "ADAPTER_FAILED"
  | "RESULT_VALIDATION_FAILED"
  | "SESSION_OUTCOME_TRANSITION_FAILED";

export class FollowUpExecutionError extends Error {
  constructor(readonly code: FollowUpExecutionErrorCode, message: string) {
    super(message);
    this.name = "FollowUpExecutionError";
  }
}
