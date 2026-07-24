import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { SourceDocument } from "../../domain";
import {
  DocumentTypeSchema,
  SourceDocumentSchema,
} from "../source-document";

const sourceDocumentFixture: SourceDocument = {
  id: "document-1",
  sourceId: "source-1",
  documentType: "NewsArticle",
  canonicalUrl: "https://example.com/documents/1",
  title: "Regional economic outlook",
  languageCode: "en",
  publishedAt: "2026-07-24T01:30:00.000Z",
  retrievedAt: "2026-07-24T02:30:00.000Z",
  authorNames: ["Reporter One"],
  summary: "An outlook for the regional economy",
  contentText: "Document content",
  entityIds: ["entity-1"],
  topicIds: ["topic-1"],
  eventIds: ["event-1"],
};

describe("SourceDocumentSchema", () => {
  it.each([
    "NewsArticle",
    "GovernmentDocument",
    "StatisticalDataset",
    "VideoTranscript",
    "ResearchReport",
    "LegalDocument",
    "CorporateDisclosure",
  ])("accepts DocumentType %s", (documentType) => {
    expect(DocumentTypeSchema.safeParse(documentType).success).toBe(true);
  });

  it("accepts complete and minimal source documents", () => {
    expect(SourceDocumentSchema.parse(sourceDocumentFixture)).toEqual(
      sourceDocumentFixture,
    );

    const {
      publishedAt: _publishedAt,
      summary: _summary,
      contentText: _contentText,
      ...minimal
    } = sourceDocumentFixture;

    expect(
      SourceDocumentSchema.safeParse({
        ...minimal,
        authorNames: [],
        entityIds: [],
        topicIds: [],
        eventIds: [],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid values, duplicates, null, and unknown fields", () => {
    const { sourceId: _sourceId, ...missingSource } = sourceDocumentFixture;

    expect(SourceDocumentSchema.safeParse(missingSource).success).toBe(false);
    expect(
      SourceDocumentSchema.safeParse({
        ...sourceDocumentFixture,
        documentType: "Article",
      }).success,
    ).toBe(false);
    expect(
      SourceDocumentSchema.safeParse({
        ...sourceDocumentFixture,
        retrievedAt: "2026-07-24",
      }).success,
    ).toBe(false);
    expect(
      SourceDocumentSchema.safeParse({
        ...sourceDocumentFixture,
        eventIds: ["event-1", "event-1"],
      }).success,
    ).toBe(false);
    expect(
      SourceDocumentSchema.safeParse({
        ...sourceDocumentFixture,
        summary: null,
      }).success,
    ).toBe(false);
    expect(
      SourceDocumentSchema.safeParse({
        ...sourceDocumentFixture,
        unsupported: true,
      }).success,
    ).toBe(false);
  });

  it("matches the SourceDocument domain type", () => {
    expectTypeOf<z.infer<typeof SourceDocumentSchema>>()
      .toEqualTypeOf<SourceDocument>();
  });
});
