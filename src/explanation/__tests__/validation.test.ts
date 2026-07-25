import { describe, expect, it } from "vitest";
import {
  ExplanationPlanBuildResultSchema,
  ExplanationPlanSchema,
  ExplanationStepSchema,
} from "../validation";
import { assembled } from "./fixtures";

describe("ExplanationPlan runtime validation", () => {
  it("accepts a strict valid plan", () => {
    expect(ExplanationPlanSchema.safeParse(assembled().plan).success).toBe(true);
  });

  it("rejects unknown keys, empty IDs, invalid timestamps, scores, and enums", () => {
    const { plan } = assembled();
    expect(ExplanationPlanSchema.safeParse({ ...plan, secret: "raw prompt" }).success).toBe(false);
    expect(ExplanationPlanSchema.safeParse({ ...plan, id: "" }).success).toBe(false);
    expect(ExplanationPlanSchema.safeParse({ ...plan, createdAt: "yesterday" }).success).toBe(false);
    expect(ExplanationPlanSchema.safeParse({
      ...plan, coverage: { ...plan.coverage, overall: 1.1 },
    }).success).toBe(false);
    expect(ExplanationPlanSchema.safeParse({ ...plan, answerStrategy: "invent-answer" }).success).toBe(false);
  });

  it("rejects renderer instructions because the visual schema is closed", () => {
    const { plan } = assembled();
    const visual = plan.sections.flatMap(({ visualIntents }) => visualIntents)[0];
    if (!visual) return;
    expect(ExplanationPlanSchema.safeParse({
      ...plan,
      sections: plan.sections.map((section, index) => index === 0 ? {
        ...section,
        visualIntents: [{ ...visual, css: ".secret {}", cameraPosition: [1, 2, 3] }],
      } : section),
    }).success).toBe(false);
  });

  it("validates step output and epistemic enums strictly", () => {
    const step = assembled().plan.sections[0]!.steps[0]!;
    expect(ExplanationStepSchema.safeParse(step).success).toBe(true);
    expect(ExplanationStepSchema.safeParse({
      ...step,
      outputRequirement: { ...step.outputRequirement, outputType: "final-prose" },
    }).success).toBe(false);
  });

  it("validates discriminated build outcomes", () => {
    expect(ExplanationPlanBuildResultSchema.safeParse({
      success: true, outcome: "no-plan", reasons: ["No evidence-bearing plan is possible."],
    }).success).toBe(true);
    expect(ExplanationPlanBuildResultSchema.safeParse({
      success: false,
      error: { code: "PLAN_ASSEMBLY_FAILED", stage: "assembly", retryable: false },
    }).success).toBe(true);
  });
});
