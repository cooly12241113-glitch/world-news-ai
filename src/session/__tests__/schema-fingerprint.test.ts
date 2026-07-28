import { describe, expect, it } from "vitest";
import {
  BriefingSessionSchema,
  SessionCommandSchema,
  createBriefingSessionFingerprint,
} from "..";
import { command, session } from "./fixtures";

describe("session schemas and fingerprint", () => {
  it("accepts a valid session", () => {
    expect(BriefingSessionSchema.safeParse(session()).success).toBe(true);
  });

  it("rejects unknown session fields", () => {
    expect(
      BriefingSessionSchema.safeParse({ ...session(), unexpected: true }).success,
    ).toBe(false);
  });

  it("rejects invalid cursor bounds", () => {
    const value = session();
    expect(
      BriefingSessionSchema.safeParse({
        ...value,
        sceneCursor: { ...value.sceneCursor, sceneIndex: 3 },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate visited scene IDs", () => {
    const value = session();
    expect(
      BriefingSessionSchema.safeParse({
        ...value,
        sceneCursor: {
          ...value.sceneCursor,
          visitedSceneIds: ["scene-1", "scene-1"],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid viewport", () => {
    const value = session();
    expect(
      BriefingSessionSchema.safeParse({
        ...value,
        viewportSnapshot: {
          center: { longitude: 181, latitude: 37 },
          zoom: 7,
          bearing: 0,
          pitch: 30,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects replanning without an active operation", () => {
    expect(
      BriefingSessionSchema.safeParse(
        session({ status: "replanning", composerState: "expanded" }),
      ).success,
    ).toBe(false);
  });

  it("rejects unknown command fields", () => {
    const value = session();
    expect(
      SessionCommandSchema.safeParse({
        ...command(value, { type: "START_BRIEFING" }),
        questionText: "private text",
      }).success,
    ).toBe(false);
  });

  it("is stable across object reconstruction", () => {
    const value = session();
    expect(createBriefingSessionFingerprint(structuredClone(value))).toBe(
      value.semanticFingerprint,
    );
  });

  it("excludes timestamps and session identity", () => {
    const value = session();
    expect(
      createBriefingSessionFingerprint({
        ...value,
        sessionId: "another-session",
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
      }),
    ).toBe(value.semanticFingerprint);
  });

  it("changes for semantic state changes", () => {
    const value = session();
    expect(
      createBriefingSessionFingerprint({ ...value, selectedAnalysisTab: "sources" }),
    ).not.toBe(value.semanticFingerprint);
  });
});
