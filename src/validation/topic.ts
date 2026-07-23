import * as z from "zod";
import type { Topic } from "../domain";
import { IdSchema, NonEmptyStringSchema } from "./common";

const TopicObjectSchema = z.strictObject({
  id: IdSchema,
  name: NonEmptyStringSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: NonEmptyStringSchema.optional(),
  parentTopicId: IdSchema.optional(),
});

export const TopicSchema: z.ZodType<Topic> = TopicObjectSchema.refine(
  (topic) => topic.parentTopicId !== topic.id,
  { path: ["parentTopicId"] },
);
