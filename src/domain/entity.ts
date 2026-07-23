import type { CountryCode, Id } from "./common";

export type EntityType =
  | "person"
  | "country"
  | "government"
  | "company"
  | "organization"
  | "international_organization"
  | "military_group"
  | "political_party"
  | "location"
  | "other";

export interface Entity {
  id: Id;
  type: EntityType;
  canonicalName: string;

  aliases: string[];
  countryCode?: CountryCode;
  description?: string;
}
