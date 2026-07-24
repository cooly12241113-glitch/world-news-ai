import type { ConfidenceLevel, Id, ISODateString } from "./common";

export type DataPointValue = string | number;

export interface DataPoint {
  id: Id;
  sourceDocumentId: Id;
  name: string;
  value: DataPointValue;
  unit?: string;
  observedAt?: ISODateString;
  confidence: ConfidenceLevel;
  entityIds: Id[];
  eventIds: Id[];
}
