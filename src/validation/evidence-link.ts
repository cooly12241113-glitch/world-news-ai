import * as z from "zod";
import type { EvidenceLink } from "../domain";
import {
  ConfidenceLevelSchema,
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
} from "./common";

export const EvidenceTargetTypeSchema = z.enum([
  "claim",
  "data_point",
  "event",
  "analysis",
]);

export const EvidenceRelationSchema = z.enum([
  "supports",
  "contradicts",
  "contextualizes",
  "derived_from",
]);

export const EvidenceLinkSchema: z.ZodType<EvidenceLink> = z.strictObject({
  id: IdSchema,
  sourceDocumentId: IdSchema,
  targetType: EvidenceTargetTypeSchema,
  targetId: IdSchema,
  relation: EvidenceRelationSchema,
  locator: NonEmptyStringSchema.optional(),
  excerpt: NonEmptyStringSchema.optional(),
  confidence: ConfidenceLevelSchema,
  createdAt: ISODateStringSchema,
});
