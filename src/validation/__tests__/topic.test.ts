import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Topic } from "../../domain";
import { TopicSchema } from "../topic";
import { topicFixture } from "./fixtures";

describe("TopicSchema", () => {
  it("accepts complete and minimal topics", () => {
    expect(TopicSchema.parse({ ...topicFixture })).toEqual(topicFixture);
    expect(TopicSchema.safeParse({ id: "t", name: "AI 2026", slug: "ai-2026" }).success).toBe(true);
  });

  it.each(["Middle-East", "middle_east", "-middle-east", "middle-east-"])(
    "rejects invalid slug %s",
    (slug) => expect(TopicSchema.safeParse({ ...topicFixture, slug }).success).toBe(false),
  );

  it("rejects self-reference and invalid structure", () => {
    expect(TopicSchema.safeParse({ ...topicFixture, parentTopicId: topicFixture.id }).success).toBe(false);
    const { slug: _slug, ...missingSlug } = topicFixture;
    expect(TopicSchema.safeParse(missingSlug).success).toBe(false);
    expect(TopicSchema.safeParse({ ...topicFixture, description: null }).success).toBe(false);
    expect(TopicSchema.safeParse({ ...topicFixture, name: "  " }).success).toBe(false);
    expect(TopicSchema.safeParse({ ...topicFixture, extra: true }).success).toBe(false);
  });

  it("matches the Topic domain type", () => {
    expectTypeOf<z.infer<typeof TopicSchema>>().toEqualTypeOf<Topic>();
  });
});
