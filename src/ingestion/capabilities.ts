import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { DocumentType } from "../domain";
import { IngestionError } from "./error";
import type {
  ContentProbe,
  ExtractionCandidate,
  ExtractionResult,
  IngestionCapability,
  ResolvedInput,
} from "./types";

const candidate = <T>(
  value: T,
  confidence: number,
  evidence: string,
  sourceLocation?: string,
): ExtractionCandidate<T> => ({
  value,
  confidence,
  evidence,
  sourceLocation,
});

const emptyExtraction = (): ExtractionResult => ({
  titleCandidates: [],
  bodyCandidates: [],
  dateCandidates: [],
  canonicalUrlCandidates: [],
  languageCandidates: [],
  authorCandidates: [],
  publisherCandidates: [],
  documentTypeCandidates: [],
  extractionWarnings: [],
  extractionTrace: [],
});

const getMeta = ($: CheerioAPI, selector: string): string | undefined => {
  const value = $(selector).first().attr("content");
  return value?.trim() === "" ? undefined : value?.trim();
};

const getText = ($: CheerioAPI, element: AnyNode | undefined): string | undefined => {
  const value = element === undefined ? undefined : $(element).text().trim();
  return value === "" ? undefined : value;
};

interface JsonLdRecord {
  readonly [key: string]: unknown;
}

const isRecord = (value: unknown): value is JsonLdRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const flattenJsonLd = (value: unknown): JsonLdRecord[] => {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (!isRecord(value)) {
    return [];
  }
  const graph = value["@graph"];
  return graph === undefined ? [value] : [value, ...flattenJsonLd(graph)];
};

const parseJsonLd = ($: CheerioAPI, warnings: string[]): JsonLdRecord[] =>
  $('script[type="application/ld+json"]').toArray().flatMap(
    (script) => {
      try {
        return flattenJsonLd(JSON.parse($(script).text()));
      } catch {
        warnings.push("Malformed JSON-LD was ignored");
        return [];
      }
    },
  );

const stringValue = (
  record: JsonLdRecord,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
};

const nestedName = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (isRecord(value)) {
    return stringValue(value, "name");
  }
  return undefined;
};

const namesFrom = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .map(nestedName)
    .filter((name): name is string => name !== undefined);

const schemaTypeToDocumentType = (
  value: unknown,
): DocumentType | undefined => {
  const types = (Array.isArray(value) ? value : [value]).filter(
    (type): type is string => typeof type === "string",
  );
  if (types.some((type) => /NewsArticle|Article/i.test(type))) {
    return "NewsArticle";
  }
  if (types.some((type) => /Report|ScholarlyArticle/i.test(type))) {
    return "ResearchReport";
  }
  if (types.some((type) => /Dataset/i.test(type))) {
    return "StatisticalDataset";
  }
  if (types.some((type) => /VideoObject/i.test(type))) {
    return "VideoTranscript";
  }
  if (types.some((type) => /Legislation|Legal/i.test(type))) {
    return "LegalDocument";
  }
  return undefined;
};

const addMetaCandidate = (
  target: ExtractionCandidate<string>[],
  value: string | undefined,
  confidence: number,
  evidence: string,
): void => {
  if (value !== undefined) {
    target.push(candidate(value, confidence, evidence, evidence));
  }
};

const scoreBodyElement = ($: CheerioAPI, element: AnyNode): number => {
  const selected = $(element);
  const text = getText($, element) ?? "";
  const paragraphs = selected.find("p").length;
  const linkText = selected
    .find("a")
    .toArray()
    .map((link) => getText($, link) ?? "")
    .join(" ").length;
  const linkRatio = text.length === 0 ? 1 : linkText / text.length;
  const tagName = "tagName" in element ? element.tagName.toLowerCase() : "";
  const semanticBonus =
    tagName === "article" ||
    selected.attr("role") === "main"
      ? 500
      : tagName === "main"
        ? 350
        : 0;
  return text.length + paragraphs * 80 + semanticBonus - linkRatio * 500;
};

const bodyCandidates = ($: CheerioAPI): ExtractionCandidate<string>[] => {
  for (const selector of ["nav", "footer", "aside", "script", "style", "noscript"]) {
    $(selector).remove();
  }
  const candidates = $('article, main, [role="main"]')
    .toArray()
    .map((element) => ({ element, score: scoreBodyElement($, element) }))
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (best === undefined || best.score <= 0) {
    return [];
  }
  const paragraphTexts = $(best.element)
    .find("p")
    .toArray()
    .map((paragraph) => getText($, paragraph))
    .filter((text): text is string => text !== undefined);
  const body =
    paragraphTexts.length > 0
      ? paragraphTexts.join("\n\n")
      : getText($, best.element);
  const tagName =
    "tagName" in best.element ? best.element.tagName.toLowerCase() : "container";
  return body === undefined
    ? []
    : [
        candidate(
          body,
          tagName === "article" ? 0.9 : 0.75,
          `semantic-dom:${tagName}`,
        ),
      ];
};

export class GenericHtmlCapability implements IngestionCapability {
  readonly id = "generic-html";
  readonly priority = 100;

