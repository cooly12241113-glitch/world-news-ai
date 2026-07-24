import type { PersistenceErrorCode } from "./models";

export class PersistenceError extends Error {
  constructor(
    readonly code: PersistenceErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

export class DuplicateFingerprintError extends PersistenceError {
  constructor(readonly fingerprint: string) {
    super(
      "REPOSITORY_WRITE_FAILED",
      "A document with this fingerprint already exists",
    );
    this.name = "DuplicateFingerprintError";
  }
}
