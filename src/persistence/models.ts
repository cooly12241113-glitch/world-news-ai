import * as z from "zod";
import type { SourceDocument } from "../domain";
import {
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  SourceDocumentSchema,
  URLStringSchema,
} from "../validation";
import type {
  DetectedFormat,
  IngestionErrorCode,
  IngestionRequest,
} from "../ingestion";

export type IngestionJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "duplicate"
  | "failed";

export interface StoredSourceDocument {
  storageId: string;
  sourceDocument: SourceDocument;
  fingerprint: string;
  canonicalUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionJob {
  id: string;
  status: IngestionJobStatus;
  inputKind: IngestionRequest["kind"];
  requestedUrl?: string;
  startedAt?: string;
  completedAt?: string;
  attemptCount: number;
  documentId?: string;
  fingerprint?: string;
  errorCode?: string;
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ObservationTraceSummary {
  detectedFormat?: DetectedFormat;
  selectedCapabilityId?: string;
  capabilityScore?: number;
  warningCodes: string[];
  classificationConfidence?: number;
  fetchAttemptCount: number;
  redirectCount: number;
}

export interface DocumentObservation {
  id: string;
  documentId: string;
  ingestionJobId: string;
  requestedUrl?: string;
  finalUrl?: string;
  retrievedAt: string;
  mediaType?: string;
  selectedCapabilityId: string;
  duplicate: boolean;
  traceSummary: ObservationTraceSummary;
  createdAt: string;
}

export interface DocumentRevision {
  id: string;
  canonicalUrl: string;
  documentId: string;
  previousDocumentId?: string;
  revisionNumber: number;
  detectedAt: string;
}

export type PersistentIngestionOutcome = "stored" | "duplicate" | "revision";

export type PersistentIngestionResult =
  | {
      success: true;
      outcome: PersistentIngestionOutcome;
      jobId: string;
      documentId: string;
      fingerprint: string;
      revisionNumber: number;
      observationId: string;
    }
  | {
      success: false;
      jobId: string;
      error: {
        code: IngestionErrorCode | PersistenceErrorCode;
        stage: string;
        retryable: boolean;
      };
    };

export type PersistenceErrorCode =
  | "REPOSITORY_READ_FAILED"
  | "REPOSITORY_WRITE_FAILED"
  | "TRANSACTION_FAILED"
  | "PERSISTED_SCHEMA_INVALID"
  | "INVALID_JOB_TRANSITION"
  | "MIGRATION_FAILED"
  | "DUPLICATE_RACE_RECOVERY_FAILED";

export const IngestionJobStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "duplicate",
  "failed",
]);

export const StoredSourceDocumentSchema: z.ZodType<StoredSourceDocument> =
  z.strictObject({
    storageId: IdSchema,
    sourceDocument: SourceDocumentSchema,
    fingerprint: NonEmptyStringSchema,
    canonicalUrl: URLStringSchema.optional(),
    createdAt: ISODateStringSchema,
    updatedAt: ISODateStringSchema,
  });

export const IngestionJobSchema: z.ZodType<IngestionJob> = z.strictObject({
  id: IdSchema,
  status: IngestionJobStatusSchema,
  inputKind: z.enum(["url", "content"]),
  requestedUrl: URLStringSchema.optional(),
  startedAt: ISODateStringSchema.optional(),
  completedAt: ISODateStringSchema.optional(),
  attemptCount: z.number().int().nonnegative(),
  documentId: IdSchema.optional(),
  fingerprint: NonEmptyStringSchema.optional(),
  errorCode: NonEmptyStringSchema.optional(),
  retryable: z.boolean().optional(),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

export const ObservationTraceSummarySchema: z.ZodType<ObservationTraceSummary> =
  z.strictObject({
    detectedFormat: z
      .enum(["html", "json", "xml", "rss", "atom", "plain-text", "unknown"])
      .optional(),
    selectedCapabilityId: NonEmptyStringSchema.optional(),
    capabilityScore: z.number().finite().optional(),
    warningCodes: z.array(NonEmptyStringSchema),
    classificationConfidence: z.number().min(0).max(1).optional(),
    fetchAttemptCount: z.number().int().nonnegative(),
    redirectCount: z.number().int().nonnegative(),
  });

export const DocumentObservationSchema: z.ZodType<DocumentObservation> =
  z.strictObject({
    id: IdSchema,
    documentId: IdSchema,
    ingestionJobId: IdSchema,
    requestedUrl: URLStringSchema.optional(),
    finalUrl: URLStringSchema.optional(),
    retrievedAt: ISODateStringSchema,
    mediaType: NonEmptyStringSchema.optional(),
    selectedCapabilityId: NonEmptyStringSchema,
    duplicate: z.boolean(),
    traceSummary: ObservationTraceSummarySchema,
    createdAt: ISODateStringSchema,
  });

export const DocumentRevisionSchema: z.ZodType<DocumentRevision> =
  z.strictObject({
    id: IdSchema,
    canonicalUrl: URLStringSchema,
    documentId: IdSchema,
    previousDocumentId: IdSchema.optional(),
    revisionNumber: z.number().int().positive(),
    detectedAt: ISODateStringSchema,
  });
