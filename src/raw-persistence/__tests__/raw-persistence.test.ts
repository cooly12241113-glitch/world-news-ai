import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  RawArtifactPersistenceService,
  SqliteRawArtifactAdapter,
  rawCandidateFromBoundedAcquisition,
  type RawArtifactCandidate,
} from "../index";
import {
  createRawArtifactGovernanceRecord,
  createRawArtifactLifecyclePolicy,
  type RawArtifactLifecyclePolicy,
  type RawArtifactOperationContext,
  type RawArtifactRetentionPolicy,
} from "../../source-governance";
import {
  createContentHash,
  createRawArtifactId,
  createSourceIdentity,
} from "../../source-connector";
import type { SafeNetworkAcquisitionSuccess } from "../../source-acquisition-security";
import { SqlitePersistenceAdapter } from "../../persistence";
import { storedDocumentFixture } from "../../persistence/__tests__/fixtures";

const temporaryPath = () => join(tmpdir(), `raw-${randomUUID()}.sqlite`);
const now = new Date("2026-08-12T00:00:00.000Z");
const context: RawArtifactOperationContext = {
  operation: "persist",
  purpose: "retention-management",
  actorClass: "authorized-operator",
  connectorId: "web",
  sourceAccessPolicy: { access: "public-only" },
};
const policy = (
  retention: RawArtifactRetentionPolicy = {
    kind: "bounded", duration: { amount: 30, unit: "day" },
  },
  overrides: Partial<Parameters<typeof createRawArtifactLifecyclePolicy>[0]> = {},
): RawArtifactLifecyclePolicy => createRawArtifactLifecyclePolicy({
  policyVersion: "1",
  retention,
  deletion: {
    triggers: ["scheduled-expiry", "explicit-request", "policy-deletion"],
    legalHoldPreventsDeletion: retention.kind === "legal-hold",
    normalizedDocumentAction: "review-required",
  },
  redaction: "none",
  encryption: "platform-managed",
  accessClass: "public-source",
  instructionPolicy: "UNTRUSTED_DATA",
  ...overrides,
});
const candidate = (
  text = "durable raw bytes",
  lifecycle = policy(),
  sourceUrl = "https://example.com/source?secret=not-persisted#fragment",
): RawArtifactCandidate => {
  const bytes = Buffer.from(text);
  const sourceIdentity = createSourceIdentity({ kind: "web", url: sourceUrl });
  const contentHash = createContentHash(text);
  const artifact = {
    artifactId: createRawArtifactId(sourceIdentity, contentHash),
    sourceIdentity,
    contentKind: "text" as const,
    mediaType: "text/plain",
    contentHash,
    byteLength: bytes.length,
  };
  return {
    artifact, bytes, acquisitionId: "acquisition-1",
    governance: createRawArtifactGovernanceRecord(artifact, lifecycle),
    policy: lifecycle, context,
  };
};
const withStore = <T>(work: (
  store: SqliteRawArtifactAdapter,
  service: RawArtifactPersistenceService,
  path: string,
) => T): T => {
  const path = temporaryPath();
  const store = new SqliteRawArtifactAdapter(path, now.toISOString());
  const service = new RawArtifactPersistenceService(store, {
    now: () => now,
    atRestProtection: { satisfies: () => true },
  });
  try { return work(store, service, path); }
  finally { store.close(); rmSync(path, { force: true }); }
};

