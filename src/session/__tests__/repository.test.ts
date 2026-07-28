import { describe, expect, it } from "vitest";
import {
  InMemoryBriefingSessionRepository,
  SessionRepositoryConflictError,
  SessionRepositoryValidationError,
} from "..";
import { context, session } from "./fixtures";

describe("in-memory briefing session repository", () => {
  it("creates and reads an isolated copy", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    const value = session();
    await repository.create(value);
    const read = await repository.getById(value.sessionId);
    expect(read).toEqual(value);
    if (read) read.sceneCursor.visitedSceneIds.push("external");
    expect((await repository.getById(value.sessionId))?.sceneCursor.visitedSceneIds)
      .toEqual(["scene-1"]);
  });

  it("rejects duplicate creation", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    const value = session();
    await repository.create(value);
    await expect(repository.create(value)).rejects.toBeInstanceOf(
      SessionRepositoryConflictError,
    );
  });

  it("enforces optimistic concurrency on save", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    const value = session();
    await repository.create(value);
    await expect(repository.save(value, "stale")).rejects.toBeInstanceOf(
      SessionRepositoryConflictError,
    );
  });

  it("rejects a forged semantic fingerprint", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    await expect(
      repository.create({ ...session(), semanticFingerprint: "forged" }),
    ).rejects.toBeInstanceOf(SessionRepositoryValidationError);
  });

  it("validates sessions on read", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    const value = session();
    await repository.create(value);
    expect(await repository.getById(value.sessionId)).toEqual(value);
  });

  it("appends and lists audit records in insertion order", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    const first = {
      auditRecordId: "audit-1",
      sessionId: "session-1",
      commandType: "START_BRIEFING" as const,
      previousFingerprint: "previous",
      nextFingerprint: "next",
      transitionOutcome: "accepted" as const,
      sceneId: "scene-1",
      policyVersion: context.policyVersion,
      occurredAt: context.transitionTimestamp,
    };
    await repository.appendAuditRecord(first);
    await repository.appendAuditRecord({ ...first, auditRecordId: "audit-2" });
    expect(
      (await repository.listAuditRecordsBySession("session-1")).map(
        (record) => record.auditRecordId,
      ),
    ).toEqual(["audit-1", "audit-2"]);
  });
});
