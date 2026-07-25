import { describe, expect, it } from "vitest";
import { ExplanationPlanValidator } from "../validator";
import { assembled, noContext } from "./fixtures";

describe("ExplanationPlanValidator", () => {
  it("returns a structured valid or warning-bearing result", () => {
    const { input, plan } = assembled();
    const result = new ExplanationPlanValidator().validate(plan, input.contract, input.contextPackage);
    expect(["valid", "valid-with-warnings"]).toContain(result.outcome);
    if ("plan" in result) expect(result.plan.status).toBe("validated");
  });

  it.each([
    ["questionId", "other-question", "QUESTION_REFERENCE_MISMATCH"],
    ["contractId", "other-contract", "CONTRACT_REFERENCE_MISMATCH"],
    ["contextPackageId", "other-context", "CONTEXT_REFERENCE_MISMATCH"],
    ["contractFingerprint", "changed", "CONTRACT_REFERENCE_MISMATCH"],
    ["contextPackageFingerprint", "changed", "CONTEXT_REFERENCE_MISMATCH"],
  ] as const)("rejects a broken %s", (field, value, code) => {
    const { input, plan } = assembled();
    const result = new ExplanationPlanValidator().validate(
      { ...plan, [field]: value }, input.contract, input.contextPackage,
    );
    expect(result.outcome).toBe("invalid");
    expect(result.issues.some((issue) => issue.code === code)).toBe(true);
  });

  it("rejects duplicate section and step order", () => {
    const { input, plan } = assembled();
    const broken = structuredClone(plan);
    broken.sections[1]!.order = broken.sections[0]!.order;
    broken.sections[0]!.steps.push({
      ...structuredClone(broken.sections[0]!.steps[0]!),
      id: "duplicate-order-step",
    });
    const result = new ExplanationPlanValidator().validate(broken, input.contract, input.contextPackage);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["INVALID_SECTION_ORDER", "INVALID_STEP_ORDER"]),
    );
  });

  it("detects direct and indirect dependency cycles deterministically", () => {
    const { input, plan } = assembled();
    const broken = structuredClone(plan);
    const first = broken.sections[0]!.steps[0]!;
    const second = broken.sections[1]!.steps[0]!;
    first.dependencyStepIds = [second.id];
    second.dependencyStepIds = [first.id];
    const validator = new ExplanationPlanValidator();
    const firstResult = validator.validate(broken, input.contract, input.contextPackage);
    const secondResult = validator.validate(broken, input.contract, input.contextPackage);
    expect(firstResult.issues.some(({ code }) => code === "STEP_DEPENDENCY_CYCLE")).toBe(true);
    expect(firstResult.fingerprint).toBe(secondResult.fingerprint);
  });

  it("rejects missing dependency and broken context/provenance references", () => {
    const { input, plan } = assembled();
    const broken = structuredClone(plan);
    const step = broken.sections[0]!.steps[0]!;
    step.dependencyStepIds = ["missing-step"];
    step.evidenceBindings[0]!.contextItemId = "missing-item";
    step.evidenceBindings[0]!.provenanceRecordIds = ["missing-provenance"];
    const result = new ExplanationPlanValidator().validate(broken, input.contract, input.contextPackage);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["INVALID_EXPLANATION_PLAN", "BROKEN_CONTEXT_REFERENCE"]),
    );
  });

  it("enforces epistemic fact-promotion and forecast-assumption rules", () => {
    const { input, plan } = assembled();
    const broken = structuredClone(plan);
    const step = broken.sections[0]!.steps[0]!;
    step.epistemicPolicy.prohibitFactPromotion = false;
    step.epistemicPolicy.allowedTypes = ["forecast"];
    step.epistemicPolicy.preferredType = "forecast";
    step.epistemicPolicy.requireAssumptions = false;
    step.outputRequirement.allowedEpistemicTypes = ["forecast"];
    const result = new ExplanationPlanValidator().validate(broken, input.contract, input.contextPackage);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["UNSUPPORTED_FACT_PROMOTION", "FORECAST_ASSUMPTION_MISSING"]),
    );
  });

  it("reports insufficient context without manufacturing evidence", () => {
    const { input, plan } = assembled();
    const context = noContext(input);
    const adjusted = {
      ...plan,
      contextPackageFingerprint: context.fingerprint,
      contextPackageId: context.id,
      sections: plan.sections.map((section) => ({
        ...section,
        contextItemIds: [],
        steps: section.steps.map((step) => ({
          ...step,
          evidenceBindings: [],
          epistemicPolicy: { ...step.epistemicPolicy, evidenceRequirement: "gap-required" as const },
        })),
      })),
    };
    const result = new ExplanationPlanValidator().validate(adjusted, input.contract, context);
    expect(result.outcome, JSON.stringify(result.issues)).toBe("insufficient-context");
  });
});
