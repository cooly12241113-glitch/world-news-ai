import { describe, expect, it } from "vitest";
import {
  ExplanationPlanValidator,
  RuleBasedExplanationPlanAssembler,
} from "../../explanation";
import {
  generationInput,
  noContext,
  now,
} from "../../explanation/__tests__/fixtures";

describe("Sprint 10 ExplanationPlan pipeline", () => {
  it.each([
    ["causal-explanation", "Why did the energy disruption happen?", "explain-cause"],
    ["impact-analysis", "What is the impact of the disruption?", "trace-impact"],
    ["fact-verification", "Verify this claim against the evidence.", "verify-claim"],
  ])("builds and validates the %s scenario offline", (_scenario, text, strategy) => {
    const input = generationInput(text);
    const result = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(now),
      createId: () => "integration-plan",
    }).generate(input);
    expect(result.success).toBe(true);
    if (!result.success || !("plan" in result)) throw new Error("plan missing");
    expect(result.plan.answerStrategy).toBe(strategy);
    expect(result.plan.contextPackageFingerprint).toBe(input.contextPackage.fingerprint);
    const validation = new ExplanationPlanValidator()
      .validate(result.plan, input.contract, input.contextPackage);
    expect(["valid", "valid-with-warnings", "insufficient-context"]).toContain(validation.outcome);
  });

  it("keeps a forecast with insufficient evidence as explicit insufficient context", () => {
    const input = generationInput("What is the likely outcome next year?");
    input.contextPackage = noContext(input);
    const result = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(now), createId: () => "forecast-plan",
    }).generate(input);
    expect(result).toMatchObject({ success: true, outcome: "insufficient-context" });
    if (!result.success || !("plan" in result)) throw new Error("plan missing");
    expect(result.plan.answerStrategy).toBe("forecast-scenarios");
    expect(result.plan.sections.flatMap(({ steps }) => steps)
      .filter(({ epistemicPolicy }) => epistemicPolicy.preferredType === "forecast")
      .every(({ epistemicPolicy }) => epistemicPolicy.requireAssumptions)).toBe(true);
  });

  it("stops clarification-required personalization before plan creation", () => {
    const input = generationInput();
    input.question = {
      ...input.question,
      id: "personal-question",
      text: "How does this affect my portfolio?",
      personalizationRequested: true,
      userProvidedContext: undefined,
    };
    const result = new RuleBasedExplanationPlanAssembler().generate({
      ...input,
      contract: {
        ...input.contract,
        questionId: input.question.id,
        status: "clarification-required",
        intentAnalysis: {
          ...input.contract.intentAnalysis,
          questionId: input.question.id,
          primaryIntent: "personalized-impact",
          ambiguity: {
            status: "clarification-required",
            issues: ["Personal context is missing."],
            missingInformation: ["portfolio holdings"],
            resolvableWithDefaults: false,
            clarificationQuestion: "Which caller-provided holdings should be analyzed?",
          },
        },
      },
    });
    expect(result).toMatchObject({
      success: true,
      outcome: "clarification-required",
      clarificationQuestion: "Which caller-provided holdings should be analyzed?",
    });
    expect(result.success && "plan" in result).toBe(false);
  });
});
