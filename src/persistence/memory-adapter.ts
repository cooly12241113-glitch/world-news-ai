import {
  DocumentObservationSchema,
  DocumentRevisionSchema,
  IngestionJobSchema,
  StoredSourceDocumentSchema,
  type DocumentObservation,
  type DocumentRevision,
  type IngestionJob,
  type IngestionJobStatus,
  type StoredSourceDocument,
} from "./models";
import { DuplicateFingerprintError, PersistenceError } from "./errors";
import { assertJobTransition } from "./job-state";
import type {
  DocumentObservationRepository,
  DocumentRevisionRepository,
  IngestionJobRepository,
  JobCompletion,
  PersistenceRepositories,
  SourceDocumentRepository,
  UnitOfWork,
} from "./ports";

interface MemoryState {
  documents: Map<string, StoredSourceDocument>;
  fingerprints: Map<string, string>;
  jobs: Map<string, IngestionJob>;
  observations: Map<string, DocumentObservation>;
  revisions: Map<string, DocumentRevision>;
}

const emptyState = (): MemoryState => ({
  documents: new Map(),
  fingerprints: new Map(),
  jobs: new Map(),
  observations: new Map(),
  revisions: new Map(),
});

const copy = <T>(value: T): T => structuredClone(value);

export class InMemoryPersistenceAdapter
  implements
    UnitOfWork,
    SourceDocumentRepository,
    IngestionJobRepository,
    DocumentObservationRepository,
    DocumentRevisionRepository
{
  #state = emptyState();
  readonly repositories: PersistenceRepositories = {
    sourceDocuments: this,
    jobs: this,
    observations: this,
    revisions: this,
  };

  transaction<T>(work: (repositories: PersistenceRepositories) => T): T {
    const snapshot = copy(this.#state);
    try {
      return work(this.repositories);
    } catch (error) {
      this.#state = snapshot;
      throw error;
    }
  }

  findByFingerprint(fingerprint: string): StoredSourceDocument | undefined {
    const storageId = this.#state.fingerprints.get(fingerprint);
    return storageId === undefined ? undefined : this.findByStorageId(storageId);
  }

  findByStorageId(storageId: string): StoredSourceDocument | undefined {
    const value = this.#state.documents.get(storageId);
    return value === undefined
      ? undefined
      : StoredSourceDocumentSchema.parse(copy(value));
  }

  save(document: StoredSourceDocument): void;
  save(observation: DocumentObservation): void;
  save(revision: DocumentRevision): void;
  save(
    value: StoredSourceDocument | DocumentObservation | DocumentRevision,
  ): void {
    if ("sourceDocument" in value) {
      const document = StoredSourceDocumentSchema.parse(copy(value));
      if (this.#state.fingerprints.has(document.fingerprint)) {
        throw new DuplicateFingerprintError(document.fingerprint);
      }
      this.#state.documents.set(document.storageId, document);
      this.#state.fingerprints.set(document.fingerprint, document.storageId);
      return;
    }
    if ("traceSummary" in value) {
      const observation = DocumentObservationSchema.parse(copy(value));
      this.#state.observations.set(observation.id, observation);
      return;
    }
    const revision = DocumentRevisionSchema.parse(copy(value));
    if (
      [...this.#state.revisions.values()].some(
        (existing) =>
          existing.canonicalUrl === revision.canonicalUrl &&
          existing.revisionNumber === revision.revisionNumber,
      )
    ) {
      throw new PersistenceError(
        "REPOSITORY_WRITE_FAILED",
        "Revision number must be unique for a canonical URL",
      );
    }
    this.#state.revisions.set(revision.id, revision);
  }

  findLatestByCanonicalUrl(
    canonicalUrl: string,
  ): StoredSourceDocument | undefined {
    const latestRevision = this.#latestRevision(canonicalUrl);
    if (latestRevision !== undefined) {
      return this.findByStorageId(latestRevision.documentId);
    }
    return this.listByCanonicalUrl(canonicalUrl).at(-1);
  }

  listByCanonicalUrl(
    canonicalUrl: string,
  ): StoredSourceDocument[] {
    return [...this.#state.documents.values()]
      .filter((document) => document.canonicalUrl === canonicalUrl)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(copy);
  }

  create(job: IngestionJob): void {
    const validated = IngestionJobSchema.parse(copy(job));
    if (this.#state.jobs.has(validated.id)) {
      throw new PersistenceError(
        "REPOSITORY_WRITE_FAILED",
        "Job ID already exists",
      );
    }
    this.#state.jobs.set(validated.id, validated);
  }

  findById(id: string): IngestionJob | undefined {
    const value = this.#state.jobs.get(id);
    return value === undefined ? undefined : IngestionJobSchema.parse(copy(value));
  }

  transition(
    id: string,
    status: IngestionJobStatus,
    updatedAt: string,
    completion: JobCompletion = {},
  ): IngestionJob {
    const job = this.#state.jobs.get(id);
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
    this.#state.jobs.set(id, updated);
    return copy(updated);
  }

  findByDocumentId(documentId: string): DocumentObservation[] {
    return [...this.#state.observations.values()]
      .filter((observation) => observation.documentId === documentId)
      .map(copy);
  }

  findByJobId(jobId: string): DocumentObservation[] {
    return [...this.#state.observations.values()]
      .filter((observation) => observation.ingestionJobId === jobId)
      .map(copy);
  }

  findLatestRevision(canonicalUrl: string): DocumentRevision | undefined {
    return this.#latestRevision(canonicalUrl);
  }

  listRevisionHistory(canonicalUrl: string): DocumentRevision[] {
    return [...this.#state.revisions.values()]
      .filter((revision) => revision.canonicalUrl === canonicalUrl)
      .sort((left, right) => left.revisionNumber - right.revisionNumber)
      .map(copy);
  }

  #latestRevision(canonicalUrl: string): DocumentRevision | undefined {
    return (
      [...this.#state.revisions.values()]
        .filter((revision) => revision.canonicalUrl === canonicalUrl)
        .sort((left, right) => right.revisionNumber - left.revisionNumber)
        .map(copy)[0]
    );
  }
}
