import { describe, expect, it } from "vitest";
import { explanationPlanSemanticFingerprint } from "../fingerprint";
import { assembled } from "./fixtures";

describe("ExplanationPlan semantic fingerprint", () => {
  it("ignores generated IDs, timestamps, warnings, and unordered references", () => {
    const { plan } = assembled();
    const changed = structuredClone(plan);
    changed.id = "different-plan";
    changed.createdAt = "2030-01-01T00:00:00.000Z";
    changed.warnings.reverse();
    for (const section of changed.sections) {
      section.id = `different-${section.id}`;
      section.contextItemIds.reverse();
      for (const step of section.steps) {
        step.sectionId = section.id;
        step.subjectEntityIds.reverse();
        step.locationIds.reverse();
        step.evidenceBindings.forEach((binding) => {
          binding.id = `different-${binding.id}`;
          binding.sourceDocumentIds.reverse();
          binding.provenanceRecordIds.reverse();
        });
      }
    }
    expect(explanationPlanSemanticFingerprint(changed)).toBe(explanationPlanSemanticFingerprint(plan));
  });

  it.each([
    ["section order", (plan: ReturnType<typeof assembled>["plan"]) => { plan.sections[0]!.order = 4; }],
    ["evidence binding", (plan: ReturnType<typeof assembled>["plan"]) => {
      const binding = plan.sections.flatMap(({ steps }) => steps).flatMap(({ evidenceBindings }) => evidenceBindings)[0]!;
      binding.usage = binding.usage === "supports" ? "contextualizes" : "supports";
    }],
    ["context fingerprint", (plan: ReturnType<typeof assembled>["plan"]) => { plan.contextPackageFingerprint = "changed"; }],
    ["policy version", (plan: ReturnType<typeof assembled>["plan"]) => { plan.policyVersion = "v2"; }],
    ["generator version", (plan: ReturnType<typeof assembled>["plan"]) => { plan.generator.version = "2.0.0"; }],
  ] as const)("changes for semantic %s changes", (_name, mutate) => {
    const { plan } = assembled();
    const changed = structuredClone(plan);
    mutate(changed);
    expect(explanationPlanSemanticFingerprint(changed)).not.toBe(explanationPlanSemanticFingerprint(plan));
  });
});