  canHandle(_input: ResolvedInput, probe: ContentProbe) {
    return {
      supported: probe.detectedFormat === "html",
      score: probe.detectedFormat === "html" ? 100 : 0,
      reasons:
        probe.detectedFormat === "html"
          ? ["detected-format:html"]
          : ["requires-html"],
    };
  }

  extract(input: ResolvedInput): ExtractionResult {
    let $: CheerioAPI;
    try {
      $ = load(input.content);
    } catch (cause) {
      throw new IngestionError("PARSE_FAILED", "HTML parsing failed", "extract", {
        cause,
      });
    }
    const result = emptyExtraction();
    const jsonLd = parseJsonLd($, result.extractionWarnings);

    for (const record of jsonLd) {
      addMetaCandidate(
        result.titleCandidates,
        stringValue(record, "headline") ?? stringValue(record, "name"),
        0.98,
        "json-ld.headline",
      );
      addMetaCandidate(
        result.bodyCandidates,
        stringValue(record, "articleBody"),
        0.98,
        "json-ld.articleBody",
      );
      addMetaCandidate(
        result.dateCandidates,
        stringValue(record, "datePublished"),
        0.98,
        "json-ld.datePublished",
      );
      result.authorCandidates.push(
        ...namesFrom(record.author).map((name) =>
          candidate(name, 0.95, "json-ld.author"),
        ),
      );
      const publisher = nestedName(record.publisher);
      addMetaCandidate(
        result.publisherCandidates,
        publisher,
        0.95,
        "json-ld.publisher",
      );
      const documentType = schemaTypeToDocumentType(record["@type"]);
      if (documentType !== undefined) {
        result.documentTypeCandidates.push(
          candidate(documentType, 0.95, "json-ld.@type"),
        );
      }
    }

    addMetaCandidate(
      result.titleCandidates,
      getMeta($, 'meta[property="og:title"]'),
      0.9,
      "meta.og:title",
    );
    addMetaCandidate(
      result.titleCandidates,
      getMeta($, 'meta[name="citation_title"]'),
      0.88,
      "meta.citation_title",
    );
    addMetaCandidate(
      result.titleCandidates,
      getMeta($, 'meta[name="dc.title"], meta[name="DC.title"]'),
      0.86,
      "meta.dublin-core-title",
    );
    addMetaCandidate(
      result.titleCandidates,
      getText($, $("article h1").first().get(0)),
      0.84,
      "article.h1",
    );
    addMetaCandidate(
      result.titleCandidates,
      getText($, $("main h1, [role='main'] h1").first().get(0)),
      0.8,
      "main.h1",
    );
    addMetaCandidate(
      result.titleCandidates,
      getText($, $("h1").first().get(0)),
      0.7,
      "document.h1",
    );
    addMetaCandidate(
      result.titleCandidates,
      getText($, $("title").first().get(0)),
      0.55,
      "document.title",
    );

    if (result.bodyCandidates.length === 0) {
      result.bodyCandidates.push(...bodyCandidates($));
    }

    addMetaCandidate(
      result.dateCandidates,
      getMeta($, 'meta[property="article:published_time"]'),
      0.92,
      "meta.article:published_time",
    );
    addMetaCandidate(
      result.dateCandidates,
      getMeta($, 'meta[name="citation_publication_date"]'),
      0.88,
      "meta.citation_publication_date",
    );
    addMetaCandidate(
      result.dateCandidates,
      $("time[datetime]").first().attr("datetime"),
      0.75,
      "time.datetime",
    );

    addMetaCandidate(
      result.canonicalUrlCandidates,
      $('link[rel="canonical"]').first().attr("href"),
      0.98,
      "link.canonical",
    );
    addMetaCandidate(
      result.canonicalUrlCandidates,
      getMeta($, 'meta[property="og:url"]'),
      0.9,
      "meta.og:url",
    );
    addMetaCandidate(
      result.languageCandidates,
      $("html").first().attr("lang"),
      0.9,
      "html.lang",
    );
    addMetaCandidate(
      result.languageCandidates,
      input.responseMetadata?.headers["content-language"],
      0.8,
      "http.content-language",
    );
    addMetaCandidate(
      result.publisherCandidates,
      getMeta($, 'meta[property="og:site_name"]'),
      0.85,
      "meta.og:site_name",
    );
    addMetaCandidate(
      result.publisherCandidates,
      getMeta($, 'meta[name="application-name"]'),
      0.7,
      "meta.application-name",
    );

    return result;
  }
}

export class PlainTextCapability implements IngestionCapability {
  readonly id = "plain-text";
  readonly priority = 50;

  canHandle(_input: ResolvedInput, probe: ContentProbe) {
    return {
      supported: probe.detectedFormat === "plain-text",
      score: probe.detectedFormat === "plain-text" ? 80 : 0,
      reasons:
        probe.detectedFormat === "plain-text"
          ? ["detected-format:plain-text"]
          : ["requires-plain-text"],
    };
  }

  extract(input: ResolvedInput): ExtractionResult {
    const result = emptyExtraction();
    const lines = input.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines[0] !== undefined) {
      result.titleCandidates.push(
        candidate(lines[0], 0.55, "plain-text.first-line"),
      );
    }
    result.bodyCandidates.push(
      candidate(input.content, 0.8, "plain-text.full-content"),
    );
    return result;
  }
}
