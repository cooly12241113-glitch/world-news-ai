import { describe, expect, it } from "vitest";
import {
  InMemoryBriefingSessionRepository,
  reduceBriefingSession,
} from "..";
import { command, context, session } from "./fixtures";

describe("session reducer and repository integration", () => {
  it("persists an accepted transition and its privacy-safe audit record", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    const current = session();
    await repository.create(current);

    const result = reduceBriefingSession(
      current,
      command(current, { type: "START_BRIEFING" }),
      context,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    await repository.save(result.nextSession, result.previousSessionFingerprint);
    await repository.appendAuditRecord(result.auditRecord);

    expect((await repository.getById(current.sessionId))?.status).toBe(
      "presenting-scene",
    );
    const audits = await repository.listAuditRecordsBySession(current.sessionId);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain("questionText");
  });

  it("does not persist a rejected transition", async () => {
    const repository = new InMemoryBriefingSessionRepository();
    const current = session({ status: "briefing-ready" });
    await repository.create(current);
    const result = reduceBriefingSession(
      current,
      command(current, { type: "END_BRIEFING" }),
      context,
    );
    expect(result.success).toBe(false);
    expect(await repository.getById(current.sessionId)).toEqual(current);
  });

  it("supports a complete manual lifecycle without effects", () => {
    let current = session();
    for (const makeCommand of [
      () => command(current, { type: "START_BRIEFING" }),
      () => command(current, {
        type: "NEXT_SCENE",
        sceneId: "scene-2",
        sceneIndex: 1,
      }),
      () => command(current, {
        type: "NEXT_SCENE",
        sceneId: "scene-3",
        sceneIndex: 2,
      }),
      () => command(current, { type: "END_BRIEFING" }),
    ]) {
      const result = reduceBriefingSession(current, makeCommand(), context);
      expect(result.success).toBe(true);
      if (result.success) current = result.nextSession;
    }
    expect(current.status).toBe("ended");
  });
});
