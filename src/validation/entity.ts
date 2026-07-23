import * as z from "zod";
import type { Entity } from "../domain";
import {
  CountryCodeSchema,
  IdSchema,
  NonEmptyStringSchema,
} from "./common";

const UniqueNonEmptyStringArraySchema = z
  .array(NonEmptyStringSchema)
  .refine((values) => new Set(values).size === values.length);

export const EntityTypeSchema = z.enum([
  "person",
  "country",
  "government",
  "company",
  "organization",
  "international_organization",
  "military_group",
  "political_party",
  "location",
  "other",
]);

export const EntitySchema: z.ZodType<Entity> = z.strictObject({
  id: IdSchema,
  type: EntityTypeSchema,
  canonicalName: NonEmptyStringSchema,
  aliases: UniqueNonEmptyStringArraySchema,
  countryCode: CountryCodeSchema.optional(),
  description: NonEmptyStringSchema.optional(),
});
