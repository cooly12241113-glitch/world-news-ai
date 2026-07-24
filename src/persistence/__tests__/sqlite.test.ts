import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  LATEST_SCHEMA_VERSION,
  PersistenceError,
  SqlitePersistenceAdapter,
} from "../index";
import { revisionFixture, storedDocumentFixture } from "./fixtures";

const temporaryDatabasePath = (): string =>
  join(tmpdir(), `world-news-ai-${randomUUID()}.sqlite`);

describe("SqlitePersistenceAdapter", () => {
  it("creates and safely reapplies the current migration", () => {
    const path = temporaryDatabasePath();
    try {
      const first = new SqlitePersistenceAdapter(path);
      expect(first.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
      first.close();
      const second = new SqlitePersistenceAdapter(path);
      expect(second.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
      second.close();
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("preserves documents across adapter reopen", () => {
    const path = temporaryDatabasePath();
    try {
      const first = new SqlitePersistenceAdapter(path);
      first.repositories.sourceDocuments.save(storedDocumentFixture);
      first.repositories.revisions.save(revisionFixture);
      first.close();
      const second = new SqlitePersistenceAdapter(path);
      expect(
        second.repositories.sourceDocuments.findByFingerprint("fingerprint-1"),
      ).toEqual(storedDocumentFixture);
      second.close();
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("rejects persisted SourceDocument JSON that fails runtime validation", () => {
    const path = temporaryDatabasePath();
    try {
      const first = new SqlitePersistenceAdapter(path);
      first.repositories.sourceDocuments.save(storedDocumentFixture);
      first.close();
      const database = new DatabaseSync(path);
      database
        .prepare(
          "UPDATE source_documents SET source_document_json = ? WHERE storage_id = ?",
        )
        .run('{"id":"invalid"}', "storage-1");
      database.close();
      const second = new SqlitePersistenceAdapter(path);
      expect(() =>
        second.repositories.sourceDocuments.findByStorageId("storage-1"),
      ).toThrow();
      second.close();
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("rejects a database with a newer unknown schema version", () => {
    const path = temporaryDatabasePath();
    try {
      const database = new DatabaseSync(path);
      database.exec(
        "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
      );
      database
        .prepare(
          "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
        )
        .run(999, "2026-07-24T00:00:00.000Z");
      database.close();
      expect(() => new SqlitePersistenceAdapter(path)).toThrow(
        PersistenceError,
      );
    } finally {
      rmSync(path, { force: true });
    }
  });
});
