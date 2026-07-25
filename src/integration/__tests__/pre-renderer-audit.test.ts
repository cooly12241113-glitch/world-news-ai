import { describe, expect, it } from "vitest";
import type { SourceDocument } from "../../domain";
import { candidateFromRecord } from "../../context";
import {
  ExplanationPlanValidator,
  RuleBasedExplanationPlanAssembler,
} from "../../explanation";
import { generationInput } from "../../explanation/__tests__/fixtures";
import { normalizeUrlForIdentity } from "../../persistence";

const TIME = "2026-07-25T00:00:00.000Z";

function document(id: string, canonicalUrl: string): SourceDocument {
  return {
    id,
    sourceId: "source-audit",
    documentType: "GovernmentDocument",
    canonicalUrl,
    title: `Audit document ${id}`,
    languageCode: "en",
    retrievedAt: TIME,
    authorNames: [],
    summary: "A sufficiently descriptive audit source summary.",
    entityIds: [],
    topicIds: [],
    eventIds: ["event-audit"],
  };
}

describe("Milestone 02 pre-renderer regressions", () => {
  it("preserves identity-bearing query parameters into context provenance", () => {
    const first = candidateFromRecord(
      document("document-1", "https://example.com/document?id=1&utm_source=a"),
      TIME,
    );
    const second = candidateFromRecord(
      document("document-2", "https://example.com/document?id=2&utm_source=b"),
      TIME,
    );

    expect(first.provenance.canonicalIdentity).toBe(
      normalizeUrlForIdentity("https://example.com/document?id=1"),
    );
    expect(second.provenance.canonicalIdentity).toBe(
      normalizeUrlForIdentity("https://example.com/document?id=2"),
    );
    expect(first.provenance.canonicalIdentity).not.toBe(
      second.provenance.canonicalIdentity,
    );
  });

  it("keeps the forecast Assumptions section epistemically uncertain", () => {
    const input = generationInput("What is the likely outcome next year?");
    const result = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(TIME),
      createId: () => "forecast-plan",
    }).generate(input);
    if (!result.success || !("plan" in result)) throw new Error("plan missing");
    const assumptions = result.plan.sections.find(
      ({ sourceContractSection }) => sourceContractSection === "Assumptions",
    );
    expect(assumptions).toMatchObject({ kind: "uncertainty" });
    expect(assumptions?.steps.every((step) =>
      step.epistemicPolicy.preferredType === "unknown"
      && step.uncertaintyRequirement === "required")).toBe(true);
    expect(new ExplanationPlanValidator().validate(
      result.plan, input.contract, input.contextPackage,
    ).outcome).toMatch(/valid|insufficient-context/);
  });
});
