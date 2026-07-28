import type { SessionCommandType } from "./session-command";

export type SessionTransitionErrorCode =
  | "INVALID_SESSION"
  | "INVALID_COMMAND"
  | "STALE_SESSION_FINGERPRINT"
  | "INVALID_TRANSITION"
  | "SCENE_OUT_OF_BOUNDS"
  | "SCENE_ID_MISMATCH"
  | "STALE_OPERATION"
  | "DUPLICATE_REPLAN_START"
  | "SCRIPT_FINGERPRINT_MISMATCH"
  | "INVALID_REPLACEMENT"
  | "INVALID_SCENE_MAPPING";

export interface SessionTransitionError {
  code: SessionTransitionErrorCode;
  message: string;
  commandType?: SessionCommandType;
  retryable: boolean;
}

export class SessionRepositoryConflictError extends Error {
  constructor() {
    super("Briefing session fingerprint conflict");
    this.name = "SessionRepositoryConflictError";
  }
}

export class SessionRepositoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionRepositoryValidationError";
  }
}
