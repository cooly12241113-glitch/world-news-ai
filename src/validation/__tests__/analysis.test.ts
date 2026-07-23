import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Analysis } from "../../domain";
import {
  AnalysisKindSchema,
  AnalysisSchema,
  AnalysisTargetTypeSchema,
} from "../analysis";
import { analysisFixture } from "./fixtures";

describe("AnalysisSchema", () => {
  it("accepts complete analyses and explicitly empty arrays", () => {
    expect(AnalysisSchema.parse({ ...analysisFixture })).toEqual(analysisFixture);
    expect(AnalysisSchema.safeParse({
      ...analysisFixture, keyPoints: [], evidenceArticleIds: [], caveats: [],
    }).success).toBe(true);
  });

  it.each(["article", "event", "entity", "topic"])(
    "accepts AnalysisTargetType %s",
    (value) => expect(AnalysisTargetTypeSchema.safeParse(value).success).toBe(true),
  );

  it.each(["summary", "impact", "relationship", "scenario", "fact_check", "trend"])(
    "accepts AnalysisKind %s",
    (value) => expect(AnalysisKindSchema.safeParse(value).success).toBe(true),
  );

  it("rejects missing arrays, invalid values, null, and unknown fields", () => {
    const { keyPoints: _points, ...missingPoints } = analysisFixture;
    expect(AnalysisSchema.safeParse(missingPoints).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...analysisFixture, targetType: "source" }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...analysisFixture, kind: "opinion" }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...analysisFixture, modelName: null }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...analysisFixture, summary: " " }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...analysisFixture, extra: true }).success).toBe(false);
  });

  it("rejects duplicate or blank string-array values and duplicate IDs", () => {
    expect(AnalysisSchema.safeParse({ ...analysisFixture, keyPoints: ["A", "A"] }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...analysisFixture, caveats: [""] }).success).toBe(false);
    expect(AnalysisSchema.safeParse({
      ...analysisFixture, evidenceArticleIds: ["a", "a"],
    }).success).toBe(false);
  });

  it("matches the Analysis domain type", () => {
    expectTypeOf<z.infer<typeof AnalysisSchema>>().toEqualTypeOf<Analysis>();
  });
});
