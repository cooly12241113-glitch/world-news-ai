import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Event } from "../../domain";
import { EventSchema, EventStatusSchema } from "../event";
import { eventFixture } from "./fixtures";

describe("EventSchema", () => {
  it("accepts complete and minimal events with empty arrays", () => {
    expect(EventSchema.parse({ ...eventFixture })).toEqual(eventFixture);
    const { startedAt: _start, endedAt: _end, ...minimal } = eventFixture;
    expect(EventSchema.safeParse({
      ...minimal, articleIds: [], entityIds: [], topicIds: [], locationEntityIds: [],
    }).success).toBe(true);
  });

  it.each(["reported", "developing", "confirmed", "disputed", "resolved", "archived"])(
    "accepts EventStatus %s",
    (value) => expect(EventStatusSchema.safeParse(value).success).toBe(true),
  );

  it("allows equal boundary timestamps", () => {
    expect(EventSchema.safeParse({
      ...eventFixture,
      endedAt: eventFixture.startedAt,
      updatedAt: eventFixture.createdAt,
    }).success).toBe(true);
  });

  it("rejects reversed event and record timestamps", () => {
    expect(EventSchema.safeParse({
      ...eventFixture, endedAt: "2026-07-24T00:30:00.000Z",
    }).success).toBe(false);
    expect(EventSchema.safeParse({
      ...eventFixture, updatedAt: "2026-07-24T03:30:00.000Z",
    }).success).toBe(false);
  });

  it("rejects invalid structure and duplicate IDs", () => {
    const { articleIds: _articles, ...missingArticles } = eventFixture;
    expect(EventSchema.safeParse(missingArticles).success).toBe(false);
    expect(EventSchema.safeParse({ ...eventFixture, status: "open" }).success).toBe(false);
    expect(EventSchema.safeParse({ ...eventFixture, startedAt: null }).success).toBe(false);
    expect(EventSchema.safeParse({ ...eventFixture, summary: " " }).success).toBe(false);
    expect(EventSchema.safeParse({ ...eventFixture, articleIds: ["a", "a"] }).success).toBe(false);
    expect(EventSchema.safeParse({ ...eventFixture, extra: true }).success).toBe(false);
  });

  it("matches the Event domain type", () => {
    expectTypeOf<z.infer<typeof EventSchema>>().toEqualTypeOf<Event>();
  });
});
