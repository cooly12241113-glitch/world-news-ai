import type { ConfidenceLevel, Id, ISODateString } from "./common";

export interface Claim {
  id: Id;
  sourceDocumentId: Id;
  statement: string;
  confidence: ConfidenceLevel;
  attributedEntityIds: Id[];
  eventIds: Id[];
  extractedAt: ISODateString;
}
