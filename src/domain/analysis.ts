import type {
  ConfidenceLevel,
  Id,
  ISODateString,
} from "./common";

export type AnalysisTargetType =
  | "article"
  | "event"
  | "entity"
  | "topic";

export type AnalysisKind =
  | "summary"
  | "impact"
  | "relationship"
  | "scenario"
  | "fact_check"
  | "trend";

export interface Analysis {
  id: Id;

  targetType: AnalysisTargetType;
  targetId: Id;
  kind: AnalysisKind;

  title: string;
  summary: string;
  keyPoints: string[];

  confidence: ConfidenceLevel;
  evidenceArticleIds: Id[];
  caveats: string[];

  modelName: string;
  generatedAt: ISODateString;
}
