import type { DocumentType } from "../domain";
import { IngestionError } from "./error";
import { generateFingerprint } from "./fingerprint";
import type {
  ExtractionCandidate,
  ExtractionResult,
  IngestionHints,
  NormalizedDocument,
  ResolvedInput,
} from "./types";
import { normalizeCanonicalUrl } from "./url-policy";

export interface NormalizationOptions {
  minimumBodyLength?: number;
  classificationThreshold?: number;
}

const DEFAULT_MINIMUM_BODY_LENGTH = 20;
const DEFAULT_CLASSIFICATION_THRESHOLD = 0.7;

const decodeHtmlEntities = (value: string): string =>
  value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, code: string) => {
      const normalized = code.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      const numeric =
        normalized.startsWith("#x")
          ? Number.parseInt(normalized.slice(2), 16)
          : Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
    },
  );

export const normalizeText = (value: string): string =>
  decodeHtmlEntities(value)
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const selectCandidate = <T>(
  candidates: readonly ExtractionCandidate<T>[],
): ExtractionCandidate<T> | undefined =>
  [...candidates].sort(
    (left, right) =>
      right.confidence - left.confidence ||
      Number(left.evidence === "caller-hint") -
        Number(right.evidence === "caller-hint") ||
      left.evidence.localeCompare(right.evidence),
  )[0];

const addHint = <T>(
  candidates: ExtractionCandidate<T>[],
  value: T | undefined,
  evidence: string,
): void => {
  if (value !== undefined) {
    candidates.push({
      value,
      confidence: 0.9,
      evidence,
      sourceLocation: "caller-hint",
    });
  }
};

const addConflictWarning = <T>(
  warnings: string[],
  field: string,
  hint: T | undefined,
  selected: ExtractionCandidate<T> | undefined,
): void => {
  if (
    hint !== undefined &&
    selected !== undefined &&
    selected.evidence !== "caller-hint" &&
    selected.value !== hint
  ) {
    warnings.push(`${field} hint conflicts with extracted metadata`);
  }
};

const normalizeDate = (value: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new IngestionError(
      "DATE_PARSE_FAILED",
      "Published date could not be parsed",
      "normalize",
    );
  }
  return new Date(timestamp).toISOString();
};

const fallbackSourceName = (url: string): string => {
  const hostname = new URL(url).hostname;
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
};

const classify = (
  result: ExtractionResult,
  hints: IngestionHints | undefined,
  threshold: number,
  warnings: string[],
): {
  documentType: DocumentType;
  confidence: number;
  reasons: string[];
} => {
  addHint(
    result.documentTypeCandidates,
    hints?.expectedDocumentType,
    "caller-hint",
  );
  const selected = selectCandidate(result.documentTypeCandidates);
  addConflictWarning(
    warnings,
    "document type",
    hints?.expectedDocumentType,
    selected,
  );
  if (selected === undefined || selected.confidence < threshold) {
    throw new IngestionError(
      "CLASSIFICATION_UNCERTAIN",
      "Document type confidence is below the configured threshold",
      "classify",
      {
        context: {
          threshold,
          confidence: selected?.confidence ?? 0,
        },
      },
    );
  }
  return {
    documentType: selected.value,
    confidence: selected.confidence,
    reasons: result.documentTypeCandidates.map(
      ({ evidence, confidence }) => `${evidence}:${confidence}`,
    ),
  };
};

