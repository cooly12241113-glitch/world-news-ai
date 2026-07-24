import { describe, expect, it } from "vitest";
import {
  DuplicateFingerprintError,
  InMemoryPersistenceAdapter,
  PersistenceError,
  SqlitePersistenceAdapter,
  type UnitOfWork,
} from "../index";
import {
  jobFixture,
  observationFixture,
  revisionFixture,
  storedDocumentFixture,
} from "./fixtures";

interface AdapterHandle {
  unitOfWork: UnitOfWork;
  close(): void;
}

const factories: ReadonlyArray<
  readonly [string, () => AdapterHandle]
> = [
  [
    "in-memory",
    () => {
      const adapter = new InMemoryPersistenceAdapter();
      return { unitOfWork: adapter, close: () => undefined };
    },
  ],
  [
    "sqlite",
    () => {
      const adapter = new SqlitePersistenceAdapter(":memory:");
      return { unitOfWork: adapter, close: () => adapter.close() };
    },
  ],
];

describe.each(factories)("%s repository contract", (_name, create) => {
  it("stores and reads a SourceDocument by ID, fingerprint, and canonical URL", () => {
    const handle = create();
    try {
      const repositories = handle.unitOfWork.repositories;
      repositories.sourceDocuments.save(storedDocumentFixture);
      repositories.revisions.save(revisionFixture);
      expect(
        repositories.sourceDocuments.findByStorageId("storage-1"),
      ).toEqual(storedDocumentFixture);
      expect(
        repositories.sourceDocuments.findByFingerprint("fingerprint-1"),
      ).toEqual(storedDocumentFixture);
      expect(
        repositories.sourceDocuments.findLatestByCanonicalUrl(
          "https://example.com/report",
        ),
      ).toEqual(storedDocumentFixture);
      expect(
        repositories.sourceDocuments.listByCanonicalUrl(
          "https://example.com/report",
        ),
      ).toEqual([storedDocumentFixture]);
    } finally {
      handle.close();
    }
  });

  it("enforces fingerprint uniqueness", () => {
    const handle = create();
    try {
      const repository = handle.unitOfWork.repositories.sourceDocuments;
      repository.save(storedDocumentFixture);
      expect(() =>
        repository.save({
          ...storedDocumentFixture,
          storageId: "storage-2",
        }),
      ).toThrow(DuplicateFingerprintError);
    } finally {
      handle.close();
    }
  });

  it("creates jobs and enforces the explicit state machine", () => {
    const handle = create();
    try {
      const jobs = handle.unitOfWork.repositories.jobs;
      jobs.create(jobFixture);
      expect(jobs.findById("job-1")).toEqual(jobFixture);
      const running = jobs.transition(
        "job-1",
        "running",
        "2026-07-24T00:00:01.000Z",
      );
      expect(running.status).toBe("running");
      expect(running.attemptCount).toBe(1);
      const completed = jobs.transition(
        "job-1",
        "succeeded",
        "2026-07-24T00:00:02.000Z",
        {
          documentId: "storage-1",
          fingerprint: "fingerprint-1",
        },
      );
      expect(completed.status).toBe("succeeded");
      expect(() =>
        jobs.transition(
          "job-1",
          "running",
          "2026-07-24T00:00:03.000Z",
        ),
      ).toThrow(PersistenceError);
      expect(() =>
        jobs.transition(
          "job-1",
          "failed",
          "2026-07-24T00:00:03.000Z",
        ),
      ).toThrow(PersistenceError);
    } finally {
      handle.close();
    }
  });

  it("stores and queries observations and revision history", () => {
    const handle = create();
    try {
      const repositories = handle.unitOfWork.repositories;
      repositories.sourceDocuments.save(storedDocumentFixture);
      repositories.jobs.create(jobFixture);
      repositories.observations.save(observationFixture);
      repositories.revisions.save(revisionFixture);
      expect(
        repositories.observations.findByDocumentId("storage-1"),
      ).toEqual([observationFixture]);
      expect(repositories.observations.findByJobId("job-1")).toEqual([
        observationFixture,
      ]);
      expect(
        repositories.revisions.findLatestRevision(
          "https://example.com/report",
        ),
      ).toEqual(revisionFixture);
      expect(
        repositories.revisions.listRevisionHistory(
          "https://example.com/report",
        ),
      ).toEqual([revisionFixture]);
    } finally {
      handle.close();
    }
  });

  it("rolls back all writes when a transaction fails", () => {
    const handle = create();
    try {
      expect(() =>
        handle.unitOfWork.transaction((repositories) => {
          repositories.sourceDocuments.save(storedDocumentFixture);
          repositories.jobs.create(jobFixture);
          throw new Error("forced rollback");
        }),
      ).toThrow("forced rollback");
      expect(
        handle.unitOfWork.repositories.sourceDocuments.findByStorageId(
          "storage-1",
        ),
      ).toBeUndefined();
      expect(
        handle.unitOfWork.repositories.jobs.findById("job-1"),
      ).toBeUndefined();
    } finally {
      handle.close();
    }
  });
});
