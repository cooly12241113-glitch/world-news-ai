import { describe, expect, it } from "vitest";
import { BriefingQuestionSchema } from "../validation";
import { question } from "./fixtures";

describe("BriefingQuestionSchema", () => {
  it("accepts Korean and English questions", () => {
    expect(BriefingQuestionSchema.safeParse(question()).success).toBe(true);
    expect(BriefingQuestionSchema.safeParse(question({
      language: "en", text: "Why did this conflict begin?",
    })).success).toBe(true);
  });

  it.each(["", "   "])("rejects empty question text", (text) => {
    expect(BriefingQuestionSchema.safeParse(question({ text })).success).toBe(false);
  });

  it("enforces the length limit", () => {
    expect(BriefingQuestionSchema.safeParse(question({ text: "a".repeat(2001) })).success).toBe(false);
  });

  it("validates optional caller context strictly", () => {
    expect(BriefingQuestionSchema.safeParse(question({
      userProvidedContext: { locations: ["Seoul"] },
    })).success).toBe(true);
    expect(BriefingQuestionSchema.safeParse({
      ...question(), userProvidedContext: { secret: "inferred" },
    }).success).toBe(false);
  });
});
