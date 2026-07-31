import { describe, expect, it } from "vitest";
import type { BriefingRunCancellation } from "../types";
import { isCurrentBriefingRun } from "../briefing-run-acceptance";
import { BriefingRunService } from "../briefing-run-service";
import { BriefingRunReceiptSchema, BriefingRunResultSchema } from "../schemas";
import { dependencies, NOW, request } from "./fixtures";

describe("BriefingRun runtime receipt and identity", () => {
  it("returns a complete privacy-minimized receipt for atomic success", async () => {
    const result = await new BriefingRunService(dependencies()).execute(request());
    expect(result.runId).toBe("run:runtime");
    expect(result.receipt).toMatchObject({
      runId: "run:runtime",
      startedAt: NOW,
      completedAt: NOW,
      finalStage: "completed",
      outcomeKind: "completed",
      evidenceCount: 2,
    });
    if (result.outcome.kind !== "completed") throw new Error("Expected completion.");
    expect(result.receipt.sceneCount).toBe(result.outcome.script.scenes.length);
    expect(result.receipt.contractFingerprint).toBe(result.outcome.lineage.contractFingerprint);
    expect(result.receipt.contextFingerprint).toBe(result.outcome.lineage.contextFingerprint);
    expect(result.receipt.explanationPlanFingerprint)
      .toBe(result.outcome.lineage.explanationPlanFingerprint);
    expect(result.receipt.scriptFingerprint).toBe(result.outcome.lineage.scriptFingerprint);
    expect(result.receipt.sessionFingerprint).toBe(result.outcome.lineage.sessionFingerprint);
  });

  it("records only reached Contract lineage for clarification", async () => {
    const ambiguous = request("Why did that happen?");
    ambiguous.question.referencedEventIds = [];
    const result = await new BriefingRunService(dependencies()).execute(ambiguous);
    expect(result.outcome.kind).toBe("clarification-required");
    expect(result.receipt).toMatchObject({
      finalStage: "contract-building",
      outcomeKind: "clarification-required",
    });
    expect(result.receipt.contractFingerprint).toBeDefined();
    expect(result.receipt.contextFingerprint).toBeUndefined();
    expect(result.receipt.scriptFingerprint).toBeUndefined();
    expect(result.receipt.sessionFingerprint).toBeUndefined();
    expect(result.receipt.failureCategory).toBeUndefined();
  });

  it("keeps generation unavailability structured with partial lineage", async () => {
    const unavailable = dependencies({
      metadata: {
        providerId: "disabled",
        adapterId: "disabled",
        adapterVersion: "1",
        modelId: "disabled",
        supportsJsonSchema: true,
        supportsNativeStructuredOutput: true,
        supportsRefusalSignal: true,
        supportsUsageReporting: false,
        deterministicMode: "deterministic",
        configured: false,
      },
      capabilities: {
        maximumInputCharacters: 1,
        maximumOutputTokens: 1,
        nativeStructuredOutput: true,
        jsonSchemaDraft: "draft-7",
        supportsAbortSignal: true,
        supportsRequestId: true,
        supportsTemperature: false,
        supportsSeed: false,
        supportsReasoningControl: false,
      },
      async generate() {
        throw new Error("Unconfigured provider must not run.");
      },
    });
    const result = await new BriefingRunService(unavailable).execute(request());
    expect(result.outcome.kind).toBe("generation-unavailable");
    expect(result.receipt).toMatchObject({
      finalStage: "plan-generating",
      outcomeKind: "generation-unavailable",
      failureCategory: "generation-unavailable",
    });
    expect(result.receipt.contractFingerprint).toBeDefined();
    expect(result.receipt.contextFingerprint).toBeDefined();
    expect(result.receipt.explanationPlanFingerprint).toBeUndefined();
    expect(result.receipt.scriptFingerprint).toBeUndefined();
  });

  it("sanitizes unexpected failures in both outcome and receipt", async () => {
    const base = dependencies();
    const result = await new BriefingRunService({
      ...base,
      contextBuilder: {
        build() {
          throw new Error("raw secret provider failure and stack");
        },
      },
    }).execute(request());
    expect(result.outcome).toMatchObject({
      kind: "failed",
      finalStage: "context-building",
      category: "unexpected",
      reason: "UNEXPECTED_FAILURE",
    });
    expect(result.receipt.failureCategory).toBe("unexpected");
    expect(JSON.stringify(result)).not.toContain("raw secret");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("separates runtime IDs and timestamps from stable semantic lineage", async () => {
    const base = dependencies();
    const ids = ["run:first", "run:second"];
    const times = [
      "2026-07-31T00:00:00.000Z",
      "2026-07-31T00:00:01.000Z",
      "2026-07-31T00:01:00.000Z",
      "2026-07-31T00:01:02.000Z",
    ];
    const service = new BriefingRunService({
      ...base,
      runtimeIdGenerator: { nextRunId: () => ids.shift() ?? "run:exhausted" },
      runtimeClock: { now: () => times.shift() ?? NOW },
    });
    const first = await service.execute(request());
    const second = await service.execute(request());
    expect(first.runId).not.toBe(second.runId);
    expect(first.receipt.startedAt).not.toBe(second.receipt.startedAt);
    if (first.outcome.kind !== "completed" || second.outcome.kind !== "completed") {
      throw new Error("Expected completed outcomes.");
    }
    expect(second.outcome.lineage).toEqual(first.outcome.lineage);
    expect(Object.keys(first.outcome.lineage)).not.toContain("runId");
    expect(Object.keys(first.outcome.lineage)).not.toContain("startedAt");
  });

  it("strictly rejects receipt/result metadata outside the contract", async () => {
    const result = await new BriefingRunService(dependencies()).execute(request());
    expect(BriefingRunResultSchema.safeParse({ ...result, rawPrompt: "private" }).success)
      .toBe(false);
    expect(BriefingRunReceiptSchema.safeParse({
      ...result.receipt,
      providerResponse: "private",
    }).success).toBe(false);
  });
});

describe("BriefingRun cancellation", () => {
  it("cancels before Contract execution", async () => {
    const base = dependencies();
    let contractCalls = 0;
    const result = await new BriefingRunService({
      ...base,
      contractCompiler: {
        compile(input) {
          contractCalls += 1;
          return base.contractCompiler.compile(input);
        },
      },
    }).execute(request(), { cancellation: constantCancellation(true) });
    expect(result.outcome.kind).toBe("cancelled");
    expect(result.receipt.finalStage).toBe("received");
    expect(result.receipt.completedAt).toBe(NOW);
    expect(result.receipt.failureCategory).toBeUndefined();
    expect(contractCalls).toBe(0);
  });

  it("cancels after Contract and does not execute Context", async () => {
    const base = dependencies();
    let checks = 0;
    let contextCalls = 0;
    const cancellation: BriefingRunCancellation = {
      isCancellationRequested: () => ++checks >= 3,
    };
    const result = await new BriefingRunService({
      ...base,
      contextBuilder: {
        build(input) {
          contextCalls += 1;
          return base.contextBuilder.build(input);
        },
      },
    }).execute(request(), { cancellation });
    expect(result.outcome.kind).toBe("cancelled");
    expect(result.receipt.finalStage).toBe("contract-building");
    expect(result.receipt.contractFingerprint).toBeDefined();
    expect(contextCalls).toBe(0);
  });

  it("rejects a late generation result before Script or Session creation", async () => {
    const base = dependencies();
    let cancelled = false;
    let scriptCalls = 0;
    let sessionCalls = 0;
    const result = await new BriefingRunService({
      ...base,
      generationCoordinator: {
        async generate(input) {
          const generated = await base.generationCoordinator.generate(input);
          cancelled = true;
          return generated;
        },
      },
      scriptCompiler: {
        compile(input) {
          scriptCalls += 1;
          return base.scriptCompiler.compile(input);
        },
      },
      initializeSession(input) {
        sessionCalls += 1;
        return base.initializeSession(input);
      },
    }).execute(request(), {
      cancellation: { isCancellationRequested: () => cancelled },
    });
    expect(result.outcome.kind).toBe("cancelled");
    expect(result.receipt.finalStage).toBe("plan-generating");
    expect(result.receipt.explanationPlanFingerprint).toBeDefined();
    expect(result.receipt.scriptFingerprint).toBeUndefined();
    expect(scriptCalls).toBe(0);
    expect(sessionCalls).toBe(0);
  });

  it("cancels after Script compilation and before Session initialization", async () => {
    const base = dependencies();
    let cancelled = false;
    let sessionCalls = 0;
    const result = await new BriefingRunService({
      ...base,
      scriptCompiler: {
        compile(input) {
          const compiled = base.scriptCompiler.compile(input);
          cancelled = true;
          return compiled;
        },
      },
      initializeSession(input) {
        sessionCalls += 1;
        return base.initializeSession(input);
      },
    }).execute(request(), {
      cancellation: { isCancellationRequested: () => cancelled },
    });
    expect(result.outcome.kind).toBe("cancelled");
    expect(result.receipt.finalStage).toBe("script-compiling");
    expect(result.receipt.scriptFingerprint).toBeDefined();
    expect(result.receipt.sessionFingerprint).toBeUndefined();
    expect(sessionCalls).toBe(0);
  });
});

describe("BriefingRun acceptance identity", () => {
  it("accepts only a result matching the controller's expected run ID", async () => {
    const result = await new BriefingRunService(dependencies()).execute(request());
    expect(isCurrentBriefingRun("run:other", result)).toBe(false);
    expect(isCurrentBriefingRun(result.runId, result)).toBe(true);
    expect(isCurrentBriefingRun("", result)).toBe(false);
  });
});

function constantCancellation(cancelled: boolean): BriefingRunCancellation {
  return { isCancellationRequested: () => cancelled };
}
