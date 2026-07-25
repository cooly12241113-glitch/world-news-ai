import { describe, expect, it } from "vitest";
import {
  DeterministicFakeStructuredProvider,
  StructuredExplanationPlanCoordinator,
} from "../../generation";
import { input, proposal } from "../../generation/__tests__/fixtures";
import {
  presentationPreference,
  RuleBasedBriefingScriptCompiler,
} from "../../script";

async function pipeline(text: string, mode: Parameters<typeof presentationPreference>[0] = "auto") {
  const generationInput = input(text);
  const generated = await new StructuredExplanationPlanCoordinator({
    provider: new DeterministicFakeStructuredProvider(() => ({
      outcome: "proposal", proposal: proposal(text),
    })),
  }).generate(generationInput);
  if (!generated.success || generated.outcome !== "validated-plan") return { generated };
  const compiled = new RuleBasedBriefingScriptCompiler(() => new Date("2026-07-25T00:00:00.000Z")).compile({
    plan: generated.plan, contract: generationInput.briefingContract,
    contextPackage: generationInput.evidenceContextPackage,
    preference: presentationPreference(mode),
  });
  return { generated, compiled };
}

describe("Sprint 12 offline Plan to Script pipeline", () => {
  it.each([
    ["causal", "Why did the energy disruption happen?", "auto"],
    ["impact", "What is the impact of the energy disruption?", "map-and-chart"],
    ["verification", "Verify this claim against the evidence.", "document-led"],
    ["forecast", "What is the likely outcome next year?", "chart-led"],
    ["static", "Summarize the current situation.", "static"],
    ["reduced motion", "Explore what is happening.", "reduced-motion"],
  ] as const)("builds the %s briefing", async (_name, text, mode) => {
    const result = await pipeline(text, mode);
    expect(result.generated).toMatchObject({ success: true, outcome: "validated-plan" });
    expect(result.compiled).toMatchObject({
      success: true,
      outcome: ["static", "reduced-motion"].includes(mode)
        ? "validated-static-script" : expect.stringMatching(/validated|partial/),
    });
  });

  it("does not create a script for insufficient context", async () => {
    const value = input();
    value.evidenceContextPackage.status = "insufficient-evidence";
    const generated = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => ({
        outcome: "proposal", proposal: proposal(),
      })),
    }).generate(value);
    expect(generated).toMatchObject({ success: true, outcome: "insufficient-context" });
  });

  it("does not create a script for clarification-required personalization", async () => {
    const value = input();
    value.question = { ...value.question, id: "personal", personalizationRequested: true };
    value.briefingContract = {
      ...value.briefingContract, questionId: "personal", status: "clarification-required",
      intentAnalysis: {
        ...value.briefingContract.intentAnalysis, questionId: "personal",
        ambiguity: {
          status: "clarification-required", issues: ["Personal context missing."],
          missingInformation: ["portfolio"], resolvableWithDefaults: false,
        },
      },
    };
    const generated = await new StructuredExplanationPlanCoordinator({
      provider: new DeterministicFakeStructuredProvider(() => ({
        outcome: "proposal", proposal: proposal(),
      })),
    }).generate(value);
    expect(generated).toMatchObject({ success: true, outcome: "clarification-required" });
  });
});
