import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Claim, DataPoint, EvidenceLink } from "../../domain";
import { ClaimSchema } from "../claim";
import { DataPointSchema } from "../data-point";
import {
  EvidenceLinkSchema,
  EvidenceRelationSchema,
  EvidenceTargetTypeSchema,
} from "../evidence-link";

const claimFixture: Claim = {
  id: "claim-1",
  sourceDocumentId: "document-1",
  statement: "Regional output increased",
  confidence: "high",
  attributedEntityIds: ["entity-1"],
  eventIds: ["event-1"],
  extractedAt: "2026-07-24T03:00:00.000Z",
};

const dataPointFixture: DataPoint = {
  id: "data-point-1",
  sourceDocumentId: "document-1",
  name: "GDP growth",
  value: 2.5,
  unit: "percent",
  observedAt: "2026-07-24T00:00:00.000Z",
  confidence: "high",
  entityIds: ["entity-1"],
  eventIds: ["event-1"],
};

const evidenceLinkFixture: EvidenceLink = {
  id: "evidence-link-1",
  sourceDocumentId: "document-1",
  targetType: "claim",
  targetId: "claim-1",
  relation: "supports",
  locator: "page 4",
  excerpt: "Output increased by 2.5 percent.",
  confidence: "high",
  createdAt: "2026-07-24T03:30:00.000Z",
};

describe("ClaimSchema", () => {
  it("accepts a valid claim and empty relationship arrays", () => {
    expect(ClaimSchema.parse(claimFixture)).toEqual(claimFixture);
    expect(
      ClaimSchema.safeParse({
        ...claimFixture,
        attributedEntityIds: [],
        eventIds: [],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid claim structures", () => {
    expect(
      ClaimSchema.safeParse({ ...claimFixture, statement: " " }).success,
    ).toBe(false);
    expect(
      ClaimSchema.safeParse({
        ...claimFixture,
        eventIds: ["event-1", "event-1"],
      }).success,
    ).toBe(false);
    expect(
      ClaimSchema.safeParse({ ...claimFixture, extra: true }).success,
    ).toBe(false);
  });

  it("matches the Claim domain type", () => {
    expectTypeOf<z.infer<typeof ClaimSchema>>().toEqualTypeOf<Claim>();
  });
});

describe("DataPointSchema", () => {
  it("accepts finite numbers and non-empty string values", () => {
    expect(DataPointSchema.parse(dataPointFixture)).toEqual(dataPointFixture);
    expect(
      DataPointSchema.safeParse({
        ...dataPointFixture,
        value: "provisional",
        unit: undefined,
        observedAt: undefined,
      }).success,
    ).toBe(true);
  });

  it("rejects non-finite, empty, duplicate, and unknown values", () => {
    expect(
      DataPointSchema.safeParse({ ...dataPointFixture, value: Number.NaN })
        .success,
    ).toBe(false);
    expect(
      DataPointSchema.safeParse({ ...dataPointFixture, value: " " }).success,
    ).toBe(false);
    expect(
      DataPointSchema.safeParse({
        ...dataPointFixture,
        entityIds: ["entity-1", "entity-1"],
      }).success,
    ).toBe(false);
    expect(
      DataPointSchema.safeParse({ ...dataPointFixture, extra: true }).success,
    ).toBe(false);
  });

  it("matches the DataPoint domain type", () => {
    expectTypeOf<z.infer<typeof DataPointSchema>>().toEqualTypeOf<DataPoint>();
  });
});

describe("EvidenceLinkSchema", () => {
  it.each(["claim", "data_point", "event", "analysis"])(
    "accepts EvidenceTargetType %s",
    (targetType) => {
      expect(EvidenceTargetTypeSchema.safeParse(targetType).success).toBe(true);
    },
  );

  it.each(["supports", "contradicts", "contextualizes", "derived_from"])(
    "accepts EvidenceRelation %s",
    (relation) => {
      expect(EvidenceRelationSchema.safeParse(relation).success).toBe(true);
    },
  );

  it("accepts complete and minimal evidence links", () => {
    expect(EvidenceLinkSchema.parse(evidenceLinkFixture)).toEqual(
      evidenceLinkFixture,
    );
    const {
      locator: _locator,
      excerpt: _excerpt,
      ...minimal
    } = evidenceLinkFixture;
    expect(EvidenceLinkSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects invalid relation, null, and unknown fields", () => {
    expect(
      EvidenceLinkSchema.safeParse({
        ...evidenceLinkFixture,
        relation: "proves",
      }).success,
    ).toBe(false);
    expect(
      EvidenceLinkSchema.safeParse({
        ...evidenceLinkFixture,
        excerpt: null,
      }).success,
    ).toBe(false);
    expect(
      EvidenceLinkSchema.safeParse({
        ...evidenceLinkFixture,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("matches the EvidenceLink domain type", () => {
    expectTypeOf<z.infer<typeof EvidenceLinkSchema>>()
      .toEqualTypeOf<EvidenceLink>();
  });
});
