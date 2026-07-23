import type {
  ConfidenceLevel,
  Id,
  ISODateString,
} from "./common";

export type EventStatus =
  | "reported"
  | "developing"
  | "confirmed"
  | "disputed"
  | "resolved"
  | "archived";

export interface Event {
  id: Id;
  title: string;
  summary: string;

  status: EventStatus;
  confidence: ConfidenceLevel;

  startedAt?: ISODateString;
  endedAt?: ISODateString;

  articleIds: Id[];
  entityIds: Id[];
  topicIds: Id[];
  locationEntityIds: Id[];

  createdAt: ISODateString;
  updatedAt: ISODateString;
}
