import { randomUUID } from "node:crypto";
import type {
  IngestionRequest,
  IngestionResult,
  IngestionTrace,
} from "../ingestion";
import { generateFingerprint } from "../ingestion";
import { DuplicateFingerprintError, PersistenceError } from "./errors";
import type {
  DocumentObservation,
  DocumentRevision,
  IngestionJob,
  ObservationTraceSummary,
  PersistentIngestionOutcome,
  PersistentIngestionResult,
  StoredSourceDocument,
} from "./models";
import type { PersistenceRepositories, UnitOfWork } from "./ports";
import {
  normalizeUrlForIdentity,
  sanitizeUrlForLogging,
} from "./url-identity";

export interface IngestionPipelinePort {
  ingest(request: IngestionRequest): Promise<IngestionResult>;
}

export interface PersistentIngestionServiceOptions {
  now?: () => Date;
  createId?: () => string;
}

const requestedUrlOf = (request: IngestionRequest): string | undefined =>
  request.kind === "url" ? request.url : request.sourceUrl;

export const sanitizeObservedUrl = sanitizeUrlForLogging;

const warningCode = (warning: string): string => {
  const normalized = warning.toLowerCase();
  if (normalized.includes("conflict")) return "METADATA_CONFLICT";
  if (normalized.includes("content-type")) return "CONTENT_TYPE_MISMATCH";
  return "INGESTION_WARNING";
};

const traceSummary = (trace: IngestionTrace, warnings: string[]): ObservationTraceSummary => {
  const selected = trace.capabilityEvaluations.find(
    ({ capabilityId }) => capabilityId === trace.selectedCapability,
  );
  return {
    detectedFormat: trace.detectedFormat,
    selectedCapabilityId: trace.selectedCapability,
    capabilityScore: selected?.score,
    warningCodes: [...new Set(warnings.map(warningCode))],
    classificationConfidence: trace.classificationConfidence,
    fetchAttemptCount: trace.fetchAttempts.length,
    redirectCount: trace.redirects.length,
  };
};

