import type {
  DocumentObservation,
  DocumentRevision,
  IngestionJob,
  IngestionJobStatus,
  StoredSourceDocument,
} from "./models";

export interface SourceDocumentRepository {
  findByFingerprint(fingerprint: string): StoredSourceDocument | undefined;
  findByStorageId(storageId: string): StoredSourceDocument | undefined;
  save(document: StoredSourceDocument): void;
  findLatestByCanonicalUrl(canonicalUrl: string): StoredSourceDocument | undefined;
  listByCanonicalUrl(canonicalUrl: string): StoredSourceDocument[];
}

export interface JobCompletion {
  documentId?: string;
  fingerprint?: string;
  errorCode?: string;
  retryable?: boolean;
  completedAt?: string;
}

export interface IngestionJobRepository {
  create(job: IngestionJob): void;
  findById(id: string): IngestionJob | undefined;
  transition(
    id: string,
    status: IngestionJobStatus,
    updatedAt: string,
    completion?: JobCompletion,
  ): IngestionJob;
}

export interface DocumentObservationRepository {
  save(observation: DocumentObservation): void;
  findByDocumentId(documentId: string): DocumentObservation[];
  findByJobId(jobId: string): DocumentObservation[];
}

export interface DocumentRevisionRepository {
  save(revision: DocumentRevision): void;
  findLatestRevision(canonicalUrl: string): DocumentRevision | undefined;
  listRevisionHistory(canonicalUrl: string): DocumentRevision[];
}

export interface PersistenceRepositories {
  sourceDocuments: SourceDocumentRepository;
  jobs: IngestionJobRepository;
  observations: DocumentObservationRepository;
  revisions: DocumentRevisionRepository;
}

export interface UnitOfWork {
  readonly repositories: PersistenceRepositories;
  transaction<T>(work: (repositories: PersistenceRepositories) => T): T;
}
