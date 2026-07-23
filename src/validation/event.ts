import * as z from "zod";
import type { Event } from "../domain";
import {
  ConfidenceLevelSchema,
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
} from "./common";

export const EventStatusSchema = z.enum([
  "reported",
  "developing",
  "confirmed",
  "disputed",
  "resolved",
  "archived",
]);

const EventObjectSchema = z.strictObject({
  id: IdSchema,
  title: NonEmptyStringSchema,
  summary: NonEmptyStringSchema,
  status: EventStatusSchema,
  confidence: ConfidenceLevelSchema,
  startedAt: ISODateStringSchema.optional(),
  endedAt: ISODateStringSchema.optional(),
  articleIds: UniqueIdArraySchema,
  entityIds: UniqueIdArraySchema,
  topicIds: UniqueIdArraySchema,
  locationEntityIds: UniqueIdArraySchema,
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

export const EventSchema: z.ZodType<Event> = EventObjectSchema.superRefine(
  (event, context) => {
    if (
      event.startedAt !== undefined &&
      event.endedAt !== undefined &&
      Date.parse(event.endedAt) < Date.parse(event.startedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "endedAt must not precede startedAt",
      });
    }

    if (Date.parse(event.updatedAt) < Date.parse(event.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt must not precede createdAt",
      });
    }
  },
);
