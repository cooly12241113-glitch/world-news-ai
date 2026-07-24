import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import * as z from "zod";
import {
  DocumentObservationSchema,
  DocumentRevisionSchema,
  IngestionJobSchema,
  ObservationTraceSummarySchema,
  StoredSourceDocumentSchema,
  type DocumentObservation,
  type DocumentRevision,
  type IngestionJob,
  type IngestionJobStatus,
  type StoredSourceDocument,
} from "./models";
import { DuplicateFingerprintError, PersistenceError } from "./errors";
import { assertJobTransition } from "./job-state";
import { getSchemaVersion, runMigrations } from "./migrations";
import type {
  DocumentObservationRepository,
  DocumentRevisionRepository,
  IngestionJobRepository,
  JobCompletion,
  PersistenceRepositories,
  SourceDocumentRepository,
  UnitOfWork,
} from "./ports";

const StoredRowSchema = z.object({
  storage_id: z.string(),
  fingerprint: z.string(),
  canonical_url: z.string().nullable(),
  source_document_json: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const JobRowSchema = z.object({
  id: z.string(),
  status: z.string(),
  input_kind: z.string(),
  requested_url: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  attempt_count: z.number(),
  document_id: z.string().nullable(),
  fingerprint: z.string().nullable(),
  error_code: z.string().nullable(),
  retryable: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ObservationRowSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  ingestion_job_id: z.string(),
  requested_url: z.string().nullable(),
  final_url: z.string().nullable(),
  retrieved_at: z.string(),
  media_type: z.string().nullable(),
  selected_capability_id: z.string(),
  duplicate: z.number(),
  trace_summary_json: z.string(),
  created_at: z.string(),
});

const RevisionRowSchema = z.object({
  id: z.string(),
  canonical_url: z.string(),
  document_id: z.string(),
  previous_document_id: z.string().nullable(),
  revision_number: z.number(),
  detected_at: z.string(),
});

const omitNull = <T>(value: T | null): T | undefined =>
  value === null ? undefined : value;

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    throw new PersistenceError(
      "PERSISTED_SCHEMA_INVALID",
      "Persisted JSON is not valid",
    );
  }
};

