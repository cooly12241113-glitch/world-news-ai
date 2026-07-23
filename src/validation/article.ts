import * as z from "zod";
import type { Article } from "../domain";
import {
  IdSchema,
  ISODateStringSchema,
  LanguageCodeSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
  URLStringSchema,
} from "./common";

const UniqueNonEmptyStringArraySchema = z
  .array(NonEmptyStringSchema)
  .refine((values) => new Set(values).size === values.length);

export const ArticleSchema: z.ZodType<Article> = z.strictObject({
  id: IdSchema,
  sourceId: IdSchema,
  canonicalUrl: URLStringSchema,
  title: NonEmptyStringSchema,
  languageCode: LanguageCodeSchema,
  publishedAt: ISODateStringSchema,
  fetchedAt: ISODateStringSchema,
  authorNames: UniqueNonEmptyStringArraySchema,
  summary: NonEmptyStringSchema.optional(),
  bodyText: NonEmptyStringSchema.optional(),
  entityIds: UniqueIdArraySchema,
  topicIds: UniqueIdArraySchema,
  eventIds: UniqueIdArraySchema,
});
