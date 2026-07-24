import type { DatabaseSync } from "node:sqlite";
import { PersistenceError } from "./errors";

export const LATEST_SCHEMA_VERSION = 2;

const MIGRATION_1 = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE source_documents (
    storage_id TEXT PRIMARY KEY,
    domain_document_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    canonical_url TEXT,
    source_document_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_source_documents_canonical_url
    ON source_documents(canonical_url);

  CREATE TABLE ingestion_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (
      status IN ('pending', 'running', 'succeeded', 'duplicate', 'failed')
    ),
    input_kind TEXT NOT NULL CHECK (input_kind IN ('url', 'content')),
    requested_url TEXT,
    started_at TEXT,
    completed_at TEXT,
    attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
    document_id TEXT,
    fingerprint TEXT,
    error_code TEXT,
    retryable INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);

  CREATE TABLE document_observations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    ingestion_job_id TEXT NOT NULL,
    requested_url TEXT,
    final_url TEXT,
    retrieved_at TEXT NOT NULL,
    media_type TEXT,
    selected_capability_id TEXT NOT NULL,
    duplicate INTEGER NOT NULL CHECK (duplicate IN (0, 1)),
    trace_summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(document_id) REFERENCES source_documents(storage_id),
    FOREIGN KEY(ingestion_job_id) REFERENCES ingestion_jobs(id)
  );

  CREATE INDEX idx_document_observations_document_id
    ON document_observations(document_id);
  CREATE INDEX idx_document_observations_job_id
    ON document_observations(ingestion_job_id);

  CREATE TABLE document_revisions (
    id TEXT PRIMARY KEY,
    canonical_url TEXT NOT NULL,
    document_id TEXT NOT NULL,
    previous_document_id TEXT,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    detected_at TEXT NOT NULL,
    UNIQUE(canonical_url, revision_number),
    FOREIGN KEY(document_id) REFERENCES source_documents(storage_id),
    FOREIGN KEY(previous_document_id) REFERENCES source_documents(storage_id)
  );

  CREATE INDEX idx_document_revisions_canonical_url
    ON document_revisions(canonical_url);
`;

const MIGRATION_2 = `
  CREATE TABLE event_dossiers (
    dossier_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    current_revision_number INTEGER NOT NULL CHECK (current_revision_number > 0),
    semantic_fingerprint TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_event_dossiers_event_id ON event_dossiers(event_id);

  CREATE TABLE dossier_revisions (
    revision_id TEXT PRIMARY KEY,
    dossier_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    previous_revision_id TEXT,
    semantic_fingerprint TEXT NOT NULL,
    revision_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(dossier_id, revision_number),
    FOREIGN KEY(dossier_id) REFERENCES event_dossiers(dossier_id)
      DEFERRABLE INITIALLY DEFERRED
  );

  CREATE INDEX idx_dossier_revisions_dossier_id
    ON dossier_revisions(dossier_id, revision_number);
  CREATE INDEX idx_dossier_revisions_event_id
    ON dossier_revisions(event_id);
`;

export const getSchemaVersion = (database: DatabaseSync): number => {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const row = database
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
    .get();
  if (
    row === undefined ||
    typeof row.version !== "number" ||
    !Number.isInteger(row.version)
  ) {
    throw new PersistenceError(
      "MIGRATION_FAILED",
      "Schema version could not be read",
    );
  }
  return row.version;
};

export const runMigrations = (
  database: DatabaseSync,
  now: string,
): number => {
  const current = getSchemaVersion(database);
  if (current > LATEST_SCHEMA_VERSION) {
    throw new PersistenceError(
      "MIGRATION_FAILED",
      "Database schema is newer than this application",
    );
  }
  if (current === LATEST_SCHEMA_VERSION) {
    return current;
  }

  try {
    database.exec("BEGIN IMMEDIATE");
    if (current < 1) {
      database.exec(MIGRATION_1);
      database
        .prepare(
          "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
        )
        .run(1, now);
    }
    if (current < 2) {
      database.exec(MIGRATION_2);
      database
        .prepare(
          "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
        )
        .run(2, now);
    }
    database.exec("COMMIT");
    return LATEST_SCHEMA_VERSION;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // The original sanitized migration failure is more useful.
    }
    throw new PersistenceError(
      "MIGRATION_FAILED",
      "Database migration failed",
    );
  }
};
