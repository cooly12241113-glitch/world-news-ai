import type { Id } from "./common";

export interface Topic {
  id: Id;
  name: string;
  slug: string;

  description?: string;
  parentTopicId?: Id;
}
