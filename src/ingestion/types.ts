import type {
  DocumentType,
  ISODateString,
  SourceDocument,
  URLString,
} from "../domain";

export interface IngestionHints {
  expectedLanguage?: string;
  expectedDocumentType?: DocumentType;
  sourceName?: string;
  publishedAt?: ISODateString;
  title?: string;
  mediaType?: string;
}

export type IngestionRequest =
  | {
      kind: "url";
      url: string;
      retrievedAt?: ISODateString;
      hints?: IngestionHints;
    }
  | {
      kind: "content";
      content: string;
      mediaType?: string;
      sourceUrl?: string;
      retrievedAt?: ISODateString;
      hints?: IngestionHints;
    };

export interface ResponseMetadata {
  status: number;
  headers: Readonly<Record<string, string>>;
  redirectCount: number;
}

export interface ResolvedInput {
  originalInput: IngestionRequest;
  requestedUrl?: URLString;
  finalUrl?: URLString;
  mediaType?: string;
  charset?: string;
  content: string;
  byteLength: number;
  retrievedAt: ISODateString;
  responseMetadata?: ResponseMetadata;
  warnings: string[];
}

export type DetectedFormat =
  | "html"
  | "json"
  | "xml"
  | "rss"
  | "atom"
  | "plain-text"
  | "unknown";

export interface HandlerCandidate {
  capabilityId: string;
  score: number;
  reasons: string[];
}

export interface ContentProbe {
  detectedMediaType?: string;
  detectedFormat: DetectedFormat;
  declaredMediaType?: string;
  formatConfidence: number;
  structuralSignals: string[];
  isTextual: boolean;
  handlerCandidates: HandlerCandidate[];
}

export interface ExtractionCandidate<T> {
  value: T;
  confidence: number;
  evidence: string;
  sourceLocation?: string;
}

export interface ExtractionTraceEntry {
  field: string;
  selectedEvidence?: string;
  candidateCount: number;
}

export interface ExtractionResult {
  titleCandidates: ExtractionCandidate<string>[];
  bodyCandidates: ExtractionCandidate<string>[];
  dateCandidates: ExtractionCandidate<string>[];
  canonicalUrlCandidates: ExtractionCandidate<string>[];
  languageCandidates: ExtractionCandidate<string>[];
  authorCandidates: ExtractionCandidate<string>[];
  publisherCandidates: ExtractionCandidate<string>[];
  documentTypeCandidates: ExtractionCandidate<DocumentType>[];
  extractionWarnings: string[];
  extractionTrace: ExtractionTraceEntry[];
}

export interface NormalizedDocument {
  title: string;
  body: string;
  canonicalUrl: URLString;
  sourceUrl?: URLString;
  sourceName: string;
  publishedAt?: ISODateString;
  retrievedAt: ISODateString;
  language: string;
  documentTypeCandidate: DocumentType;
  documentTypeConfidence: number;
  classificationReasons: string[];
  authors: string[];
  fingerprint: string;
  warnings: string[];
  extractionTrace: ExtractionTraceEntry[];
}

export interface CapabilityMatch {
  supported: boolean;
  score: number;
  reasons: string[];
}

export interface IngestionCapability {
  readonly id: string;
  readonly priority: number;
  canHandle(input: ResolvedInput, probe: ContentProbe): CapabilityMatch;
  extract(input: ResolvedInput, probe: ContentProbe): ExtractionResult;
}

export interface CapabilitySelection {
  capability: IngestionCapability;
  evaluations: HandlerCandidate[];
  selectedReasons: string[];
}

export interface FetchAttemptTrace {
  url: string;
  attempt: number;
  status?: number;
  errorCode?: string;
}

export interface RedirectTrace {
  from: string;
  to: string;
  status: number;
}

export interface IngestionTrace {
  inputKind: IngestionRequest["kind"];
  fetchAttempts: FetchAttemptTrace[];
  redirects: RedirectTrace[];
  declaredContentType?: string;
  detectedFormat?: DetectedFormat;
  capabilityEvaluations: HandlerCandidate[];
  selectedCapability?: string;
  selectedCapabilityReasons: string[];
  metadataSelections: ExtractionTraceEntry[];
  normalizationWarnings: string[];
  classificationConfidence?: number;
  validationSucceeded: boolean;
  fingerprintGenerated: boolean;
  completedStages: string[];
}

export type IngestionErrorCode =
  | "INVALID_INPUT"
  | "INVALID_URL"
  | "UNSAFE_URL"
  | "FETCH_FAILED"
  | "FETCH_TIMEOUT"
  | "HTTP_STATUS_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UNSUPPORTED_FORMAT"
  | "NO_CAPABILITY_MATCH"
  | "PARSE_FAILED"
  | "TITLE_NOT_FOUND"
  | "EMPTY_CONTENT"
  | "DATE_PARSE_FAILED"
  | "CLASSIFICATION_UNCERTAIN"
  | "VALIDATION_FAILED"
  | "MAPPING_FAILED";

export type IngestionStage =
  | "input"
  | "resolve"
  | "probe"
  | "select"
  | "extract"
  | "normalize"
  | "classify"
  | "validate"
  | "fingerprint"
  | "map";

export interface IngestionErrorDetails {
  code: IngestionErrorCode;
  message: string;
  stage: IngestionStage;
  retryable: boolean;
  cause?: string;
  context?: Readonly<Record<string, string | number | boolean>>;
}

export type IngestionResult =
  | {
      success: true;
      document: SourceDocument;
      normalizedDocument: NormalizedDocument;
      trace: IngestionTrace;
      warnings: string[];
    }
  | {
      success: false;
      error: IngestionErrorDetails;
      trace: IngestionTrace;
      warnings: string[];
    };
