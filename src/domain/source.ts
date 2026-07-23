import type {
  CountryCode,
  Id,
  LanguageCode,
  URLString,
} from "./common";

export type SourceType =
  | "news_outlet"
  | "government"
  | "international_organization"
  | "research_institution"
  | "nonprofit"
  | "social_media"
  | "other";

export interface Source {
  id: Id;
  name: string;
  type: SourceType;
  homepageUrl: URLString;
  countryCode?: CountryCode;
  primaryLanguageCode?: LanguageCode;
  description?: string;
}
