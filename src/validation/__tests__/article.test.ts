import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Article } from "../../domain";
import { ArticleSchema } from "../article";
import { articleFixture } from "./fixtures";

describe("ArticleSchema", () => {
  it("accepts complete and minimal articles including empty arrays", () => {
    expect(ArticleSchema.parse({ ...articleFixture })).toEqual(articleFixture);
    const { summary: _summary, bodyText: _body, ...minimal } = articleFixture;
    expect(ArticleSchema.safeParse({
      ...minimal, authorNames: [], entityIds: [], topicIds: [], eventIds: [],
    }).success).toBe(true);
  });

  it("does not impose publication/fetch ordering", () => {
    expect(ArticleSchema.safeParse({
      ...articleFixture, fetchedAt: "2026-07-23T01:30:00.000Z",
    }).success).toBe(true);
  });

  it("rejects required-array omission and malformed fields", () => {
    const { authorNames: _authors, ...missingAuthors } = articleFixture;
    expect(ArticleSchema.safeParse(missingAuthors).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...articleFixture, title: 1 }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...articleFixture, summary: null }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...articleFixture, extra: true }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...articleFixture, canonicalUrl: "/article" }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...articleFixture, publishedAt: "2026-07-24T01:30:00" }).success).toBe(false);
  });

  it("rejects blank and duplicate author names and duplicate IDs", () => {
    expect(ArticleSchema.safeParse({ ...articleFixture, authorNames: [" "] }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...articleFixture, authorNames: ["A", "A"] }).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...articleFixture, entityIds: ["e", "e"] }).success).toBe(false);
  });

  it("matches the Article domain type", () => {
    expectTypeOf<z.infer<typeof ArticleSchema>>().toEqualTypeOf<Article>();
  });
});
