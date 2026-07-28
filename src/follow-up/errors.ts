export type FollowUpErrorCode =
  | "INVALID_FOLLOW_UP_REQUEST"
  | "FOLLOW_UP_CONTEXT_MISMATCH"
  | "AMBIGUOUS_FOLLOW_UP"
  | "UNSUPPORTED_FOLLOW_UP"
  | "EVIDENCE_NOT_ALLOWED";

export class FollowUpError extends Error {
  constructor(readonly code: FollowUpErrorCode, message: string) {
    super(message);
    this.name = "FollowUpError";
  }
}
