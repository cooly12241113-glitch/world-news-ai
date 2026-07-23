import type {
  Id,
  ISODateString,
  LanguageCode,
  URLString,
} from "./common";

export interface Article {
  id: Id;
  sourceId: Id;
  canonicalUrl: URLString;
  title: string;
  languageCode: LanguageCode;
  publishedAt: ISODateString;
  fetchedAt: ISODateString;

  authorNames: string[];
  summary?: string;
  bodyText?: string;

  entityIds: Id[];
  topicIds: Id[];
  eventIds: Id[];
}
