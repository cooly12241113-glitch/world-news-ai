import { describe, expect, it } from "vitest";
import { SourceDocumentSchema } from "../../validation";
import {
  generateFingerprint,
  IngestionPipeline,
  normalizeText,
} from "../index";
import {
  genericLegalHtml,
  jsonLdHtml,
  mainFallbackHtml,
  openGraphHtml,
} from "./fixtures";

const ingestHtml = (
  content: string,
  hints: {
    expectedDocumentType?: "NewsArticle" | "GovernmentDocument" | "LegalDocument";
    expectedLanguage?: string;
    sourceName?: string;
    title?: string;
  } = {},
  sourceUrl = "https://example.com/source",
) =>
  new IngestionPipeline().ingest({
    kind: "content",
    content,
    mediaType: "text/html",
    sourceUrl,
    retrievedAt: "2026-07-24T12:00:00.000Z",
    hints,
  });

describe("Generic HTML ingestion", () => {
  it("extracts JSON-LD metadata, body, date, author, and relative canonical URL", async () => {
    const result = await ingestHtml(jsonLdHtml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.document.title).toBe("Regional & Global Outlook");
      expect(result.document.contentText).toContain("Second paragraph");
      expect(result.document.publishedAt).toBe("2026-07-24T00:00:00.000Z");
      expect(result.document.authorNames).toEqual(["Reporter One"]);
      expect(result.document.canonicalUrl).toBe(
        "https://example.com/reports/outlook",
      );
      expect(result.document.documentType).toBe("NewsArticle");
      expect(result.normalizedDocument.sourceName).toBe("Example News");
      expect(result.trace.selectedCapability).toBe("generic-html");
      expect(result.trace.metadataSelections).toContainEqual(
        expect.objectContaining({
          field: "title",
          selectedEvidence: "json-ld.headline",
        }),
      );
    }
  });

  it("uses Open Graph title and semantic article body without boilerplate", async () => {
    const result = await ingestHtml(openGraphHtml, {
      expectedDocumentType: "GovernmentDocument",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.document.title).toBe("Open Graph Report");
      expect(result.document.contentText).toContain("first substantive");
      expect(result.document.contentText).toContain("\n\n");
      expect(result.document.contentText).not.toContain("Sidebar");
      expect(result.document.contentText).not.toContain("Footer");
      expect(result.document.contentText).not.toContain("Navigation");
    }
  });

  it("uses role=main scoring when richer metadata is absent", async () => {
    const result = await ingestHtml(mainFallbackHtml, {
      expectedDocumentType: "GovernmentDocument",
      sourceName: "Public Institution",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.document.title).toBe("Policy Brief Heading");
      expect(result.document.languageCode).toBe("ko");
      expect(result.document.contentText).toContain("첫 번째 문단");
    }
  });

  it("handles a generic legal structure without source-specific rules", async () => {
    const result = await ingestHtml(
      genericLegalHtml,
      { expectedDocumentType: "LegalDocument" },
      "https://law.example/input",
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.document.documentType).toBe("LegalDocument");
      expect(result.document.title).toBe("General Data Protection Regulation");
    }
  });

  it("reports conflicts instead of silently overriding extracted metadata", async () => {
    const result = await ingestHtml(jsonLdHtml, {
      title: "Caller title",
      expectedLanguage: "ko",
      expectedDocumentType: "GovernmentDocument",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toContain(
        "title hint conflicts with extracted metadata",
      );
      expect(result.warnings).toContain(
        "language hint conflicts with extracted metadata",
      );
      expect(result.warnings).toContain(
        "document type hint conflicts with extracted metadata",
      );
      expect(result.document.documentType).toBe("NewsArticle");
    }
  });

  it("fails when title or body is missing", async () => {
    const missingTitle = await ingestHtml(
      "<html lang='en'><body><main><p>A sufficiently long document body.</p></main></body></html>",
      { expectedDocumentType: "NewsArticle" },
    );
    expect(missingTitle.success).toBe(false);
    if (!missingTitle.success) {
      expect(missingTitle.error.code).toBe("TITLE_NOT_FOUND");
    }

    const missingBody = await ingestHtml(
      "<html lang='en'><head><title>Document title</title></head><body></body></html>",
      { expectedDocumentType: "NewsArticle" },
    );
    expect(missingBody.success).toBe(false);
    if (!missingBody.success) {
      expect(missingBody.error.code).toBe("EMPTY_CONTENT");
    }
  });

  it("fails classification when deterministic evidence is insufficient", async () => {
    const result = await ingestHtml(openGraphHtml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CLASSIFICATION_UNCERTAIN");
    }
  });
});

describe("Plain-text ingestion", () => {
  it("maps raw content with explicit language and document-type hints", async () => {
    const result = await new IngestionPipeline().ingest({
      kind: "content",
      content:
        "Research Outlook\n\nThe economy is expected to expand over the next quarter.",
      mediaType: "text/plain",
      sourceUrl: "https://research.example/outlook.txt",
      retrievedAt: "2026-07-24T12:00:00.000Z",
      hints: {
        expectedDocumentType: "ResearchReport",
        expectedLanguage: "en",
        sourceName: "Research Institute",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.trace.selectedCapability).toBe("plain-text");
      expect(result.document.documentType).toBe("ResearchReport");
      expect(SourceDocumentSchema.safeParse(result.document).success).toBe(true);
    }
  });

  it("does not fabricate missing language or document type", async () => {
    const result = await new IngestionPipeline().ingest({
      kind: "content",
      content: "Untyped text\n\nA body that is sufficiently long for ingestion.",
      sourceUrl: "https://example.com/text",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(["MAPPING_FAILED", "CLASSIFICATION_UNCERTAIN"]).toContain(
        result.error.code,
      );
    }
  });
});

describe("Normalization and fingerprinting", () => {
  it("normalizes Unicode, control characters, whitespace, and paragraphs", () => {
    expect(normalizeText("  Cafe\u0301\u0000   title \n\n\n body   text  ")).toBe(
      "Café title\n\nbody text",
    );
  });

  it("is deterministic across normalized representation differences", () => {
    const first = {
      canonicalUrl: "https://example.com/doc",
      title: normalizeText("  Report  title"),
      body: normalizeText("Paragraph one.\n\n\nParagraph two."),
    };
    const second = {
      canonicalUrl: "https://example.com/doc",
      title: normalizeText("Report title"),
      body: normalizeText("Paragraph one.\n\nParagraph two."),
    };
    expect(generateFingerprint(first)).toBe(generateFingerprint(second));
  });

  it("changes when canonical URL or content changes", () => {
    const base = {
      canonicalUrl: "https://example.com/a",
      title: "Title",
      body: "Body",
    };
    expect(generateFingerprint(base)).not.toBe(
      generateFingerprint({ ...base, canonicalUrl: "https://example.com/b" }),
    );
    expect(generateFingerprint(base)).not.toBe(
      generateFingerprint({ ...base, body: "Changed body" }),
    );
  });
});
