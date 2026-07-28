import { describe, expect, it } from "vitest";
import { createFollowUpAnswerPlan } from "../follow-up-answer";
import {
  assessEvidenceContinuity,
  assertEvidenceContinuitySafe,
} from "../../replan";
import { followUpContext } from "./fixtures";

describe("current-context answer safety", () => {
  it("allows only captured evidence", () => {
    const context = followUpContext();
    const evidence = context.visibleEvidenceIds[0]!;
    const answer = createFollowUpAnswerPlan({
      answerPlanId: "answer-1",
      followUpId: "follow-up-1",
      sessionId: context.sessionId,
      sceneId: context.currentSceneId,
      answerType: "source-list",
      evidenceBindings: [evidence],
      statementTypes: ["attributed-claim"],
      uncertaintyNotes: [],
      missingEvidence: [],
    }, context.evidenceAllowlist);
    expect(answer.evidenceBindings).toEqual([evidence]);
  });

  it("rejects unknown evidence", () => {
    const context = followUpContext();
    expect(() => createFollowUpAnswerPlan({
      answerPlanId: "answer-1",
      followUpId: "follow-up-1",
      sessionId: context.sessionId,
      sceneId: context.currentSceneId,
      answerType: "source-list",
      evidenceBindings: ["invented-evidence"],
      statementTypes: ["attributed-claim"],
      uncertaintyNotes: [],
      missingEvidence: [],
    }, context.evidenceAllowlist)).toThrow(/allowlist/);
  });

  it("rejects unsupported fact promotion", () => {
    const context = followUpContext();
    expect(() => createFollowUpAnswerPlan({
      answerPlanId: "answer-1",
      followUpId: "follow-up-1",
      sessionId: context.sessionId,
      sceneId: context.currentSceneId,
      answerType: "claim-support-status",
      evidenceBindings: [],
      statementTypes: ["confirmed-fact"],
      uncertaintyNotes: [],
      missingEvidence: ["support"],
    }, context.evidenceAllowlist)).toThrow(/Confirmed facts/);
  });
});

describe("evidence continuity", () => {
  const previous = followUpContext().evidenceAllowlist;

  it("reports preserved evidence", () => {
    expect(assessEvidenceContinuity(previous, previous, [], "v1").continuityStatus)
      .toBe("preserved");
  });

  it("tracks removed evidence", () => {
    const replacement = structuredClone(previous);
    replacement.contextItemIds = replacement.contextItemIds.slice(1);
    const assessment = assessEvidenceContinuity(previous, replacement, [], "v1");
    expect(assessment.removedEvidenceIds).toContain(previous.contextItemIds[0]);
    expect(assessment.continuityStatus).toBe("partially-preserved");
  });

  it("reports replacement when nothing survives", () => {
    const replacement = Object.fromEntries(
      Object.keys(previous).map((key) => [key, [`new-${key}`]]),
    ) as unknown as typeof previous;
    expect(assessEvidenceContinuity(previous, replacement, [], "v1").continuityStatus)
      .toBe("replaced");
  });

  it("rejects unknown invalidations", () => {
    const assessment = assessEvidenceContinuity(
      previous,
      previous,
      ["unknown-evidence"],
      "v1",
    );
    expect(assessment.continuityStatus).toBe("invalid");
    expect(() => assertEvidenceContinuitySafe(assessment)).toThrow(/unknown IDs/);
  });
});
