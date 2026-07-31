import { describe, expect, it, vi } from "vitest";
import type { BriefingRunResult } from "@world-news-ai/application-briefing-run";
import { BootstrapRunController, completedBootstrapState } from "./bootstrap-controller";
import type { LocalBriefingRuntimeHandle } from "./local-briefing-runtime";

function handle(runId: string): LocalBriefingRuntimeHandle {
  return { runId, result: new Promise(() => undefined), cancel: vi.fn() };
}

function terminal(runId: string): BriefingRunResult {
  return {
    runId,
    outcome: { kind: "generation-unavailable", finalStage: "plan-generating", technical: false },
    receipt: {
      runId,
      startedAt: "2026-07-31T00:00:00.000Z",
      completedAt: "2026-07-31T00:00:00.000Z",
      finalStage: "plan-generating",
      outcomeKind: "generation-unavailable",
    },
  };
}

describe("bootstrap run controller", () => {
  it("accepts only the latest run result", () => {
    const controller = new BootstrapRunController();
    const first = handle("run:first");
    const second = handle("run:second");
    controller.replace(first);
    controller.replace(second);
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(controller.accepts(terminal("run:first"))).toBe(false);
    expect(controller.accepts(terminal("run:second"))).toBe(true);
  });

  it("cancels the current run on cleanup", () => {
    const controller = new BootstrapRunController();
    const current = handle("run:current");
    controller.replace(current);
    controller.cancel();
    expect(current.cancel).toHaveBeenCalledOnce();
    expect(controller.accepts(terminal("run:current"))).toBe(false);
  });

  it("maps a non-completed outcome to a safe terminal state", () => {
    expect(completedBootstrapState(terminal("run:terminal"))).toEqual({
      status: "terminal-unavailable",
      message: "The fixture briefing is temporarily unavailable.",
    });
  });
});
