import type { DatabaseSync } from "node:sqlite";
import { PersistenceError } from "./errors";

export const LATEST_SCHEMA_VERSION = 3;

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

const MIGRATION_3 = `
  CREATE TABLE raw_artifact_blobs (
    content_hash TEXT PRIMARY KEY,
    byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
    body BLOB NOT NULL
  );
  CREATE TABLE raw_artifacts (
    artifact_id TEXT PRIMARY KEY,
    source_identity TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    content_kind TEXT NOT NULL,
    media_type TEXT NOT NULL,
    governance_record_id TEXT NOT NULL UNIQUE,
    policy_id TEXT NOT NULL,
    policy_fingerprint TEXT NOT NULL,
    redaction_posture TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    legal_hold_authority_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('active', 'deleted')),
    FOREIGN KEY(content_hash) REFERENCES raw_artifact_blobs(content_hash)
  );
  CREATE INDEX idx_raw_artifacts_content_hash ON raw_artifacts(content_hash);
  CREATE INDEX idx_raw_artifacts_expiry ON raw_artifacts(status, expires_at);
  CREATE TABLE raw_artifact_acquisitions (
    acquisition_id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY(artifact_id) REFERENCES raw_artifacts(artifact_id)
      ON DELETE CASCADE
  );
  CREATE INDEX idx_raw_artifact_acquisitions_artifact_id
    ON raw_artifact_acquisitions(artifact_id);
  CREATE TABLE raw_artifact_tombstones (
    artifact_id TEXT PRIMARY KEY,
    source_identity TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_fingerprint TEXT NOT NULL,
    deletion_reason TEXT NOT NULL,
    normalized_document_action TEXT NOT NULL,
    deleted_at TEXT NOT NULL
  );
  CREATE TABLE raw_persistence_audit_events (
    event_id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    source_identity TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_fingerprint TEXT NOT NULL,
    operation TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );
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
    if (current < 3) {
      database.exec(MIGRATION_3);
      database
        .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(3, now);
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
