import { describe, expect, it } from "vitest";
import {
  EventDossierBuilder,
  EventDossierSchema,
  generateDossierFingerprint,
} from "../index";
import { dossierInputFixture } from "./fixtures";

const builder = () =>
  new EventDossierBuilder(
    () => new Date("2026-07-24T12:00:00.000Z"),
    () => "dossier-1",
  );

describe("EventDossierBuilder", () => {
  it("builds a valid first dossier with evidence, completeness, and warnings", () => {
    const result = builder().build(dossierInputFixture());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outcome).toBe("created");
      expect(result.revision.revisionNumber).toBe(1);
      expect(EventDossierSchema.safeParse(result.revision.snapshot).success).toBe(
        true,
      );
      expect(
        result.revision.snapshot.sections.claims.assessments.find(
          ({ claimId }) => claimId === "claim-1",
        )?.status,
      ).toBe("disputed");
      expect(result.revision.snapshot.sections.contradictions.items.length).toBeGreaterThan(
        0,
      );
      expect(result.revision.snapshot.completeness.overallScore).toBeLessThan(1);
      expect(result.revision.snapshot.openQuestionIds).toEqual(["question-1"]);
    }
  });

  it("sorts timelines and deduplicates top-level references", () => {
    const input = dossierInputFixture();
    input.sourceDocuments.push(input.sourceDocuments[0]!);
    input.timelineItems = [
      {
        id: "late",
        occurredAt: "2026-07-24T03:00:00.000Z",
        title: "Late",
        description: "Later timeline item",
        itemType: "event",
        sourceDocumentIds: ["document-1"],
        claimIds: [],
        confidence: input.statements![0]!.confidence,
        temporalPrecision: "exact",
      },
      {
        id: "early",
        occurredAt: "2026-07-24T01:00:00.000Z",
        title: "Early",
        description: "Earlier timeline item",
        itemType: "event",
        sourceDocumentIds: ["document-1"],
        claimIds: [],
        confidence: input.statements![0]!.confidence,
        temporalPrecision: "exact",
      },
    ];
    const result = builder().build(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.revision.snapshot.sourceDocumentIds).toEqual([
        "document-1",
        "document-2",
      ]);
      expect(
        result.revision.snapshot.sections.timeline.items.map(({ id }) => id),
      ).toEqual(["early", "late"]);
    }
  });

  it("rejects event mismatches and broken references", () => {
    const mismatch = dossierInputFixture();
    mismatch.sourceDocuments[0]!.eventIds = ["event-other"];
    const mismatchResult = builder().build(mismatch);
    expect(mismatchResult.success).toBe(false);
    if (!mismatchResult.success) {
      expect(mismatchResult.error.code).toBe("EVENT_REFERENCE_MISMATCH");
    }

    const broken = dossierInputFixture();
    broken.evidenceLinks[0]!.targetId = "claim-missing";
    const brokenResult = builder().build(broken);
    expect(brokenResult.success).toBe(false);
    if (!brokenResult.success) {
      expect(brokenResult.error.code).toBe("BROKEN_REFERENCE");
    }
  });

  it("does not invent contradictions from supporting evidence only", () => {
    const input = dossierInputFixture();
    input.evidenceLinks = input.evidenceLinks.filter(
      ({ relation }) => relation === "supports",
    );
    input.dataPoints = [];
    const result = builder().build(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.revision.snapshot.sections.contradictions.items).toEqual([]);
    }
  });

  it("returns unchanged for semantically identical input", () => {
    const first = builder().build(dossierInputFixture());
    expect(first.success).toBe(true);
    if (!first.success) return;
    const second = builder().build({
      ...dossierInputFixture(),
      previousRevision: first.revision,
    });
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.outcome).toBe("unchanged");
      expect(second.revision.id).toBe(first.revision.id);
    }
  });

  it("creates a linked revision and change set when a source is added", () => {
    const first = builder().build(dossierInputFixture());
    expect(first.success).toBe(true);
    if (!first.success) return;
    const next = dossierInputFixture();
    next.sourceDocuments.push({
      ...next.sourceDocuments[0]!,
      id: "document-3",
      sourceId: "source-3",
      canonicalUrl: "https://statistics.example/data",
      documentType: "StatisticalDataset",
    });
    const second = builder().build({ ...next, previousRevision: first.revision });
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.outcome).toBe("revised");
      expect(second.revision.revisionNumber).toBe(2);
      expect(second.revision.previousRevisionId).toBe(first.revision.id);
      expect(second.revision.changeSet).toContainEqual(
        expect.objectContaining({
          targetType: "source-document",
          targetId: "document-3",
          changeType: "added",
        }),
      );
    }
  });

  it("produces the same fingerprint regardless of input array order", () => {
    const first = builder().build(dossierInputFixture());
    const reversed = dossierInputFixture();
    reversed.sourceDocuments.reverse();
    reversed.claims.reverse();
    reversed.evidenceLinks.reverse();
    reversed.dataPoints.reverse();
    const second = builder().build(reversed);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.revision.snapshot.semanticFingerprint).toBe(
        second.revision.snapshot.semanticFingerprint,
      );
      expect(generateDossierFingerprint(first.revision.snapshot)).toBe(
        generateDossierFingerprint(second.revision.snapshot),
      );
    }
  });
});
