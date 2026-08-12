import { DatabaseSync } from "node:sqlite";
import type { RawArtifactTombstone } from "../source-governance";
import { runMigrations, getSchemaVersion } from "../persistence/migrations";
import type {
  RawArtifactInsertOutcome,
  RawArtifactRepository,
  RawPersistenceRepositories,
  RawPersistenceUnitOfWork,
} from "./ports";
import type {
  RawArtifactAcquisitionOccurrence,
  RawPersistenceAuditEvent,
  StoredRawArtifact,
} from "./models";

export class RawPersistenceError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "RawPersistenceError";
  }
}

const bytesOf = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  throw new RawPersistenceError("RAW_STORAGE_FAILED");
};

export interface SqliteRawArtifactAdapterOptions {
  faultInjection?: (stage:
    | "after-blob-write"
    | "before-artifact-write"
    | "before-occurrence-write"
    | "after-occurrence-write"
  ) => void;
}

export class SqliteRawArtifactAdapter
implements RawArtifactRepository, RawPersistenceUnitOfWork {
  readonly #database: DatabaseSync;
  readonly #faultInjection?: SqliteRawArtifactAdapterOptions["faultInjection"];
  readonly rawRepositories: RawPersistenceRepositories = { rawArtifacts: this };

  constructor(
    path: string,
    now = new Date().toISOString(),
    options: SqliteRawArtifactAdapterOptions = {},
  ) {
    this.#database = new DatabaseSync(path);
    this.#faultInjection = options.faultInjection;
    try {
      this.#database.exec("PRAGMA foreign_keys = ON");
      this.#database.exec("PRAGMA busy_timeout = 5000");
      runMigrations(this.#database, now);
    } catch {
      this.#database.close();
      throw new RawPersistenceError("RAW_STORAGE_FAILED");
    }
  }
  get schemaVersion(): number { return getSchemaVersion(this.#database); }
  close(): void { this.#database.close(); }
  rawTransaction<T>(work: (repositories: RawPersistenceRepositories) => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = work(this.rawRepositories);
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.#database.exec("ROLLBACK"); } catch { /* sanitized below */ }
      if (error instanceof RawPersistenceError) throw error;
      throw new RawPersistenceError("RAW_STORAGE_FAILED");
    }
  }
  insert(
    record: StoredRawArtifact,
    occurrence: RawArtifactAcquisitionOccurrence,
  ): RawArtifactInsertOutcome {
    if (occurrence.artifactId !== record.artifact.artifactId) {
      throw new RawPersistenceError("RAW_ACQUISITION_CONFLICT");
    }
    const existing = this.findActiveById(record.artifact.artifactId);
    if (existing !== undefined) {
      const same = existing.policyId === record.policyId &&
        existing.policyFingerprint === record.policyFingerprint &&
        existing.governanceRecordId === record.governanceRecordId &&
        existing.redactionPosture === record.redactionPosture &&
        existing.artifact.sourceIdentity === record.artifact.sourceIdentity &&
        existing.artifact.contentHash === record.artifact.contentHash &&
        existing.artifact.contentKind === record.artifact.contentKind &&
        existing.artifact.mediaType === record.artifact.mediaType &&
        existing.artifact.byteLength === record.artifact.byteLength &&
        Buffer.from(existing.bytes).equals(Buffer.from(record.bytes));
      if (!same) throw new RawPersistenceError("RAW_ARTIFACT_CONFLICT");
      const priorOccurrence = this.#findAcquisition(occurrence.acquisitionId);
      if (priorOccurrence !== undefined) {
        if (priorOccurrence.artifactId !== occurrence.artifactId) {
          throw new RawPersistenceError("RAW_ACQUISITION_CONFLICT");
        }
        return "occurrence-replayed";
      }
      this.#insertOccurrence(occurrence);
      return "occurrence-inserted";
    }
    if (this.#findAcquisition(occurrence.acquisitionId) !== undefined) {
      throw new RawPersistenceError("RAW_ACQUISITION_CONFLICT");
    }
    const blob = this.#database.prepare(
      "SELECT byte_length, body FROM raw_artifact_blobs WHERE content_hash = ?",
    ).get(record.artifact.contentHash);
    let deduplicated = false;
    if (blob === undefined) {
      this.#database.prepare(
        "INSERT INTO raw_artifact_blobs(content_hash, byte_length, body) VALUES (?, ?, ?)",
      ).run(record.artifact.contentHash, record.bytes.byteLength, record.bytes);
    } else {
      const body = bytesOf(blob.body);
      if (blob.byte_length !== record.bytes.byteLength ||
          !Buffer.from(body).equals(Buffer.from(record.bytes))) {
        throw new RawPersistenceError("RAW_HASH_COLLISION_CONFLICT");
      }
      deduplicated = true;
    }
    this.#faultInjection?.("after-blob-write");
    this.#faultInjection?.("before-artifact-write");
    this.#database.prepare(`INSERT INTO raw_artifacts(
      artifact_id, source_identity, content_hash, content_kind, media_type,
      governance_record_id, policy_id, policy_fingerprint,
      redaction_posture, created_at, expires_at, legal_hold_authority_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`).run(
      record.artifact.artifactId, record.artifact.sourceIdentity,
      record.artifact.contentHash, record.artifact.contentKind,
      record.artifact.mediaType, record.governanceRecordId,
      record.policyId, record.policyFingerprint, record.redactionPosture,
      record.createdAt, record.expiresAt ?? null,
      record.legalHoldAuthorityId ?? null,
    );
    this.#insertOccurrence(occurrence);
    return deduplicated ? "blob-deduplicated" : "artifact-inserted";
  }
  findActiveById(artifactId: string): StoredRawArtifact | undefined {
    const row = this.#database.prepare(`SELECT a.*, b.byte_length, b.body
      FROM raw_artifacts a JOIN raw_artifact_blobs b USING(content_hash)
      WHERE a.artifact_id = ? AND a.status = 'active'`).get(artifactId);
    if (row === undefined) return undefined;
    const bytes = bytesOf(row.body);
    return {
      artifact: {
        artifactId: String(row.artifact_id),
        sourceIdentity: String(row.source_identity),
        contentHash: String(row.content_hash),
        contentKind: String(row.content_kind) as StoredRawArtifact["artifact"]["contentKind"],
        mediaType: String(row.media_type),
        byteLength: Number(row.byte_length),
      },
      bytes,
      governanceRecordId: String(row.governance_record_id),
      policyId: String(row.policy_id),
      policyFingerprint: String(row.policy_fingerprint),
      redactionPosture: String(row.redaction_posture) as StoredRawArtifact["redactionPosture"],
      createdAt: String(row.created_at),
      ...(row.expires_at === null ? {} : { expiresAt: String(row.expires_at) }),
      ...(row.legal_hold_authority_id === null ? {} : {
        legalHoldAuthorityId: String(row.legal_hold_authority_id),
      }),
    };
  }
  listAcquisitions(artifactId: string): RawArtifactAcquisitionOccurrence[] {
    return this.#database.prepare(`SELECT acquisition_id, artifact_id, occurred_at
      FROM raw_artifact_acquisitions WHERE artifact_id = ?
      ORDER BY occurred_at, acquisition_id`).all(artifactId).map((row) => ({
      acquisitionId: String(row.acquisition_id),
      artifactId: String(row.artifact_id),
      occurredAt: String(row.occurred_at),
    }));
  }
  findTombstone(artifactId: string): RawArtifactTombstone | undefined {
    const row = this.#database.prepare(
      "SELECT * FROM raw_artifact_tombstones WHERE artifact_id = ?",
    ).get(artifactId);
    if (row === undefined) return undefined;
    return {
      tombstoneId: `raw-tombstone:${String(row.artifact_id)}`,
      artifactId: String(row.artifact_id), sourceIdentity: String(row.source_identity),
      contentHash: String(row.content_hash), policyId: String(row.policy_id),
      policyFingerprint: String(row.policy_fingerprint),
      deletionReason: String(row.deletion_reason) as RawArtifactTombstone["deletionReason"],
      normalizedDocumentAction: String(row.normalized_document_action) as RawArtifactTombstone["normalizedDocumentAction"],
      deletedAt: String(row.deleted_at),
    };
  }
  listExpired(at: string): string[] {
    return this.#database.prepare(`SELECT artifact_id FROM raw_artifacts
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?
      AND legal_hold_authority_id IS NULL ORDER BY artifact_id`).all(at)
      .map((row) => String(row.artifact_id));
  }
  deleteToTombstone(tombstone: RawArtifactTombstone): void {
    const current = this.findActiveById(tombstone.artifactId);
    if (current === undefined) return;
    this.#database.prepare(`INSERT OR IGNORE INTO raw_artifact_tombstones(
      artifact_id, source_identity, content_hash, policy_id, policy_fingerprint,
      deletion_reason, normalized_document_action, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      tombstone.artifactId, tombstone.sourceIdentity, tombstone.contentHash,
      tombstone.policyId, tombstone.policyFingerprint, tombstone.deletionReason,
      tombstone.normalizedDocumentAction, tombstone.deletedAt,
    );
    this.#database.prepare(
      "DELETE FROM raw_artifacts WHERE artifact_id = ?",
    ).run(tombstone.artifactId);
    const refs = this.#database.prepare(
      "SELECT COUNT(*) AS count FROM raw_artifacts WHERE content_hash = ? AND status = 'active'",
    ).get(tombstone.contentHash);
    if (Number(refs?.count ?? 1) === 0) {
      this.#database.prepare(
        "DELETE FROM raw_artifact_blobs WHERE content_hash = ?",
      ).run(tombstone.contentHash);
    }
  }
  appendAudit(event: RawPersistenceAuditEvent): void {
    this.#database.prepare(`INSERT INTO raw_persistence_audit_events(
      event_id, artifact_id, source_identity, policy_id, policy_fingerprint,
      operation, outcome, reason_code, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      event.eventId, event.artifactId, event.sourceIdentity, event.policyId,
      event.policyFingerprint, event.operation, event.outcome,
      event.reasonCode, event.occurredAt,
    );
  }
  listAudit(artifactId: string): RawPersistenceAuditEvent[] {
    return this.#database.prepare(
      "SELECT * FROM raw_persistence_audit_events WHERE artifact_id = ? ORDER BY occurred_at, event_id",
    ).all(artifactId).map((row) => ({
      eventId: String(row.event_id), artifactId: String(row.artifact_id),
      sourceIdentity: String(row.source_identity), policyId: String(row.policy_id),
      policyFingerprint: String(row.policy_fingerprint),
      operation: String(row.operation) as RawPersistenceAuditEvent["operation"],
      outcome: String(row.outcome) as RawPersistenceAuditEvent["outcome"],
      reasonCode: String(row.reason_code), occurredAt: String(row.occurred_at),
    }));
  }
  #findAcquisition(acquisitionId: string): RawArtifactAcquisitionOccurrence | undefined {
    const row = this.#database.prepare(`SELECT acquisition_id, artifact_id, occurred_at
      FROM raw_artifact_acquisitions WHERE acquisition_id = ?`).get(acquisitionId);
    if (row === undefined) return undefined;
    return {
      acquisitionId: String(row.acquisition_id),
      artifactId: String(row.artifact_id),
      occurredAt: String(row.occurred_at),
    };
  }
  #insertOccurrence(occurrence: RawArtifactAcquisitionOccurrence): void {
    this.#faultInjection?.("before-occurrence-write");
    this.#database.prepare(`INSERT INTO raw_artifact_acquisitions(
      acquisition_id, artifact_id, occurred_at
    ) VALUES (?, ?, ?)`).run(
      occurrence.acquisitionId, occurrence.artifactId, occurrence.occurredAt,
    );
    this.#faultInjection?.("after-occurrence-write");
  }
}
