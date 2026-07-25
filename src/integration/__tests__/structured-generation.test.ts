import { describe, expect, it } from "vitest";
import {
  DeterministicFakeStructuredProvider,
  StructuredExplanationPlanCoordinator,
} from "../../generation";
import { input, proposal } from "../../generation/__tests__/fixtures";

describe("Sprint 11 offline structured generation pipeline", () => {
  it.each([
    ["causal", "Why did the energy disruption happen?"],
    ["impact", "What is the impact of the energy disruption?"],
    ["verification", "Verify this claim against the evidence."],
    ["forecast", "What is the likely outcome next year?"],
  ])("validates the %s scenario", async (_name, text) => {
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => ({
        outcome: "proposal", proposal: proposal(text),
      })),
    }).generate(input(text));
    expect(result, JSON.stringify(result)).toMatchObject({ success: true, outcome: "validated-plan" });
  });

  it("stops insufficient context before provider", async () => {
    let calls = 0;
    const value = input();
    value.evidenceContextPackage.status = "insufficient-evidence";
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => {
        calls += 1;
        return { outcome: "proposal", proposal: proposal() };
      }),
    }).generate(value);
    expect(result).toMatchObject({ success: true, outcome: "insufficient-context" });
    expect(calls).toBe(0);
  });

  it("stops clarification-required personalization before provider", async () => {
    let calls = 0;
    const value = input();
    value.question = {
      ...value.question, id: "personal-question", text: "How does this affect my portfolio?",
      personalizationRequested: true,
    };
    value.briefingContract = {
      ...value.briefingContract, questionId: value.question.id, status: "clarification-required",
      intentAnalysis: {
        ...value.briefingContract.intentAnalysis, questionId: value.question.id,
        primaryIntent: "personalized-impact",
        ambiguity: {
          status: "clarification-required", issues: ["Personal context is missing."],
          missingInformation: ["portfolio holdings"], resolvableWithDefaults: false,
          clarificationQuestion: "Which holdings should be analyzed?",
        },
      },
    };
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => {
        calls += 1;
        return { outcome: "proposal", proposal: proposal() };
      }),
    }).generate(value);
    expect(result).toMatchObject({ success: true, outcome: "clarification-required" });
    expect(calls).toBe(0);
  });

  it("repairs an invalid reference once", async () => {
    const invalid = proposal();
    invalid.sections[0]!.contextItemIds = ["invented"];
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider((_request, call) => ({
        outcome: "proposal", proposal: call === 1 ? invalid : proposal(),
      })),
    }).generate(input());
    expect(result).toMatchObject({ success: true, outcome: "validated-plan" });
    expect(result.audit.repairCount).toBe(1);
  });

  it("records provider refusal without creating a plan", async () => {
    const result = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => ({
        outcome: "refusal", refusal: { code: "safety", reason: "Refused." },
      })),
    }).generate(input());
    expect(result).toMatchObject({ success: true, outcome: "provider-refusal" });
    expect(result.audit.refusal).toBeDefined();
  });
});
