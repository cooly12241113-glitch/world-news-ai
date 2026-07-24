import type {
  DocumentObservation,
  DocumentRevision,
  IngestionJob,
  StoredSourceDocument,
} from "../index";

export const storedDocumentFixture: StoredSourceDocument = {
  storageId: "storage-1",
  sourceDocument: {
    id: "document-1",
    sourceId: "source-1",
    documentType: "ResearchReport",
    canonicalUrl: "https://example.com/report",
    title: "Research report",
    languageCode: "en",
    retrievedAt: "2026-07-24T00:00:00.000Z",
    authorNames: [],
    contentText: "A sufficiently detailed research report body.",
    entityIds: [],
    topicIds: [],
    eventIds: [],
  },
  fingerprint: "fingerprint-1",
  canonicalUrl: "https://example.com/report",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

export const jobFixture: IngestionJob = {
  id: "job-1",
  status: "pending",
  inputKind: "url",
  requestedUrl: "https://example.com/report",
  attemptCount: 0,
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
};

export const revisionFixture: DocumentRevision = {
  id: "revision-1",
  canonicalUrl: "https://example.com/report",
  documentId: "storage-1",
  revisionNumber: 1,
  detectedAt: "2026-07-24T00:00:01.000Z",
};

export const observationFixture: DocumentObservation = {
  id: "observation-1",
  documentId: "storage-1",
  ingestionJobId: "job-1",
  requestedUrl: "https://example.com/report",
  finalUrl: "https://example.com/report",
  retrievedAt: "2026-07-24T00:00:00.000Z",
  mediaType: "text/html",
  selectedCapabilityId: "generic-html",
  duplicate: false,
  traceSummary: {
    detectedFormat: "html",
    selectedCapabilityId: "generic-html",
    capabilityScore: 100,
    warningCodes: [],
    classificationConfidence: 0.95,
    fetchAttemptCount: 1,
    redirectCount: 0,
  },
  createdAt: "2026-07-24T00:00:02.000Z",
};
