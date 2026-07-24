import { PersistenceError } from "./errors";
import type { IngestionJobStatus } from "./models";

const ALLOWED_TRANSITIONS: Readonly<
  Record<IngestionJobStatus, readonly IngestionJobStatus[]>
> = {
  pending: ["running"],
  running: ["succeeded", "duplicate", "failed"],
  succeeded: [],
  duplicate: [],
  failed: [],
};

export const assertJobTransition = (
  current: IngestionJobStatus,
  next: IngestionJobStatus,
): void => {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new PersistenceError(
      "INVALID_JOB_TRANSITION",
      `Job cannot transition from ${current} to ${next}`,
    );
  }
};