const storedFromRow = (
  raw: Record<string, SQLOutputValue>,
): StoredSourceDocument => {
  try {
    const row = StoredRowSchema.parse(raw);
    return StoredSourceDocumentSchema.parse({
      storageId: row.storage_id,
      sourceDocument: parseJson(row.source_document_json),
      fingerprint: row.fingerprint,
      canonicalUrl: omitNull(row.canonical_url),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    if (error instanceof PersistenceError) {
      throw error;
    }
    throw new PersistenceError(
      "PERSISTED_SCHEMA_INVALID",
      "Persisted SourceDocument failed runtime validation",
    );
  }
};

const jobFromRow = (raw: Record<string, SQLOutputValue>): IngestionJob => {
  const row = JobRowSchema.parse(raw);
  return IngestionJobSchema.parse({
    id: row.id,
    status: row.status,
    inputKind: row.input_kind,
    requestedUrl: omitNull(row.requested_url),
    startedAt: omitNull(row.started_at),
    completedAt: omitNull(row.completed_at),
    attemptCount: row.attempt_count,
    documentId: omitNull(row.document_id),
    fingerprint: omitNull(row.fingerprint),
    errorCode: omitNull(row.error_code),
    retryable: row.retryable === null ? undefined : row.retryable === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
};

const observationFromRow = (
  raw: Record<string, SQLOutputValue>,
): DocumentObservation => {
  const row = ObservationRowSchema.parse(raw);
  return DocumentObservationSchema.parse({
    id: row.id,
    documentId: row.document_id,
    ingestionJobId: row.ingestion_job_id,
    requestedUrl: omitNull(row.requested_url),
    finalUrl: omitNull(row.final_url),
    retrievedAt: row.retrieved_at,
    mediaType: omitNull(row.media_type),
    selectedCapabilityId: row.selected_capability_id,
    duplicate: row.duplicate === 1,
    traceSummary: ObservationTraceSummarySchema.parse(
      parseJson(row.trace_summary_json),
    ),
    createdAt: row.created_at,
  });
};

const revisionFromRow = (
  raw: Record<string, SQLOutputValue>,
): DocumentRevision => {
  const row = RevisionRowSchema.parse(raw);
  return DocumentRevisionSchema.parse({
    id: row.id,
    canonicalUrl: row.canonical_url,
    documentId: row.document_id,
    previousDocumentId: omitNull(row.previous_document_id),
    revisionNumber: row.revision_number,
    detectedAt: row.detected_at,
  });
};

export class SqlitePersistenceAdapter
  implements
    UnitOfWork,
    SourceDocumentRepository,
    IngestionJobRepository,
    DocumentObservationRepository,
    DocumentRevisionRepository
{
  readonly #database: DatabaseSync;
  readonly repositories: PersistenceRepositories = {
    sourceDocuments: this,
    jobs: this,
    observations: this,
    revisions: this,
  };

  constructor(path: string, now = new Date().toISOString()) {
    this.#database = new DatabaseSync(path);
    try {
      this.#database.exec("PRAGMA foreign_keys = ON");
      this.#database.exec("PRAGMA busy_timeout = 5000");
      runMigrations(this.#database, now);
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }

  get schemaVersion(): number {
    return getSchemaVersion(this.#database);
  }

  transaction<T>(work: (repositories: PersistenceRepositories) => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = work(this.repositories);
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  findByFingerprint(fingerprint: string): StoredSourceDocument | undefined {
    const row = this.#database
      .prepare("SELECT * FROM source_documents WHERE fingerprint = ?")
      .get(fingerprint);
    return row === undefined ? undefined : storedFromRow(row);
  }

  findByStorageId(storageId: string): StoredSourceDocument | undefined {
    const row = this.#database
      .prepare("SELECT * FROM source_documents WHERE storage_id = ?")
      .get(storageId);
    return row === undefined ? undefined : storedFromRow(row);
  }

  save(document: StoredSourceDocument): void;
  save(observation: DocumentObservation): void;
  save(revision: DocumentRevision): void;
  save(
    value: StoredSourceDocument | DocumentObservation | DocumentRevision,
  ): void {
    if ("sourceDocument" in value) {
      const document = StoredSourceDocumentSchema.parse(value);
      try {
        this.#database
          .prepare(
            `INSERT INTO source_documents(
              storage_id, domain_document_id, fingerprint, canonical_url,
              source_document_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            document.storageId,
            document.sourceDocument.id,
            document.fingerprint,
            document.canonicalUrl ?? null,
            JSON.stringify(document.sourceDocument),
            document.createdAt,
            document.updatedAt,
          );
      } catch {
        if (this.findByFingerprint(document.fingerprint) !== undefined) {
          throw new DuplicateFingerprintError(document.fingerprint);
        }
        throw new PersistenceError(
          "REPOSITORY_WRITE_FAILED",
          "Source document could not be stored",
        );
      }
      return;
    }
    if ("traceSummary" in value) {
      const observation = DocumentObservationSchema.parse(value);
      this.#database
        .prepare(
          `INSERT INTO document_observations(
            id, document_id, ingestion_job_id, requested_url, final_url,
            retrieved_at, media_type, selected_capability_id, duplicate,
            trace_summary_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          observation.id,
          observation.documentId,
          observation.ingestionJobId,
          observation.requestedUrl ?? null,
          observation.finalUrl ?? null,
          observation.retrievedAt,
          observation.mediaType ?? null,
          observation.selectedCapabilityId,
          observation.duplicate ? 1 : 0,
          JSON.stringify(observation.traceSummary),
          observation.createdAt,
        );
      return;
    }
    const revision = DocumentRevisionSchema.parse(value);
    this.#database
      .prepare(
        `INSERT INTO document_revisions(
          id, canonical_url, document_id, previous_document_id,
          revision_number, detected_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        revision.id,
        revision.canonicalUrl,
        revision.documentId,
        revision.previousDocumentId ?? null,
        revision.revisionNumber,
        revision.detectedAt,
      );
  }

  findLatestByCanonicalUrl(
    canonicalUrl: string,
  ): StoredSourceDocument | undefined {
    const row = this.#database
      .prepare(
        `SELECT sd.* FROM source_documents sd
         JOIN document_revisions dr ON dr.document_id = sd.storage_id
         WHERE dr.canonical_url = ?
         ORDER BY dr.revision_number DESC LIMIT 1`,
      )
      .get(canonicalUrl);
    return row === undefined ? undefined : storedFromRow(row);
  }

  listByCanonicalUrl(canonicalUrl: string): StoredSourceDocument[] {
    return this.#database
      .prepare(
        `SELECT sd.* FROM source_documents sd
         JOIN document_revisions dr ON dr.document_id = sd.storage_id
         WHERE dr.canonical_url = ?
         ORDER BY dr.revision_number`,
      )
      .all(canonicalUrl)
      .map(storedFromRow);
  }

  create(job: IngestionJob): void {
    const value = IngestionJobSchema.parse(job);
    this.#database
      .prepare(
        `INSERT INTO ingestion_jobs(
          id, status, input_kind, requested_url, started_at, completed_at,
          attempt_count, document_id, fingerprint, error_code, retryable,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.id,
        value.status,
        value.inputKind,
        value.requestedUrl ?? null,
        value.startedAt ?? null,
        value.completedAt ?? null,
        value.attemptCount,
        value.documentId ?? null,
        value.fingerprint ?? null,
        value.errorCode ?? null,
        value.retryable === undefined ? null : value.retryable ? 1 : 0,
        value.createdAt,
        value.updatedAt,
      );
  }

  findById(id: string): IngestionJob | undefined {
    const row = this.#database
      .prepare("SELECT * FROM ingestion_jobs WHERE id = ?")
      .get(id);
    return row === undefined ? undefined : jobFromRow(row);
  }

  transition(
    id: string,
    status: IngestionJobStatus,
    updatedAt: string,
    completion: JobCompletion = {},
  ): IngestionJob {
    const job = this.findById(id);
    if (job === undefined) {
      throw new PersistenceError("REPOSITORY_READ_FAILED", "Job not found");
    }
    assertJobTransition(job.status, status);
    const updated = IngestionJobSchema.parse({
      ...job,
      ...completion,
      status,
      attemptCount: status === "running" ? job.attemptCount + 1 : job.attemptCount,
      startedAt: status === "running" ? updatedAt : job.startedAt,
      completedAt:
        status === "succeeded" || status === "duplicate" || status === "failed"
          ? completion.completedAt ?? updatedAt
          : job.completedAt,
      updatedAt,
    });
    this.#database
      .prepare(
        `UPDATE ingestion_jobs SET
          status = ?, started_at = ?, completed_at = ?, attempt_count = ?,
          document_id = ?, fingerprint = ?, error_code = ?, retryable = ?,
          updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.status,
        updated.startedAt ?? null,
        updated.completedAt ?? null,
        updated.attemptCount,
        updated.documentId ?? null,
        updated.fingerprint ?? null,
        updated.errorCode ?? null,
        updated.retryable === undefined ? null : updated.retryable ? 1 : 0,
        updated.updatedAt,
        updated.id,
      );
    return updated;
  }

  findByDocumentId(documentId: string): DocumentObservation[] {
    return this.#database
      .prepare(
        "SELECT * FROM document_observations WHERE document_id = ? ORDER BY created_at",
      )
      .all(documentId)
      .map(observationFromRow);
  }

  findByJobId(jobId: string): DocumentObservation[] {
    return this.#database
      .prepare(
        "SELECT * FROM document_observations WHERE ingestion_job_id = ? ORDER BY created_at",
      )
      .all(jobId)
      .map(observationFromRow);
  }

  findLatestRevision(canonicalUrl: string): DocumentRevision | undefined {
    const row = this.#database
      .prepare(
        "SELECT * FROM document_revisions WHERE canonical_url = ? ORDER BY revision_number DESC LIMIT 1",
      )
      .get(canonicalUrl);
    return row === undefined ? undefined : revisionFromRow(row);
  }

  listRevisionHistory(canonicalUrl: string): DocumentRevision[] {
    return this.#database
      .prepare(
        "SELECT * FROM document_revisions WHERE canonical_url = ? ORDER BY revision_number",
      )
      .all(canonicalUrl)
      .map(revisionFromRow);
  }
}
