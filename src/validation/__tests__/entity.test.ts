import * as z from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Entity } from "../../domain";
import { EntitySchema, EntityTypeSchema } from "../entity";
import { entityFixture } from "./fixtures";

describe("EntitySchema", () => {
  it("accepts complete and minimal entities with empty aliases", () => {
    expect(EntitySchema.parse({ ...entityFixture })).toEqual(entityFixture);
    expect(EntitySchema.safeParse({
      id: "e", type: "other", canonicalName: "Entity", aliases: [],
    }).success).toBe(true);
  });

  it.each(["person", "country", "government", "company", "organization", "international_organization", "military_group", "political_party", "location", "other"])(
    "accepts EntityType %s",
    (value) => expect(EntityTypeSchema.safeParse(value).success).toBe(true),
  );

  it("rejects invalid structure and values", () => {
    const { aliases: _aliases, ...missingAliases } = entityFixture;
    expect(EntitySchema.safeParse(missingAliases).success).toBe(false);
    expect(EntitySchema.safeParse({ ...entityFixture, type: "planet" }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...entityFixture, description: null }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...entityFixture, canonicalName: "" }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...entityFixture, aliases: ["Korea", "Korea"] }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...entityFixture, unknown: true }).success).toBe(false);
  });

  it("matches the Entity domain type", () => {
    expectTypeOf<z.infer<typeof EntitySchema>>().toEqualTypeOf<Entity>();
  });
});
