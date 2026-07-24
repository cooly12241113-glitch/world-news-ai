import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  DossierRevisionConflictError,
  EventDossierBuilder,
  InMemoryDossierAdapter,
  PersistentEventDossierService,
  SqliteDossierAdapter,
  type DossierRevision,
  type DossierUnitOfWork,
} from "../index";
import { dossierInputFixture } from "./fixtures";

const buildRevision = (): DossierRevision => {
  const result = new EventDossierBuilder(
    () => new Date("2026-07-24T12:00:00.000Z"),
    () => "dossier-1",
  ).build(dossierInputFixture());
  if (!result.success) throw new Error("fixture build failed");
  return result.revision;
};

const factories: ReadonlyArray<
  readonly [string, () => { adapter: DossierUnitOfWork; close(): void }]
> = [
  [
    "in-memory",
    () => ({
      adapter: new InMemoryDossierAdapter(),
      close: () => undefined,
    }),
  ],
  [
    "sqlite",
    () => {
      const adapter = new SqliteDossierAdapter(":memory:");
      return { adapter, close: () => adapter.close() };
    },
  ],
];

describe.each(factories)("%s dossier repository contract", (_name, create) => {
  it("stores snapshots and revision history with runtime validation", () => {
    const handle = create();
    try {
      const revision = buildRevision();
      handle.adapter.transaction((repositories) => {
        repositories.revisions.saveRevision(revision, 0);
      });
      expect(
        handle.adapter.repositories.dossiers.findLatestByEventId("event-1"),
      ).toEqual(revision.snapshot);
      expect(
        handle.adapter.repositories.dossiers.findByDossierId("dossier-1"),
      ).toEqual(revision.snapshot);
      expect(
        handle.adapter.repositories.revisions.findRevisionById(revision.id),
      ).toEqual(revision);
      expect(
        handle.adapter.repositories.revisions.listRevisionHistory("dossier-1"),
      ).toEqual([revision]);
    } finally {
      handle.close();
    }
  });

  it("rolls back and rejects revision conflicts", () => {
    const handle = create();
    try {
      const revision = buildRevision();
      expect(() =>
        handle.adapter.transaction((repositories) => {
          repositories.revisions.saveRevision(revision, 0);
          throw new Error("forced rollback");
        }),
      ).toThrow("forced rollback");
      expect(
        handle.adapter.repositories.dossiers.findByDossierId("dossier-1"),
      ).toBeUndefined();
      handle.adapter.transaction((repositories) => {
        repositories.revisions.saveRevision(revision, 0);
      });
      expect(() =>
        handle.adapter.transaction((repositories) => {
          repositories.revisions.saveRevision(revision, 0);
        }),
      ).toThrow(DossierRevisionConflictError);
    } finally {
      handle.close();
    }
  });
});

describe("dossier persistence integration", () => {
  it("persists builder revisions and returns unchanged without a new row", () => {
    const adapter = new InMemoryDossierAdapter();
    const builder = new EventDossierBuilder(
      () => new Date("2026-07-24T12:00:00.000Z"),
      () => "dossier-1",
    );
    const service = new PersistentEventDossierService(builder, adapter);
    const first = service.buildAndPersist(dossierInputFixture());
    const second = service.buildAndPersist(dossierInputFixture());
    expect(first.success && first.outcome).toBe("created");
    expect(second.success && second.outcome).toBe("unchanged");
    expect(
      adapter.repositories.revisions.listRevisionHistory("dossier-1"),
    ).toHaveLength(1);
  });

  it("preserves SQLite dossiers across reopen and validates stored snapshots", () => {
    const path = join(tmpdir(), `world-news-dossier-${randomUUID()}.sqlite`);
    try {
      const revision = buildRevision();
      const first = new SqliteDossierAdapter(path);
      first.transaction((repositories) => {
        repositories.revisions.saveRevision(revision, 0);
      });
      first.close();
      const second = new SqliteDossierAdapter(path);
      expect(
        second.repositories.dossiers.findLatestByEventId("event-1"),
      ).toEqual(revision.snapshot);
      second.close();

      const database = new DatabaseSync(path);
      database
        .prepare(
          "UPDATE event_dossiers SET snapshot_json = ? WHERE dossier_id = ?",
        )
        .run('{"id":"invalid"}', "dossier-1");
      database.close();
      const third = new SqliteDossierAdapter(path);
      expect(() =>
        third.repositories.dossiers.findByDossierId("dossier-1"),
      ).toThrow();
      third.close();
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("upgrades a version-1 database to migration version 2 safely", () => {
    const path = join(tmpdir(), `world-news-migration-${randomUUID()}.sqlite`);
    try {
      const database = new DatabaseSync(path);
      database.exec(
        "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
      );
      database
        .prepare(
          "INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)",
        )
        .run("2026-07-24T00:00:00.000Z");
      database.close();
      const adapter = new SqliteDossierAdapter(path);
      const check = new DatabaseSync(path);
      const row = check
        .prepare("SELECT MAX(version) AS version FROM schema_migrations")
        .get();
      expect(row?.version).toBe(2);
      check.close();
      adapter.close();
    } finally {
      rmSync(path, { force: true });
    }
  });
});
