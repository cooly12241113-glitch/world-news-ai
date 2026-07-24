import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IngestionPipeline, type IngestionRequest } from "../../ingestion";
import {
  DuplicateFingerprintError,
  InMemoryPersistenceAdapter,
  PersistentIngestionService,
  SqlitePersistenceAdapter,
  type PersistenceRepositories,
  type SourceDocumentRepository,
  type UnitOfWork,
} from "../index";

const ids = (): (() => string) => {
  let value = 0;
  return () => `generated-${++value}`;
};

const now = (): Date => new Date("2026-07-24T12:00:00.000Z");

const plainRequest = (
  body = "The economy is expected to expand over the next quarter.",
  sourceUrl = "https://research.example/outlook.txt",
): IngestionRequest => ({
  kind: "content",
  content: `Research Outlook\n\n${body}`,
  mediaType: "text/plain",
  sourceUrl,
  retrievedAt: "2026-07-24T10:00:00.000Z",
  hints: {
    expectedDocumentType: "ResearchReport",
    expectedLanguage: "en",
    sourceName: "Research Institute",
  },
});

const htmlRequest = (requestedUrl: string): IngestionRequest => ({
  kind: "content",
  content: `<!doctype html><html lang="en"><head>
    <link rel="canonical" href="https://canonical.example/report">
    <script type="application/ld+json">
      {"@type":"NewsArticle","headline":"Shared report","articleBody":"A shared report body with enough substantive content."}
    </script>
  </head><body><article><h1>Shared report</h1><p>A shared report body with enough substantive content.</p></article></body></html>`,
  mediaType: "text/html",
  sourceUrl: requestedUrl,
  retrievedAt: "2026-07-24T10:00:00.000Z",
});

const serviceWith = (
  unitOfWork: UnitOfWork,
): PersistentIngestionService =>
  new PersistentIngestionService(new IngestionPipeline(), unitOfWork, {
    now,
    createId: ids(),
  });

