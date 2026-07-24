import * as z from "zod";
import type { Claim } from "../domain";
import {
  ConfidenceLevelSchema,
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
} from "./common";

export const ClaimSchema: z.ZodType<Claim> = z.strictObject({
  id: IdSchema,
  sourceDocumentId: IdSchema,
  statement: NonEmptyStringSchema,
  confidence: ConfidenceLevelSchema,
  attributedEntityIds: UniqueIdArraySchema,
  eventIds: UniqueIdArraySchema,
  extractedAt: ISODateStringSchema,
});
