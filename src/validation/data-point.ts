import * as z from "zod";
import type { DataPoint } from "../domain";
import {
  ConfidenceLevelSchema,
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
} from "./common";

export const DataPointValueSchema = z.union([
  NonEmptyStringSchema,
  z.number().finite(),
]);

export const DataPointSchema: z.ZodType<DataPoint> = z.strictObject({
  id: IdSchema,
  sourceDocumentId: IdSchema,
  name: NonEmptyStringSchema,
  value: DataPointValueSchema,
  unit: NonEmptyStringSchema.optional(),
  observedAt: ISODateStringSchema.optional(),
  confidence: ConfidenceLevelSchema,
  entityIds: UniqueIdArraySchema,
  eventIds: UniqueIdArraySchema,
});