describe("durable raw artifact storage core", () => {
  it("migrates to schema v3 and preserves representative v2 data", () => {
    const path = temporaryPath();
    const database = new DatabaseSync(path);
    database.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES(2, '2026-08-01T00:00:00.000Z');
      CREATE TABLE preserved_v2(value TEXT); INSERT INTO preserved_v2 VALUES('kept');`);
    database.close();
    const store = new SqliteRawArtifactAdapter(path, now.toISOString());
    expect(store.schemaVersion).toBe(3);
    store.close();
    const verify = new DatabaseSync(path);
    expect(verify.prepare("SELECT value FROM preserved_v2").get()).toEqual({ value: "kept" });
    expect(verify.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'raw_artifact_acquisitions'`).get())
      .toEqual({ name: "raw_artifact_acquisitions" });
    expect(verify.prepare(`SELECT "from", "table", "to", on_delete
      FROM pragma_foreign_key_list('raw_artifact_acquisitions')`).get())
      .toEqual({ from: "artifact_id", table: "raw_artifacts", to: "artifact_id", on_delete: "CASCADE" });
    expect(verify.prepare("SELECT MAX(version) AS version FROM schema_migrations").get())
      .toEqual({ version: 3 });
    verify.close(); rmSync(path, { force: true });
  });

  it("persists immutable bytes and survives repository restart", () => {
    const path = temporaryPath();
    const first = new SqliteRawArtifactAdapter(path, now.toISOString());
    const value = candidate();
    const service = new RawArtifactPersistenceService(first, {
      now: () => now, atRestProtection: { satisfies: () => true },
    });
    expect(service.persist(value)).toMatchObject({ success: true, outcome: "persisted" });
    first.close();
    const second = new SqliteRawArtifactAdapter(path);
    expect(new RawArtifactPersistenceService(second).read(
      value.artifact.artifactId, value.policy, { ...context, operation: "read" },
    )).toMatchObject({ success: true });
    const read = new RawArtifactPersistenceService(second).read(
      value.artifact.artifactId, value.policy, { ...context, operation: "read" },
    );
    expect(read.success && Buffer.from(read.artifact.bytes).equals(Buffer.from(value.bytes)))
      .toBe(true);
    second.close(); rmSync(path, { force: true });
  });

  it("rejects hash mismatch and oversized direct candidates", () => withStore((_s, service) => {
    const mismatch = candidate();
    mismatch.bytes = Buffer.from("tampered");
    expect(service.persist(mismatch)).toEqual({ success: false, reasonCode: "RAW_HASH_MISMATCH" });
    const oversized = candidate();
    oversized.bytes = new Uint8Array(16 * 1_024 * 1_024 + 1);
    expect(service.persist(oversized)).toEqual({ success: false, reasonCode: "RAW_ARTIFACT_TOO_LARGE" });
  }));

  it("is idempotent for identical identity and rejects conflicting policy", () => withStore((_s, service) => {
    const value = candidate();
    expect(service.persist(value)).toMatchObject({ outcome: "persisted" });
    expect(service.persist(value)).toMatchObject({ outcome: "idempotent" });
    const stricter = candidate("durable raw bytes", policy(undefined, { policyVersion: "2" }));
    expect(service.persist(stricter)).toEqual({ success: false, reasonCode: "RAW_ARTIFACT_CONFLICT" });
  }));

  it("physically deduplicates equal bytes while retaining source/policy occurrences", () => withStore((store, service) => {
    const first = candidate("same", policy(), "https://a.example/");
    const second = candidate("same", policy(undefined, { policyVersion: "2" }), "https://b.example/");
    second.acquisitionId = "acquisition-2";
    expect(service.persist(first)).toMatchObject({ outcome: "persisted" });
    expect(service.persist(second)).toMatchObject({ outcome: "deduplicated" });
    expect(store.findActiveById(first.artifact.artifactId)?.artifact.sourceIdentity)
      .not.toBe(store.findActiveById(second.artifact.artifactId)?.artifact.sourceIdentity);
  }));

  it("rolls back artifact, blob, and audit after an injected pre-commit failure", () => {
    const path = temporaryPath();
    const store = new SqliteRawArtifactAdapter(path);
    const value = candidate();
    const service = new RawArtifactPersistenceService(store, {
      now: () => now, atRestProtection: { satisfies: () => true },
      faultInjection: () => { throw new Error("simulated crash"); },
    });
    expect(service.persist(value)).toEqual({ success: false, reasonCode: "RAW_STORAGE_FAILED" });
    expect(store.findActiveById(value.artifact.artifactId)).toBeUndefined();
    expect(store.listAudit(value.artifact.artifactId)).toEqual([]);
    store.close(); rmSync(path, { force: true });
  });

  it.each(["after-artifact-write", "before-audit"] as const)(
    "rolls back every visible row at the %s transaction fault point",
    (faultPoint) => {
      const path = temporaryPath();
      const store = new SqliteRawArtifactAdapter(path);
      const value = candidate();
      const service = new RawArtifactPersistenceService(store, {
        now: () => now, atRestProtection: { satisfies: () => true },
        faultInjection: (stage) => {
          if (stage === faultPoint) throw new Error("simulated transaction interruption");
        },
      });
      expect(service.persist(value)).toEqual({ success: false, reasonCode: "RAW_STORAGE_FAILED" });
      expect(store.findActiveById(value.artifact.artifactId)).toBeUndefined();
      expect(store.listAudit(value.artifact.artifactId)).toEqual([]);
      store.close(); rmSync(path, { force: true });
    },
  );

  it.each(["after-blob-write", "before-artifact-write"] as const)(
    "rolls back blob and prevents orphan metadata at the %s adapter fault point",
    (faultPoint) => {
      const path = temporaryPath();
      const store = new SqliteRawArtifactAdapter(path, now.toISOString(), {
        faultInjection: (stage) => {
          if (stage === faultPoint) throw new Error("simulated storage interruption");
        },
      });
      const value = candidate();
      const service = new RawArtifactPersistenceService(store, {
        now: () => now, atRestProtection: { satisfies: () => true },
      });
      expect(service.persist(value)).toEqual({ success: false, reasonCode: "RAW_STORAGE_FAILED" });
      expect(store.findActiveById(value.artifact.artifactId)).toBeUndefined();
      expect(store.listAudit(value.artifact.artifactId)).toEqual([]);
      store.close(); rmSync(path, { force: true });
    },
  );

  it("returns copies so callers cannot mutate committed bytes", () => withStore((store, service) => {
    const value = candidate(); service.persist(value);
    const first = store.findActiveById(value.artifact.artifactId);
    first?.bytes.fill(0);
    expect(Buffer.from(store.findActiveById(value.artifact.artifactId)?.bytes ?? []).toString())
      .toBe("durable raw bytes");
  }));

  it("concurrent duplicate requests converge through database identity constraints", async () => {
    const path = temporaryPath();
    const firstStore = new SqliteRawArtifactAdapter(path);
    const secondStore = new SqliteRawArtifactAdapter(path);
    const options = { now: () => now, atRestProtection: { satisfies: () => true } };
    const first = new RawArtifactPersistenceService(firstStore, options);
    const second = new RawArtifactPersistenceService(secondStore, options);
    const value = candidate();
    const results = await Promise.all([
      Promise.resolve().then(() => first.persist(value)),
      Promise.resolve().then(() => second.persist(value)),
    ]);
    expect(results.map((result) => result.success)).toEqual([true, true]);
    expect(results.map((result) => result.success && result.outcome).sort())
      .toEqual(["idempotent", "persisted"]);
    firstStore.close(); secondStore.close(); rmSync(path, { force: true });
  });

  it("records three acquisition occurrences without duplicating the RawArtifact", () =>
    withStore((store, service) => {
      const value = candidate();
      const ids = ["acquisition-1", "acquisition-2", "acquisition-3"];
      const results = ids.map((acquisitionId) => service.persist({
        ...value, acquisitionId,
      }));
      expect(results).toMatchObject([
        { success: true, outcome: "persisted" },
        { success: true, outcome: "occurrence-recorded" },
        { success: true, outcome: "occurrence-recorded" },
      ]);
      expect(store.listAcquisitions(value.artifact.artifactId)
        .map(({ acquisitionId }) => acquisitionId)).toEqual(ids);
      expect(store.listAudit(value.artifact.artifactId).filter(
        ({ reasonCode }) => reasonCode === "RAW_ACQUISITION_RECORDED",
      )).toHaveLength(2);
      expect(store.findActiveById(value.artifact.artifactId)?.artifact.artifactId)
        .toBe(value.artifact.artifactId);
    }));

  it("replays the same acquisition idempotently without another occurrence", () =>
    withStore((store, service) => {
      const value = candidate();
      expect(service.persist(value)).toMatchObject({ outcome: "persisted" });
      expect(service.persist(value)).toMatchObject({ outcome: "idempotent" });
      expect(store.listAcquisitions(value.artifact.artifactId)).toHaveLength(1);
      expect(store.listAudit(value.artifact.artifactId).find(
        ({ reasonCode }) => reasonCode === "RAW_ACQUISITION_REPLAYED",
      )).toMatchObject({
        outcome: "deduplicated", reasonCode: "RAW_ACQUISITION_REPLAYED",
      });
    }));

  it("rejects rebinding one acquisition identity to a different artifact", () =>
    withStore((store, service) => {
      const first = candidate("first artifact");
      const second = candidate("different artifact");
      expect(service.persist(first).success).toBe(true);
      expect(service.persist(second))
        .toEqual({ success: false, reasonCode: "RAW_ACQUISITION_CONFLICT" });
      expect(store.listAcquisitions(first.artifact.artifactId)).toHaveLength(1);
      expect(store.findActiveById(second.artifact.artifactId)).toBeUndefined();
    }));

  it.each(["before-occurrence-write", "after-occurrence-write"] as const)(
    "rolls back a new occurrence at the %s fault point",
    (faultPoint) => {
      const path = temporaryPath();
      let armed = false;
      const store = new SqliteRawArtifactAdapter(path, now.toISOString(), {
        faultInjection: (stage) => {
          if (armed && stage === faultPoint) throw new Error("occurrence interruption");
        },
      });
      const service = new RawArtifactPersistenceService(store, {
        now: () => now, atRestProtection: { satisfies: () => true },
      });
      const value = candidate();
      expect(service.persist(value).success).toBe(true);
      armed = true;
      expect(service.persist({ ...value, acquisitionId: "acquisition-2" }))
        .toEqual({ success: false, reasonCode: "RAW_STORAGE_FAILED" });
      expect(store.listAcquisitions(value.artifact.artifactId)
        .map(({ acquisitionId }) => acquisitionId)).toEqual(["acquisition-1"]);
      store.close(); rmSync(path, { force: true });
    },
  );

  it("concurrently preserves distinct acquisition occurrences for one artifact", async () => {
    const path = temporaryPath();
    const firstStore = new SqliteRawArtifactAdapter(path);
    const secondStore = new SqliteRawArtifactAdapter(path);
    const options = { now: () => now, atRestProtection: { satisfies: () => true } };
    const value = candidate();
    const results = await Promise.all([
      Promise.resolve().then(() => new RawArtifactPersistenceService(firstStore, options)
        .persist({ ...value, acquisitionId: "acquisition-a" })),
      Promise.resolve().then(() => new RawArtifactPersistenceService(secondStore, options)
        .persist({ ...value, acquisitionId: "acquisition-b" })),
    ]);
    expect(results.every(({ success }) => success)).toBe(true);
    expect(firstStore.listAcquisitions(value.artifact.artifactId)
      .map(({ acquisitionId }) => acquisitionId).sort())
      .toEqual(["acquisition-a", "acquisition-b"]);
    firstStore.close(); secondStore.close(); rmSync(path, { force: true });
  });

  it("preserves acquisition history across restart", () => {
    const path = temporaryPath();
    const value = candidate();
    const first = new SqliteRawArtifactAdapter(path);
    const writer = new RawArtifactPersistenceService(first, {
      now: () => now, atRestProtection: { satisfies: () => true },
    });
    writer.persist(value);
    writer.persist({ ...value, acquisitionId: "acquisition-2" });
    first.close();
    const reopened = new SqliteRawArtifactAdapter(path);
    expect(reopened.listAcquisitions(value.artifact.artifactId)
      .map(({ acquisitionId }) => acquisitionId))
      .toEqual(["acquisition-1", "acquisition-2"]);
    reopened.close(); rmSync(path, { force: true });
  });
});

