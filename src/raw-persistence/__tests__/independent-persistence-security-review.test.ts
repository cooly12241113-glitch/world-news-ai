import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RawArtifactPersistenceService,
  SqliteRawArtifactAdapter,
  type RawArtifactCandidate,
} from "../index";
import {
  createRawArtifactGovernanceRecord,
  createRawArtifactLifecyclePolicy,
} from "../../source-governance";
import {
  createRawArtifactId,
  createSourceIdentity,
} from "../../source-connector";

const pathForTest = () => join(tmpdir(), `raw-review-${randomUUID()}.sqlite`);

const candidate = (acquisitionId: string): RawArtifactCandidate => {
  const bytes = Buffer.from("same source and content", "utf8");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const sourceIdentity = createSourceIdentity({
    kind: "web",
    url: "https://example.com/article",
  });
  const policy = createRawArtifactLifecyclePolicy({
    policyVersion: "1",
    retention: { kind: "bounded", duration: { amount: 30, unit: "day" } },
    deletion: {
      triggers: ["scheduled-expiry", "explicit-request"],
      legalHoldPreventsDeletion: false,
      normalizedDocumentAction: "review-required",
    },
    redaction: "none",
    encryption: "platform-managed",
    accessClass: "public-source",
    instructionPolicy: "UNTRUSTED_DATA",
  });
  const artifact = {
    artifactId: createRawArtifactId(sourceIdentity, contentHash),
    sourceIdentity,
    contentKind: "text" as const,
    mediaType: "text/plain",
    contentHash,
    byteLength: bytes.byteLength,
  };
  return {
    artifact,
    bytes,
    acquisitionId,
    governance: createRawArtifactGovernanceRecord(artifact, policy),
    policy,
    context: {
      operation: "persist",
      purpose: "retention-management",
      actorClass: "authorized-operator",
      connectorId: "web",
      sourceAccessPolicy: { access: "public-only" },
    },
  };
};

describe("independent raw-persistence security review", () => {
  it("retains a distinct acquisition occurrence for the same RawArtifact", () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const service = new RawArtifactPersistenceService(store, {
      now: () => new Date("2026-08-12T00:00:00.000Z"),
      atRestProtection: { satisfies: () => true },
    });
    try {
      const first = service.persist(candidate("acquisition-t1"));
      const second = service.persist(candidate("acquisition-t2"));
      expect(first).toMatchObject({ success: true, outcome: "persisted" });
      expect(second).toMatchObject({ success: true, outcome: "occurrence-recorded" });
      expect(store.listAcquisitions(candidate("acquisition-t1").artifact.artifactId)
        .map(({ acquisitionId }) => acquisitionId))
        .toEqual(["acquisition-t1", "acquisition-t2"]);
      store.close();
      const reopened = new SqliteRawArtifactAdapter(path);
      expect(reopened.listAcquisitions(candidate("acquisition-t1").artifact.artifactId))
        .toHaveLength(2);
      reopened.close();
      return;
    } finally {
      try { store.close(); } catch { /* already closed for restart assertion */ }
      rmSync(path, { force: true });
    }
  });

  it("creates no artifact or occurrence when persistence protection is denied", () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const value = candidate("denied-acquisition");
    const service = new RawArtifactPersistenceService(store, {
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    try {
      expect(service.persist(value)).toEqual({
        success: false,
        reasonCode: "ENCRYPTION_REQUIREMENT_UNSATISFIED",
      });
      expect(store.findActiveById(value.artifact.artifactId)).toBeUndefined();
      expect(store.listAcquisitions(value.artifact.artifactId)).toEqual([]);
    } finally {
      store.close();
      rmSync(path, { force: true });
    }
  });
});
