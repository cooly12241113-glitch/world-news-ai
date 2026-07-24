import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import * as z from "zod";
import { runMigrations } from "../persistence";
import type { DossierRevision, EventDossier } from "./models";
import {
  DossierRevisionConflictError,
} from "./memory-adapter";
import type {
  DossierRepositories,
  DossierRevisionRepository,
  DossierUnitOfWork,
  EventDossierRepository,
} from "./persistence";
import { DossierRevisionSchema, EventDossierSchema } from "./validation";

const DossierRowSchema = z.object({ snapshot_json: z.string() });
const RevisionRowSchema = z.object({
  revision_json: z.string(),
});

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    throw new TypeError("Persisted dossier JSON is invalid");
  }
};

const dossierFromRow = (
  row: Record<string, SQLOutputValue>,
): EventDossier =>
  EventDossierSchema.parse(
    parseJson(DossierRowSchema.parse(row).snapshot_json),
  );

const revisionFromRow = (
  row: Record<string, SQLOutputValue>,
): DossierRevision =>
  DossierRevisionSchema.parse(
    parseJson(RevisionRowSchema.parse(row).revision_json),
  );

export class SqliteDossierAdapter
  implements DossierUnitOfWork, EventDossierRepository, DossierRevisionRepository
{
  readonly #database: DatabaseSync;
  readonly repositories: DossierRepositories = {
    dossiers: this,
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

  transaction<T>(work: (repositories: DossierRepositories) => T): T {
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

  findLatestByEventId(eventId: string): EventDossier | undefined {
    const row = this.#database
      .prepare("SELECT snapshot_json FROM event_dossiers WHERE event_id = ?")
      .get(eventId);
    return row === undefined ? undefined : dossierFromRow(row);
  }

  findByDossierId(dossierId: string): EventDossier | undefined {
    const row = this.#database
      .prepare("SELECT snapshot_json FROM event_dossiers WHERE dossier_id = ?")
      .get(dossierId);
    return row === undefined ? undefined : dossierFromRow(row);
  }

  saveRevision(
    value: DossierRevision,
    expectedPreviousRevisionNumber: number,
  ): void {
    const revision = DossierRevisionSchema.parse(value);
    const current = this.findByDossierId(revision.dossierId);
    if ((current?.revisionNumber ?? 0) !== expectedPreviousRevisionNumber) {
      throw new DossierRevisionConflictError();
    }
    try {
      this.#database
        .prepare(
          `INSERT INTO dossier_revisions(
            revision_id, dossier_id, event_id, revision_number,
            previous_revision_id, semantic_fingerprint, revision_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          revision.id,
          revision.dossierId,
          revision.eventId,
          revision.revisionNumber,
          revision.previousRevisionId ?? null,
          revision.snapshot.semanticFingerprint,
          JSON.stringify(revision),
          revision.createdAt,
        );
      if (current === undefined) {
        this.#database
          .prepare(
            `INSERT INTO event_dossiers(
              dossier_id, event_id, current_revision_number,
              semantic_fingerprint, snapshot_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            revision.dossierId,
            revision.eventId,
            revision.revisionNumber,
            revision.snapshot.semanticFingerprint,
            JSON.stringify(revision.snapshot),
            revision.snapshot.createdAt,
            revision.snapshot.updatedAt,
          );
      } else {
        const result = this.#database
          .prepare(
            `UPDATE event_dossiers SET current_revision_number = ?,
              semantic_fingerprint = ?, snapshot_json = ?, updated_at = ?
             WHERE dossier_id = ? AND current_revision_number = ?`,
          )
          .run(
            revision.revisionNumber,
            revision.snapshot.semanticFingerprint,
            JSON.stringify(revision.snapshot),
            revision.snapshot.updatedAt,
            revision.dossierId,
            expectedPreviousRevisionNumber,
          );
        if (result.changes !== 1) throw new DossierRevisionConflictError();
      }
    } catch (error) {
      if (error instanceof DossierRevisionConflictError) throw error;
      throw new DossierRevisionConflictError();
    }
  }

  findRevisionById(revisionId: string): DossierRevision | undefined {
    const row = this.#database
      .prepare(
        "SELECT revision_json FROM dossier_revisions WHERE revision_id = ?",
      )
      .get(revisionId);
    return row === undefined ? undefined : revisionFromRow(row);
  }

  listRevisionHistory(dossierId: string): DossierRevision[] {
    return this.#database
      .prepare(
        `SELECT revision_json FROM dossier_revisions
         WHERE dossier_id = ? ORDER BY revision_number`,
      )
      .all(dossierId)
      .map(revisionFromRow);
  }
}
