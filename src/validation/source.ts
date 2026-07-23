import * as z from "zod";
import type { Source } from "../domain";
import {
  CountryCodeSchema,
  IdSchema,
  LanguageCodeSchema,
  NonEmptyStringSchema,
  URLStringSchema,
} from "./common";

export const SourceTypeSchema = z.enum([
  "news_outlet",
  "government",
  "international_organization",
  "research_institution",
  "nonprofit",
  "social_media",
  "other",
]);

export const SourceSchema: z.ZodType<Source> = z.strictObject({
  id: IdSchema,
  name: NonEmptyStringSchema,
  type: SourceTypeSchema,
  homepageUrl: URLStringSchema,
  countryCode: CountryCodeSchema.optional(),
  primaryLanguageCode: LanguageCodeSchema.optional(),
  description: NonEmptyStringSchema.optional(),
});
