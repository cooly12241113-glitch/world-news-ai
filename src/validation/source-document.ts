import * as z from "zod";
import type { SourceDocument } from "../domain";
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

export const DocumentTypeSchema = z.enum([
  "NewsArticle",
  "GovernmentDocument",
  "StatisticalDataset",
  "VideoTranscript",
  "ResearchReport",
  "LegalDocument",
  "CorporateDisclosure",
]);

export const SourceDocumentSchema: z.ZodType<SourceDocument> = z.strictObject({
  id: IdSchema,
  sourceId: IdSchema,
  documentType: DocumentTypeSchema,
  canonicalUrl: URLStringSchema,
  title: NonEmptyStringSchema,
  languageCode: LanguageCodeSchema,
  publishedAt: ISODateStringSchema.optional(),
  retrievedAt: ISODateStringSchema,
  authorNames: UniqueNonEmptyStringArraySchema,
  summary: NonEmptyStringSchema.optional(),
  contentText: NonEmptyStringSchema.optional(),
  entityIds: UniqueIdArraySchema,
  topicIds: UniqueIdArraySchema,
  eventIds: UniqueIdArraySchema,
});