describe("raw governance lifecycle", () => {
  it.each([
    [policy({ kind: "ephemeral" }), "RAW_PERSISTENCE_NOT_ALLOWED"],
    [policy({ kind: "ephemeral" }, { encryption: "not-persisted" }), "RAW_PERSISTENCE_NOT_ALLOWED"],
    [policy({ kind: "ephemeral" }, {
      redaction: "discard-after-normalization", encryption: "not-persisted",
    }), "RAW_PERSISTENCE_NOT_ALLOWED"],
    [policy(undefined, { encryption: "required-at-rest" }), "ENCRYPTION_REQUIREMENT_UNSATISFIED"],
    [policy(undefined, { redaction: "sensitive-fields" }), "REDACTION_REQUIREMENT_UNSATISFIED"],
  ] as const)("fails closed for non-durable lifecycle posture", (lifecycle, reasonCode) =>
    withStore((_s, service) => {
      expect(service.persist(candidate("bytes", lifecycle))).toEqual({ success: false, reasonCode });
    }));

  it("requires a proven platform-managed protection provider", () => {
    const path = temporaryPath();
    const store = new SqliteRawArtifactAdapter(path);
    expect(new RawArtifactPersistenceService(store).persist(candidate()))
      .toEqual({ success: false, reasonCode: "ENCRYPTION_REQUIREMENT_UNSATISFIED" });
    expect(new RawArtifactPersistenceService(store, {
      atRestProtection: { satisfies: () => { throw new Error("provider secret"); } },
    }).persist(candidate()))
      .toEqual({ success: false, reasonCode: "ENCRYPTION_REQUIREMENT_UNSATISFIED" });
    store.close(); rmSync(path, { force: true });
  });

  it("preserves prohibited-first and consent/credential governance", () => withStore((store, service) => {
    const prohibited = candidate();
    prohibited.context = {
      ...context, sourceAccessPolicy: { access: "prohibited" },
    };
    expect(service.persist(prohibited)).toMatchObject({
      success: false, reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
    const privatePolicy = policy(undefined, { accessClass: "consented-private-source" });
    const privateCandidate = candidate("private", privatePolicy);
    expect(service.persist(privateCandidate)).toMatchObject({ success: false });
    const audits = store.listAudit(prohibited.artifact.artifactId);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain("prohibited source");
  }));

  it("calculates bounded expiry and exposes an explicit lifecycle query", () => withStore((store, service) => {
    const value = candidate(); service.persist(value);
    expect(store.findActiveById(value.artifact.artifactId)?.expiresAt)
      .toBe("2026-09-11T00:00:00.000Z");
    expect(service.listExpiryEligible(new Date("2026-09-11T00:00:00.000Z")))
      .toEqual([value.artifact.artifactId]);
  }));

  it("does not accidentally return expired bytes from the governed read service", () => {
    const path = temporaryPath();
    const store = new SqliteRawArtifactAdapter(path);
    const value = candidate("expires", policy({
      kind: "bounded", duration: { amount: 1, unit: "day" },
    }));
    const writer = new RawArtifactPersistenceService(store, {
      now: () => now, atRestProtection: { satisfies: () => true },
    });
    expect(writer.persist(value).success).toBe(true);
    const reader = new RawArtifactPersistenceService(store, {
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    expect(reader.read(value.artifact.artifactId, value.policy,
      { ...context, operation: "read" }))
      .toEqual({ success: false, reasonCode: "RAW_ARTIFACT_EXPIRED" });
    store.close(); rmSync(path, { force: true });
  });

  it("legal hold blocks deletion/expiry and survives restart", () => {
    const path = temporaryPath();
    const hold = policy({
      kind: "legal-hold",
      authority: { authorityReferenceId: "legal-authority-1", posture: "active" },
    });
    const value = candidate("held", hold);
    const store = new SqliteRawArtifactAdapter(path);
    const service = new RawArtifactPersistenceService(store, {
      now: () => now, atRestProtection: { satisfies: () => true },
    });
    service.persist(value);
    expect(service.listExpiryEligible(new Date("2099-01-01T00:00:00.000Z"))).toEqual([]);
    expect(service.delete(value.artifact.artifactId, hold, { ...context, operation: "delete" }, "explicit-request"))
      .toEqual({ success: false, reasonCode: "LEGAL_HOLD_PREVENTS_DELETION" });
    store.close();
    const reopened = new SqliteRawArtifactAdapter(path);
    expect(reopened.findActiveById(value.artifact.artifactId)?.legalHoldAuthorityId)
      .toBe("legal-authority-1");
    reopened.close(); rmSync(path, { force: true });
  });

  it("deletes idempotently to a minimal durable tombstone", () => withStore((store, service) => {
    const value = candidate(); service.persist(value);
    const first = service.delete(value.artifact.artifactId, value.policy,
      { ...context, operation: "delete" }, "explicit-request");
    expect(first).toMatchObject({ success: true, outcome: "deleted" });
    expect(service.delete(value.artifact.artifactId, value.policy,
      { ...context, operation: "delete" }, "explicit-request"))
      .toMatchObject({ success: true, outcome: "already-deleted" });
    expect(store.findActiveById(value.artifact.artifactId)).toBeUndefined();
    expect(store.listAcquisitions(value.artifact.artifactId)).toEqual([]);
    const tombstone = store.findTombstone(value.artifact.artifactId);
    expect(tombstone).not.toHaveProperty("bytes");
    expect(JSON.stringify(tombstone)).not.toContain("durable raw bytes");
  }));

  it("enforces policy deletion triggers", () => withStore((_store, service) => {
    const lifecycle = policy(undefined, { deletion: {
      triggers: ["scheduled-expiry"], legalHoldPreventsDeletion: false,
      normalizedDocumentAction: "review-required",
    }});
    const value = candidate("triggered", lifecycle); service.persist(value);
    expect(service.delete(value.artifact.artifactId, lifecycle,
      { ...context, operation: "delete" }, "explicit-request"))
      .toEqual({ success: false, reasonCode: "RAW_DELETE_TRIGGER_NOT_ALLOWED" });
  }));

  it("keeps SourceDocument independent when raw bytes are deleted", () => {
    const path = temporaryPath();
    const documents = new SqlitePersistenceAdapter(path);
    documents.repositories.sourceDocuments.save(storedDocumentFixture);
    documents.close();
    const raw = new SqliteRawArtifactAdapter(path);
    const service = new RawArtifactPersistenceService(raw, {
      now: () => now, atRestProtection: { satisfies: () => true },
    });
    const value = candidate(); service.persist(value);
    service.delete(value.artifact.artifactId, value.policy,
      { ...context, operation: "delete" }, "explicit-request");
    raw.close();
    const reopened = new SqlitePersistenceAdapter(path);
    expect(reopened.repositories.sourceDocuments.findByStorageId(storedDocumentFixture.storageId))
      .toEqual(storedDocumentFixture);
    reopened.close(); rmSync(path, { force: true });
  });

  it("keeps a minimal tombstone durable across restart", () => {
    const path = temporaryPath();
    const value = candidate();
    const first = new SqliteRawArtifactAdapter(path);
    const service = new RawArtifactPersistenceService(first, {
      now: () => now, atRestProtection: { satisfies: () => true },
    });
    service.persist(value);
    service.delete(value.artifact.artifactId, value.policy,
      { ...context, operation: "delete" }, "explicit-request");
    first.close();
    const reopened = new SqliteRawArtifactAdapter(path);
    expect(reopened.findActiveById(value.artifact.artifactId)).toBeUndefined();
    expect(reopened.findTombstone(value.artifact.artifactId)).toMatchObject({
      artifactId: value.artifact.artifactId, deletionReason: "explicit-request",
    });
    reopened.close(); rmSync(path, { force: true });
  });

  it("gates every public read through current governance", () => withStore((store, service) => {
    const value = candidate(); service.persist(value);
    const denied = service.read(value.artifact.artifactId, value.policy, {
      ...context, operation: "read", sourceAccessPolicy: { access: "prohibited" },
    });
    expect(denied).toEqual({ success: false, reasonCode: "SOURCE_ACCESS_PROHIBITED" });
    expect(store.listAudit(value.artifact.artifactId).find(({ operation }) =>
      operation === "read")).toMatchObject({
      operation: "read", outcome: "denied", reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
  }));

  it("does not delete a shared blob still referenced by a held occurrence", () => withStore((store, service) => {
    const heldPolicy = policy({ kind: "legal-hold", authority: {
      authorityReferenceId: "authority", posture: "active",
    }});
    const normal = candidate("shared", policy(), "https://a.example/");
    const held = candidate("shared", heldPolicy, "https://b.example/");
    held.acquisitionId = "held-acquisition";
    service.persist(normal); service.persist(held);
    service.delete(normal.artifact.artifactId, normal.policy,
      { ...context, operation: "delete" }, "explicit-request");
    expect(Buffer.from(store.findActiveById(held.artifact.artifactId)?.bytes ?? [])
      .equals(Buffer.from("shared"))).toBe(true);
  }));
});

describe("acquisition and privacy integration", () => {
  it("creates an explicit decoded-byte candidate without refetching", () => {
    const bytes = Buffer.from("bounded acquired");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const acquired = {
      success: true, connectorId: "web", requestId: "request-1",
      finalTarget: { scheme: "https", hostname: "example.com", port: 443,
        targetFingerprint: "a".repeat(64) },
      statusCode: 200, attemptNumber: 1, redirectHop: 0,
      body: { bytes, text: "bounded acquired", mediaType: "text/plain",
        contentKind: "text", contentEncoding: "identity",
        encodedBytesReceived: bytes.length, decodedBytesProduced: bytes.length,
        decodedSha256: hash },
    } satisfies SafeNetworkAcquisitionSuccess;
    const lifecycle = policy();
    const request = { requestId: "request-1", connectorId: "web" as const,
      locator: { kind: "web" as const, url: "https://example.com/path?secret=x#f" },
      accessPolicy: { access: "public-only" as const } };
    const value = rawCandidateFromBoundedAcquisition(acquired, request, lifecycle, context);
    expect(value.bytes).toEqual(bytes);
    expect(value.artifact.contentHash).toBe(hash);
    expect(JSON.stringify(value.artifact)).not.toContain("secret=x");
    const prohibited = rawCandidateFromBoundedAcquisition(acquired, {
      ...request, accessPolicy: { access: "prohibited" },
    }, lifecycle, context);
    expect(prohibited.context.sourceAccessPolicy).toEqual({ access: "prohibited" });
  });

  it("persists only bounded audit fields and sanitizes database failures", () => withStore((store, service) => {
    const value = candidate(); service.persist(value);
    const serialized = JSON.stringify(store.listAudit(value.artifact.artifactId));
    expect(serialized).not.toContain("durable raw bytes");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("SELECT");
  }));

  it("maps unavailable storage reads and deletes to a bounded public reason", () => {
    const path = temporaryPath();
    const store = new SqliteRawArtifactAdapter(path);
    const value = candidate();
    const service = new RawArtifactPersistenceService(store);
    store.close();
    expect(service.read(value.artifact.artifactId, value.policy,
      { ...context, operation: "read" }))
      .toEqual({ success: false, reasonCode: "RAW_STORAGE_FAILED" });
    expect(service.delete(value.artifact.artifactId, value.policy,
      { ...context, operation: "delete" }, "explicit-request"))
      .toEqual({ success: false, reasonCode: "RAW_STORAGE_FAILED" });
    rmSync(path, { force: true });
  });
});