describe("PersistentIngestionService", () => {
  it("stores a new document, first revision, observation, and succeeded job", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const result = await serviceWith(adapter).ingest(plainRequest());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outcome).toBe("stored");
      expect(result.revisionNumber).toBe(1);
      expect(
        adapter.repositories.sourceDocuments.findByStorageId(result.documentId),
      ).toBeDefined();
      expect(
        adapter.repositories.observations.findByJobId(result.jobId),
      ).toHaveLength(1);
      expect(adapter.repositories.jobs.findById(result.jobId)?.status).toBe(
        "succeeded",
      );
    }
  });

  it("returns duplicate for repeated raw content and preserves every observation", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const service = serviceWith(adapter);
    const first = await service.ingest(plainRequest());
    const second = await service.ingest(plainRequest());
    expect(first.success && first.outcome).toBe("stored");
    expect(second.success && second.outcome).toBe("duplicate");
    if (first.success && second.success) {
      expect(second.documentId).toBe(first.documentId);
      expect(
        adapter.repositories.observations.findByDocumentId(first.documentId),
      ).toHaveLength(2);
      expect(adapter.repositories.jobs.findById(second.jobId)?.status).toBe(
        "duplicate",
      );
    }
  });

  it("deduplicates the same canonical content observed through different URLs", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const service = serviceWith(adapter);
    const first = await service.ingest(
      htmlRequest("https://mirror-one.example/report"),
    );
    const second = await service.ingest(
      htmlRequest("https://mirror-two.example/report"),
    );
    expect(first.success && first.outcome).toBe("stored");
    expect(second.success && second.outcome).toBe("duplicate");
    if (first.success && second.success) {
      expect(second.documentId).toBe(first.documentId);
      expect(
        adapter.repositories.observations.findByDocumentId(first.documentId),
      ).toHaveLength(2);
    }
  });

  it("creates a new revision for changed content at the same canonical URL", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const service = serviceWith(adapter);
    const first = await service.ingest(plainRequest());
    const second = await service.ingest(
      plainRequest("The revised outlook now expects a contraction next quarter."),
    );
    expect(first.success && first.outcome).toBe("stored");
    expect(second.success && second.outcome).toBe("revision");
    if (first.success && second.success) {
      expect(second.revisionNumber).toBe(2);
      expect(second.documentId).not.toBe(first.documentId);
      const history = adapter.repositories.revisions.listRevisionHistory(
        "https://research.example/outlook.txt",
      );
      expect(history).toHaveLength(2);
      expect(history[1]?.previousDocumentId).toBe(first.documentId);
    }
  });

  it("stores different content at a different URL as a new document", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const service = serviceWith(adapter);
    const first = await service.ingest(plainRequest());
    const second = await service.ingest(
      plainRequest(
        "A different regional report contains separate findings and evidence.",
        "https://research.example/regional.txt",
      ),
    );
    expect(first.success && first.outcome).toBe("stored");
    expect(second.success && second.outcome).toBe("stored");
    if (first.success && second.success) {
      expect(second.documentId).not.toBe(first.documentId);
      expect(second.revisionNumber).toBe(1);
    }
  });

  it("records pipeline failures as failed jobs without documents", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const result = await serviceWith(adapter).ingest({
      kind: "content",
      content: "No URL and insufficient metadata",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const job = adapter.repositories.jobs.findById(result.jobId);
      expect(job?.status).toBe("failed");
      expect(job?.errorCode).toBe(result.error.code);
      expect(job?.completedAt).toBeDefined();
    }
  });

  it("rolls back persistence failures and leaves the job failed", async () => {
    const base = new InMemoryPersistenceAdapter();
    const failing: UnitOfWork = {
      repositories: base.repositories,
      transaction: () => {
        throw new Error("database unavailable with sensitive details");
      },
    };
    const result = await serviceWith(failing).ingest(plainRequest());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TRANSACTION_FAILED");
      expect(result.error).not.toHaveProperty("cause");
      expect(base.repositories.jobs.findById(result.jobId)?.status).toBe(
        "failed",
      );
    }
  });

  it("recovers a unique fingerprint race as duplicate", async () => {
    const base = new InMemoryPersistenceAdapter();
    let conflictPending = true;
    const sourceDocuments: SourceDocumentRepository = {
      ...base.repositories.sourceDocuments,
      findByFingerprint: (fingerprint) =>
        base.repositories.sourceDocuments.findByFingerprint(fingerprint),
      findByStorageId: (storageId) =>
        base.repositories.sourceDocuments.findByStorageId(storageId),
      findLatestByCanonicalUrl: (canonicalUrl) =>
        base.repositories.sourceDocuments.findLatestByCanonicalUrl(canonicalUrl),
      listByCanonicalUrl: (canonicalUrl) =>
        base.repositories.sourceDocuments.listByCanonicalUrl(canonicalUrl),
      save: (document) => {
        if (conflictPending) {
          conflictPending = false;
          base.repositories.sourceDocuments.save(document);
          throw new DuplicateFingerprintError(document.fingerprint);
        }
        base.repositories.sourceDocuments.save(document);
      },
    };
    const repositories: PersistenceRepositories = {
      ...base.repositories,
      sourceDocuments,
    };
    const racing: UnitOfWork = {
      repositories,
      transaction: (work) => base.transaction(() => work(repositories)),
    };
    const result = await serviceWith(racing).ingest(plainRequest());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outcome).toBe("duplicate");
      expect(
        base.repositories.observations.findByJobId(result.jobId),
      ).toHaveLength(1);
      expect(base.repositories.jobs.findById(result.jobId)?.status).toBe(
        "duplicate",
      );
    }
  });

  it("sanitizes query parameters from persisted documents and operational records", async () => {
    const adapter = new InMemoryPersistenceAdapter();
    const result = await serviceWith(adapter).ingest(
      plainRequest(
        "A report body that is long enough for persistence.",
        "https://research.example/outlook.txt?token=secret#part",
      ),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const job = adapter.repositories.jobs.findById(result.jobId);
      expect(job?.requestedUrl).toBe("https://research.example/outlook.txt");
      const observations = adapter.repositories.observations.findByJobId(
        result.jobId,
      );
      const stored = adapter.repositories.sourceDocuments.findByStorageId(
        result.documentId,
      );
      expect(stored?.canonicalUrl).toBe("https://research.example/outlook.txt");
      expect(stored?.sourceDocument.canonicalUrl).toBe(
        "https://research.example/outlook.txt",
      );
      expect(JSON.stringify({ job, observations, stored })).not.toContain(
        "secret",
      );
    }
  });
});

describe("persistent ingestion concurrency", () => {
  it("stores one document and one observation per concurrent request", async () => {
    const path = join(tmpdir(), `world-news-ai-concurrency-${randomUUID()}.sqlite`);
    const adapter = new SqlitePersistenceAdapter(path);
    try {
      const service = new PersistentIngestionService(
        new IngestionPipeline(),
        adapter,
        { now },
      );
      const results = await Promise.all(
        Array.from({ length: 8 }, () => service.ingest(plainRequest())),
      );
      expect(results.every((result) => result.success)).toBe(true);
      const successes = results.filter(
        (result): result is Extract<typeof result, { success: true }> =>
          result.success,
      );
      expect(
        successes.filter(({ outcome }) => outcome === "stored"),
      ).toHaveLength(1);
      expect(
        successes.filter(({ outcome }) => outcome === "duplicate"),
      ).toHaveLength(7);
      const documentId = successes[0]?.documentId;
      expect(documentId).toBeDefined();
      expect(
        adapter.repositories.observations.findByDocumentId(documentId ?? ""),
      ).toHaveLength(8);
      expect(
        results.every((result) => {
          const job = adapter.repositories.jobs.findById(result.jobId);
          return job?.status === "succeeded" || job?.status === "duplicate";
        }),
      ).toBe(true);
    } finally {
      adapter.close();
      rmSync(path, { force: true });
    }
  });
});
