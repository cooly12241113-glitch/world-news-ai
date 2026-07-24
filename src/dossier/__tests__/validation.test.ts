import { describe, expect, it } from "vitest";
import {
  DossierConfidenceSchema,
  DossierStatementSchema,
  confidenceLevelForScore,
} from "../index";
import { statementFixture } from "./fixtures";

describe("dossier domain validation", () => {
  it.each([
    [0, "very-low"],
    [0.19, "very-low"],
    [0.2, "low"],
    [0.4, "medium"],
    [0.6, "high"],
    [0.8, "very-high"],
    [1, "very-high"],
  ])("maps confidence %s to %s", (score, level) => {
    expect(confidenceLevelForScore(score)).toBe(level);
  });

  it("rejects score/level mismatch and scores outside 0..1", () => {
    expect(
      DossierConfidenceSchema.safeParse({
        ...statementFixture.confidence,
        level: "very-high",
      }).success,
    ).toBe(false);
    expect(
      DossierConfidenceSchema.safeParse({
        ...statementFixture.confidence,
        score: 2,
      }).success,
    ).toBe(false);
  });

  it("requires evidence for confirmed facts", () => {
    expect(
      DossierStatementSchema.safeParse({
        ...statementFixture,
        sourceDocumentIds: [],
        evidenceLinkIds: [],
      }).success,
    ).toBe(false);
  });

  it("requires claim references for attributed claims", () => {
    expect(
      DossierStatementSchema.safeParse({
        ...statementFixture,
        statementType: "attributed-claim",
        claimIds: [],
      }).success,
    ).toBe(false);
  });

  it("requires assumptions for forecasts", () => {
    expect(
      DossierStatementSchema.safeParse({
        ...statementFixture,
        statementType: "forecast",
      }).success,
    ).toBe(false);
  });

  it("rejects high-confidence unknown statements", () => {
    expect(
      DossierStatementSchema.safeParse({
        ...statementFixture,
        statementType: "unknown",
      }).success,
    ).toBe(false);
  });

  it("prevents unsupported AI text from becoming confirmed fact", () => {
    expect(
      DossierStatementSchema.safeParse({
        ...statementFixture,
        authoredBy: "ai",
        sourceDocumentIds: [],
        evidenceLinkIds: [],
      }).success,
    ).toBe(false);
  });
});
