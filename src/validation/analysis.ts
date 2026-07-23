import * as z from "zod";
import type { Analysis } from "../domain";
import {
  ConfidenceLevelSchema,
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
} from "./common";

const UniqueNonEmptyStringArraySchema = z
  .array(NonEmptyStringSchema)
  .refine((values) => new Set(values).size === values.length);

export const AnalysisTargetTypeSchema = z.enum([
  "article",
  "event",
  "entity",
  "topic",
]);

export const AnalysisKindSchema = z.enum([
  "summary",
  "impact",
  "relationship",
  "scenario",
  "fact_check",
  "trend",
]);

export const AnalysisSchema: z.ZodType<Analysis> = z.strictObject({
  id: IdSchema,
  targetType: AnalysisTargetTypeSchema,
  targetId: IdSchema,
  kind: AnalysisKindSchema,
  title: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  keyPoints: UniqueNonEmptyStringArraySchema,
  confidence: ConfidenceLevelSchema,
  evidenceArticleIds: UniqueIdArraySchema,
  caveats: UniqueNonEmptyStringArraySchema,
  modelName: NonEmptyStringSchema,
  generatedAt: ISODateStringSchema,
});
