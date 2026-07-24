import type { ConfidenceLevel, Id, ISODateString } from "./common";

export type EvidenceTargetType = "claim" | "data_point" | "event" | "analysis";

export type EvidenceRelation =
  | "supports"
  | "contradicts"
  | "contextualizes"
  | "derived_from";

export interface EvidenceLink {
  id: Id;
  sourceDocumentId: Id;
  targetType: EvidenceTargetType;
  targetId: Id;
  relation: EvidenceRelation;
  locator?: string;
  excerpt?: string;
  confidence: ConfidenceLevel;
  createdAt: ISODateString;
}
