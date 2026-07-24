import type {
  Id,
  ISODateString,
  LanguageCode,
  URLString,
} from "./common";

export type DocumentType =
  | "NewsArticle"
  | "GovernmentDocument"
  | "StatisticalDataset"
  | "VideoTranscript"
  | "ResearchReport"
  | "LegalDocument"
  | "CorporateDisclosure";

export interface SourceDocument {
  id: Id;
  sourceId: Id;
  documentType: DocumentType;
  canonicalUrl: URLString;
  title: string;
  languageCode: LanguageCode;
  publishedAt?: ISODateString;
  retrievedAt: ISODateString;

  authorNames: string[];
  summary?: string;
  contentText?: string;

  entityIds: Id[];
  topicIds: Id[];
  eventIds: Id[];
}
