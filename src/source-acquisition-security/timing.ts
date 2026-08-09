import type {
  CancellationAwareSleeper,
  MonotonicClock,
} from "./lifecycle-models";
import type { SourceConnectorCancellation } from "../source-connector";

export const systemMonotonicClock: MonotonicClock = {
  nowMs: () => performance.now(),
};

export const defaultCancellationAwareSleeper: CancellationAwareSleeper = {
  sleep: (delayMs, cancellation) => new Promise((resolve) => {
    let settled = false;
    const finish = (result: "completed" | "cancelled") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(cancellationPoll);
      resolve(result);
    };
    const timeout = setTimeout(() => finish("completed"), delayMs);
    const cancellationPoll = setInterval(() => {
      if (cancellation?.isCancellationRequested() === true) finish("cancelled");
    }, Math.min(25, Math.max(1, delayMs)));
    if (cancellation?.isCancellationRequested() === true) finish("cancelled");
  }),
};

export type AsyncBoundaryResult<T> =
  | { status: "completed"; value: T }
  | { status: "failed"; error: unknown }
  | { status: "cancelled" }
  | { status: "deadline-exceeded" };

interface AsyncBoundaryOptions {
  absoluteDeadlineAtMs: number;
  clock: MonotonicClock;
  cancellation?: SourceConnectorCancellation;
  cancellationPollMs?: number;
}

/**
 * Detaches lifecycle progress from a non-abortable operation. The operation is
 * observed to completion to consume late rejection, but only the first valid
 * boundary result can settle the caller.
 */
export const raceAsyncOperation = <T>(
  operation: Promise<T>,
  options: AsyncBoundaryOptions,
): Promise<AsyncBoundaryResult<T>> => new Promise((resolve) => {
  let settled = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let cancellationPoll: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    if (cancellationPoll !== undefined) clearInterval(cancellationPoll);
  };
  const finish = (result: AsyncBoundaryResult<T>) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve(result);
  };
  const deadlineRemainingMs = Math.max(
    0,
    options.absoluteDeadlineAtMs - options.clock.nowMs(),
  );
  deadlineTimer = setTimeout(
    () => finish({ status: "deadline-exceeded" }),
    deadlineRemainingMs,
  );
  if (options.cancellation !== undefined) {
    cancellationPoll = setInterval(() => {
      if (options.cancellation?.isCancellationRequested() === true) {
        finish({ status: "cancelled" });
      }
    }, options.cancellationPollMs ?? 10);
  }
  void operation.then(
    (value) => {
      if (options.cancellation?.isCancellationRequested() === true) {
        finish({ status: "cancelled" });
      } else if (options.clock.nowMs() >= options.absoluteDeadlineAtMs) {
        finish({ status: "deadline-exceeded" });
      } else {
        finish({ status: "completed", value });
      }
    },
    (error: unknown) => {
      if (options.cancellation?.isCancellationRequested() === true) {
        finish({ status: "cancelled" });
      } else if (options.clock.nowMs() >= options.absoluteDeadlineAtMs) {
        finish({ status: "deadline-exceeded" });
      } else {
        finish({ status: "failed", error });
      }
    },
  );
  if (options.cancellation?.isCancellationRequested() === true) {
    finish({ status: "cancelled" });
  } else if (deadlineRemainingMs === 0) {
    finish({ status: "deadline-exceeded" });
  }
});