export class PersistentIngestionService {
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(
    readonly pipeline: IngestionPipelinePort,
    readonly unitOfWork: UnitOfWork,
    options: PersistentIngestionServiceOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async ingest(request: IngestionRequest): Promise<PersistentIngestionResult> {
    const jobId = this.#createId();
    const createdAt = this.#now().toISOString();
    const job: IngestionJob = {
      id: jobId,
      status: "pending",
      inputKind: request.kind,
      requestedUrl: sanitizeObservedUrl(requestedUrlOf(request)),
      attemptCount: 0,
      createdAt,
      updatedAt: createdAt,
    };

    try {
      this.unitOfWork.repositories.jobs.create(job);
      this.unitOfWork.repositories.jobs.transition(
        jobId,
        "running",
        this.#now().toISOString(),
      );
    } catch {
      return {
        success: false,
        jobId,
        error: {
          code: "REPOSITORY_WRITE_FAILED",
          stage: "job-create",
          retryable: false,
        },
      };
    }

    const ingestion = await this.pipeline.ingest(request);
    if (!ingestion.success) {
      this.#failJob(
        jobId,
        ingestion.error.code,
        ingestion.error.retryable,
      );
      return {
        success: false,
        jobId,
        error: {
          code: ingestion.error.code,
          stage: ingestion.error.stage,
          retryable: ingestion.error.retryable,
        },
      };
    }

    try {
      return this.unitOfWork.transaction((repositories) =>
        this.#persistSuccessfulIngestion(
          repositories,
          request,
          jobId,
          ingestion,
        ),
      );
    } catch (error) {
      const persistenceError =
        error instanceof PersistenceError
          ? error
          : new PersistenceError(
              "TRANSACTION_FAILED",
              "Persistence transaction failed",
            );
      this.#failJob(jobId, persistenceError.code, persistenceError.retryable);
      return {
        success: false,
        jobId,
        error: {
          code: persistenceError.code,
          stage: "persistence",
          retryable: persistenceError.retryable,
        },
      };
    }
  }

  #persistSuccessfulIngestion(
    repositories: PersistenceRepositories,
    request: IngestionRequest,
    jobId: string,
    ingestion: Extract<IngestionResult, { success: true }>,
  ): PersistentIngestionResult {
    const canonicalUrl = normalizeUrlForIdentity(
      ingestion.document.canonicalUrl,
    );
    const fingerprint = generateFingerprint({
      canonicalUrl,
      title: ingestion.normalizedDocument.title,
      body: ingestion.normalizedDocument.body,
    });
    const existing = repositories.sourceDocuments.findByFingerprint(fingerprint);
    if (existing !== undefined) {
      return this.#completeDuplicate(
        repositories,
        request,
        jobId,
        ingestion,
        existing,
      );
    }

    const now = this.#now().toISOString();
    const latestRevision = repositories.revisions.findLatestRevision(
      canonicalUrl,
    );
    const persistedSourceDocument = {
      ...ingestion.document,
      canonicalUrl,
    };
    const stored: StoredSourceDocument = {
      storageId: this.#createId(),
      sourceDocument: persistedSourceDocument,
      fingerprint,
      canonicalUrl,
      createdAt: now,
      updatedAt: now,
    };

    try {
      repositories.sourceDocuments.save(stored);
    } catch (error) {
      if (error instanceof DuplicateFingerprintError) {
        const raced = repositories.sourceDocuments.findByFingerprint(fingerprint);
        if (raced === undefined) {
          throw new PersistenceError(
            "DUPLICATE_RACE_RECOVERY_FAILED",
            "Concurrent duplicate could not be recovered",
            true,
          );
        }
        return this.#completeDuplicate(
          repositories,
          request,
          jobId,
          ingestion,
          raced,
        );
      }
      throw error;
    }

    const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;
    const revision: DocumentRevision = {
      id: this.#createId(),
      canonicalUrl,
      documentId: stored.storageId,
      previousDocumentId: latestRevision?.documentId,
      revisionNumber,
      detectedAt: now,
    };
    repositories.revisions.save(revision);
    const outcome: PersistentIngestionOutcome =
      latestRevision === undefined ? "stored" : "revision";
    const observation = this.#createObservation(
      request,
      jobId,
      ingestion,
      stored.storageId,
      false,
    );
    repositories.observations.save(observation);
    repositories.jobs.transition(jobId, "succeeded", now, {
      documentId: stored.storageId,
      fingerprint,
      completedAt: now,
    });

    return {
      success: true,
      outcome,
      jobId,
      documentId: stored.storageId,
      fingerprint,
      revisionNumber,
      observationId: observation.id,
    };
  }

  #completeDuplicate(
    repositories: PersistenceRepositories,
    request: IngestionRequest,
    jobId: string,
    ingestion: Extract<IngestionResult, { success: true }>,
    existing: StoredSourceDocument,
  ): PersistentIngestionResult {
    const now = this.#now().toISOString();
    const observation = this.#createObservation(
      request,
      jobId,
      ingestion,
      existing.storageId,
      true,
    );
    repositories.observations.save(observation);
    repositories.jobs.transition(jobId, "duplicate", now, {
      documentId: existing.storageId,
      fingerprint: existing.fingerprint,
      completedAt: now,
    });
    const revision =
      repositories.revisions.findLatestRevision(
        existing.canonicalUrl ?? ingestion.document.canonicalUrl,
      )?.revisionNumber ?? 1;
    return {
      success: true,
      outcome: "duplicate",
      jobId,
      documentId: existing.storageId,
      fingerprint: existing.fingerprint,
      revisionNumber: revision,
      observationId: observation.id,
    };
  }

  #createObservation(
    request: IngestionRequest,
    jobId: string,
    ingestion: Extract<IngestionResult, { success: true }>,
    documentId: string,
    duplicate: boolean,
  ): DocumentObservation {
    const createdAt = this.#now().toISOString();
    return {
      id: this.#createId(),
      documentId,
      ingestionJobId: jobId,
      requestedUrl: sanitizeObservedUrl(requestedUrlOf(request)),
      finalUrl: sanitizeObservedUrl(ingestion.normalizedDocument.sourceUrl),
      retrievedAt: ingestion.normalizedDocument.retrievedAt,
      mediaType:
        request.kind === "content"
          ? request.mediaType ?? request.hints?.mediaType
          : ingestion.trace.declaredContentType,
      selectedCapabilityId:
        ingestion.trace.selectedCapability ?? "unknown-capability",
      duplicate,
      traceSummary: traceSummary(ingestion.trace, ingestion.warnings),
      createdAt,
    };
  }

  #failJob(jobId: string, errorCode: string, retryable: boolean): void {
    try {
      const now = this.#now().toISOString();
      this.unitOfWork.repositories.jobs.transition(jobId, "failed", now, {
        errorCode,
        retryable,
        completedAt: now,
      });
    } catch {
      // The result remains sanitized when failure recording is unavailable.
    }
  }
}
