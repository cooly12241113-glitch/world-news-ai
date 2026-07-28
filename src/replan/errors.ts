export type ReplanErrorCode =
  | "INVALID_REPLAN_REQUEST"
  | "UNKNOWN_FIXTURE_SCENARIO"
  | "FIXTURE_SCOPE_MISMATCH"
  | "INVALID_REPLACEMENT_SCRIPT"
  | "UNKNOWN_EVIDENCE_ID"
  | "INVALID_EVIDENCE_CONTINUITY"
  | "INVALID_SCENE_MAPPING"
  | "STALE_REPLAN_RESULT";

export class ReplanError extends Error {
  constructor(readonly code: ReplanErrorCode, message: string) {
    super(message);
    this.name = "ReplanError";
  }
}