export const normalizeExtraction = (
  input: ResolvedInput,
  extraction: ExtractionResult,
  options: NormalizationOptions = {},
): NormalizedDocument => {
  const warnings = [...input.warnings, ...extraction.extractionWarnings];
  const hints = input.originalInput.hints;

  addHint(extraction.titleCandidates, hints?.title, "caller-hint");
  addHint(extraction.dateCandidates, hints?.publishedAt, "caller-hint");
  addHint(
    extraction.languageCandidates,
    hints?.expectedLanguage,
    "caller-hint",
  );
  addHint(extraction.publisherCandidates, hints?.sourceName, "caller-hint");

  const selectedTitle = selectCandidate(extraction.titleCandidates);
  const selectedBody = selectCandidate(extraction.bodyCandidates);
  const selectedDate = selectCandidate(extraction.dateCandidates);
  const selectedCanonical = selectCandidate(extraction.canonicalUrlCandidates);
  const selectedLanguage = selectCandidate(extraction.languageCandidates);
  const selectedPublisher = selectCandidate(extraction.publisherCandidates);

  if (selectedTitle === undefined || normalizeText(selectedTitle.value) === "") {
    throw new IngestionError(
      "TITLE_NOT_FOUND",
      "No non-empty title candidate was found",
      "normalize",
    );
  }
  if (selectedBody === undefined) {
    throw new IngestionError(
      "EMPTY_CONTENT",
      "No body candidate was found",
      "normalize",
    );
  }

  const title = normalizeText(selectedTitle.value);
  const body = normalizeText(selectedBody.value);
  const minimumBodyLength =
    options.minimumBodyLength ?? DEFAULT_MINIMUM_BODY_LENGTH;
  if (body.length < minimumBodyLength) {
    throw new IngestionError(
      "EMPTY_CONTENT",
      "Normalized body is below the configured minimum length",
      "normalize",
      { context: { minimumBodyLength, bodyLength: body.length } },
    );
  }

  const baseUrl = input.finalUrl ?? input.requestedUrl;
  const canonicalCandidate =
    selectedCanonical?.value ?? input.finalUrl ?? input.requestedUrl;
  if (canonicalCandidate === undefined) {
    throw new IngestionError(
      "MAPPING_FAILED",
      "A canonical or source URL is required",
      "normalize",
    );
  }
  let canonicalUrl: string;
  try {
    canonicalUrl = normalizeCanonicalUrl(canonicalCandidate, baseUrl);
  } catch (cause) {
    throw new IngestionError(
      "INVALID_URL",
      "Canonical URL is invalid",
      "normalize",
      { cause },
    );
  }

  addConflictWarning(warnings, "title", hints?.title, selectedTitle);
  addConflictWarning(warnings, "published date", hints?.publishedAt, selectedDate);
  addConflictWarning(
    warnings,
    "language",
    hints?.expectedLanguage,
    selectedLanguage,
  );
  addConflictWarning(
    warnings,
    "source name",
    hints?.sourceName,
    selectedPublisher,
  );

  if (selectedLanguage === undefined) {
    throw new IngestionError(
      "MAPPING_FAILED",
      "Document language could not be determined",
      "normalize",
    );
  }
  const classification = classify(
    extraction,
    hints,
    options.classificationThreshold ?? DEFAULT_CLASSIFICATION_THRESHOLD,
    warnings,
  );
  const sourceName =
    selectedPublisher?.value ?? fallbackSourceName(canonicalUrl);
  const authors = [
    ...new Set(extraction.authorCandidates.map(({ value }) => normalizeText(value))),
  ].filter(Boolean);
  const fingerprint = generateFingerprint({ canonicalUrl, title, body });

  return {
    title,
    body,
    canonicalUrl,
    sourceUrl: input.finalUrl ?? input.requestedUrl,
    sourceName: normalizeText(sourceName),
    publishedAt:
      selectedDate === undefined ? undefined : normalizeDate(selectedDate.value),
    retrievedAt: input.retrievedAt,
    language: selectedLanguage.value,
    documentTypeCandidate: classification.documentType,
    documentTypeConfidence: classification.confidence,
    classificationReasons: classification.reasons,
    authors,
    fingerprint,
    warnings,
    extractionTrace: [
      {
        field: "title",
        selectedEvidence: selectedTitle.evidence,
        candidateCount: extraction.titleCandidates.length,
      },
      {
        field: "body",
        selectedEvidence: selectedBody.evidence,
        candidateCount: extraction.bodyCandidates.length,
      },
      {
        field: "canonicalUrl",
        selectedEvidence: selectedCanonical?.evidence ?? "resolved-input-url",
        candidateCount: extraction.canonicalUrlCandidates.length,
      },
      {
        field: "language",
        selectedEvidence: selectedLanguage.evidence,
        candidateCount: extraction.languageCandidates.length,
      },
      {
        field: "documentType",
        selectedEvidence: selectCandidate(extraction.documentTypeCandidates)?.evidence,
        candidateCount: extraction.documentTypeCandidates.length,
      },
    ],
  };
};
