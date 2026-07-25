import { describe, expect, it } from "vitest";
import { DeterministicFakeStructuredProvider } from "../adapters/deterministic-fake-adapter";
import { StructuredExplanationPlanCoordinator } from "../coordinator";
import { input, proposal } from "./fixtures";

const proposalResponse = () => ({
  outcome: "proposal" as const, proposal: proposal(),
  providerResponseId: "fake-response", finishReason: "completed",
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
});

describe("StructuredExplanationPlanCoordinator", () => {
  it("produces a validated plan and redacted audit", async () => {
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(proposalResponse),
    }).generate(input());
    expect(result).toMatchObject({ success: true, outcome: "validated-plan" });
    expect(result.audit.validatedPlanFingerprint).toBeTruthy();
    const serialized = JSON.stringify(result.audit);
    expect(serialized).not.toContain(input().question.text);
    expect(serialized).not.toContain(input().evidenceContextPackage.excerpts[0]!.text);
    expect(serialized).not.toContain("API_KEY");
  });

  it("does not call a provider for clarification or insufficient context", async () => {
    let calls = 0;
    const provider = new DeterministicFakeStructuredProvider(() => { calls += 1; return proposalResponse(); });
    const clarification = input();
    clarification.briefingContract.status = "clarification-required";
    expect(await new StructuredExplanationPlanCoordinator({ provider }).generate(clarification))
      .toMatchObject({ success: true, outcome: "clarification-required" });
    const insufficient = input();
    insufficient.evidenceContextPackage.evidenceGaps.push({
      id: "blocking-gap", gapType: "missing-primary-source", description: "Missing.",
      importance: "critical", relatedClaimIds: [], relatedEntityIds: [],
      suggestedDiscoveryQuery: "official evidence", blocking: true, reasons: ["required"],
    });
    expect(await new StructuredExplanationPlanCoordinator({ provider }).generate(insufficient))
      .toMatchObject({ success: true, outcome: "insufficient-context" });
    expect(calls).toBe(0);
  });

  it("records refusal without retry or repair", async () => {
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => ({
        outcome: "refusal", refusal: { code: "safety", reason: "Cannot comply." },
      })),
    }).generate(input());
    expect(result).toMatchObject({ success: true, outcome: "provider-refusal" });
    expect(result.audit.attempts).toHaveLength(1);
    expect(result.audit.repairCount).toBe(0);
  });

  it("retries rate limits with injected sleeper and respects the maximum", async () => {
    const delays: number[] = [];
    const provider = new DeterministicFakeStructuredProvider((_request, call) =>
      call < 3 ? {
        outcome: "failure", error: {
          code: "PROVIDER_RATE_LIMITED", stage: "provider",
          message: "Rate limited.", retryable: true,
        },
      } : proposalResponse());
    const result = await new StructuredExplanationPlanCoordinator({
      provider, sleeper: async (delay) => { delays.push(delay); },
    }).generate(input());
    expect(result.success).toBe(true);
    expect(delays).toEqual([100, 200]);
    expect(result.audit.attempts.map(({ kind }) => kind))
      .toEqual(["initial", "transport-retry", "transport-retry"]);
  });

  it("does not retry authentication, permission, quota, invalid request, or refusal", async () => {
    for (const code of [
      "PROVIDER_AUTHENTICATION_FAILED", "PROVIDER_PERMISSION_DENIED",
      "PROVIDER_QUOTA_EXCEEDED", "PROVIDER_INVALID_REQUEST",
    ] as const) {
      let calls = 0;
      const result = await new StructuredExplanationPlanCoordinator({
        provider: new DeterministicFakeStructuredProvider(() => {
          calls += 1;
          return { outcome: "failure", error: { code, stage: "provider", message: code, retryable: false } };
        }),
      }).generate(input());
      expect(result.success).toBe(false);
      expect(calls).toBe(1);
    }
  });

  it("repairs one disallowed reference and succeeds", async () => {
    const invalid = proposal();
    invalid.sections[0]!.contextItemIds = ["invented-context"];
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider((_request, call) =>
        call === 1 ? { outcome: "proposal", proposal: invalid } : proposalResponse()),
    }).generate(input());
    expect(result).toMatchObject({ success: true, outcome: "validated-plan" });
    expect(result.audit.repairCount).toBe(1);
  });

  it("returns repair exhausted after one repair", async () => {
    const invalid = proposal();
    invalid.sections[0]!.contextItemIds = ["invented-context"];
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => ({ outcome: "proposal", proposal: invalid })),
    }).generate(input());
    expect(result).toMatchObject({ success: false, error: { code: "REPAIR_EXHAUSTED" } });
    expect(result.audit.repairCount).toBe(1);
  });

  it("handles provider-not-configured without a call", async () => {
    const provider = new DeterministicFakeStructuredProvider(proposalResponse);
    Object.assign(provider.metadata, { configured: false });
    expect(await new StructuredExplanationPlanCoordinator({ provider }).generate(input()))
      .toMatchObject({ success: false, error: { code: "PROVIDER_NOT_CONFIGURED" } });
  });
});
