import { describe, expect, it, vi } from "vitest";
import { raceAsyncOperation } from "../index";

const systemClock = { nowMs: () => performance.now() };

describe("async lifecycle boundary", () => {
  it("detaches from a never-settling operation at the absolute deadline", async () => {
    const result = await raceAsyncOperation(new Promise<never>(() => undefined), {
      absoluteDeadlineAtMs: systemClock.nowMs() + 15,
      clock: systemClock,
    });
    expect(result).toEqual({ status: "deadline-exceeded" });
  });

  it("lets cancellation dominate a later successful completion", async () => {
    let resolveOperation: ((value: string) => void) | undefined;
    let cancelled = false;
    const operation = new Promise<string>((resolve) => { resolveOperation = resolve; });
    const boundary = raceAsyncOperation(operation, {
      absoluteDeadlineAtMs: systemClock.nowMs() + 1_000,
      clock: systemClock,
      cancellation: { isCancellationRequested: () => cancelled },
      cancellationPollMs: 1,
    });
    cancelled = true;
    expect(await boundary).toEqual({ status: "cancelled" });
    resolveOperation?.("late-success");
    await Promise.resolve();
  });

  it("consumes a late rejection after the deadline without an unhandled rejection", async () => {
    let rejectOperation: ((error: Error) => void) | undefined;
    const operation = new Promise<never>((_resolve, reject) => {
      rejectOperation = reject;
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const boundary = raceAsyncOperation(operation, {
        absoluteDeadlineAtMs: systemClock.nowMs() + 10,
        clock: systemClock,
      });
      expect(await boundary).toEqual({ status: "deadline-exceeded" });
      rejectOperation?.(new Error("late native resolver rejection"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
