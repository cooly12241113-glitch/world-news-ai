import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Source } from "../../domain";
import { SourceSchema, SourceTypeSchema } from "../source";
import { sourceFixture } from "./fixtures";

describe("SourceSchema", () => {
  it("accepts complete and minimal sources from unknown input", () => {
    const input: unknown = { ...sourceFixture };
    expect(SourceSchema.parse(input)).toEqual(sourceFixture);
    expect(SourceSchema.safeParse({
      id: "s", name: "Source", type: "other", homepageUrl: "http://example.com",
    }).success).toBe(true);
  });

  it.each(["news_outlet", "government", "international_organization", "research_institution", "nonprofit", "social_media", "other"])(
    "accepts SourceType %s",
    (value) => expect(SourceTypeSchema.safeParse(value).success).toBe(true),
  );

  it("rejects missing, invalid, null, empty, and unknown data", () => {
    const { name: _name, ...missingName } = sourceFixture;
    expect(SourceSchema.safeParse(missingName).success).toBe(false);
    expect(SourceSchema.safeParse({ ...sourceFixture, type: "blog" }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...sourceFixture, description: null }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...sourceFixture, name: "   " }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...sourceFixture, extra: true }).success).toBe(false);
    expect(SourceSchema.safeParse({ ...sourceFixture, homepageUrl: "ftp://example.com" }).success).toBe(false);
  });

  it("matches the Source domain type", () => {
    expectTypeOf<z.infer<typeof SourceSchema>>().toEqualTypeOf<Source>();
  });
});
