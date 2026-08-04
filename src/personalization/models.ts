export const PERSONALIZATION_PURPOSES = [
  "personalized-impact-analysis",
] as const;

export type PersonalizationPurpose =
  (typeof PERSONALIZATION_PURPOSES)[number];

export interface PersonalizationConsent {
  enabled: boolean;
  purpose: PersonalizationPurpose;
}

export interface CallerScope {
  lifetime: "request-run";
  propagation: "explicit-only";
}

interface ExplicitExposure {
  exposureId: string;
  source: "user-provided-explicit";
}

export interface GeographyExposure extends ExplicitExposure {
  dimension: "geography";
  countryCode: string;
}

export interface CurrencyExposure extends ExplicitExposure {
  dimension: "currency";
  currencyCode: string;
}

export interface IndustryExposure extends ExplicitExposure {
  dimension: "industry";
  industry: string;
}

export interface AssetClassExposure extends ExplicitExposure {
  dimension: "asset-class";
  assetClass: "cash" | "equity" | "fixed-income" | "commodity" | "real-estate";
}

export interface EmploymentBusinessExposure extends ExplicitExposure {
  dimension: "employment-business";
  industry: string;
  relationship: "employment" | "business-owner" | "contractor";
}

export interface ConsumptionExposure extends ExplicitExposure {
  dimension: "consumption";
  category: "fuel" | "food" | "housing" | "utilities" | "transportation";
}

export interface SupplyChainExposure extends ExplicitExposure {
  dimension: "supply-chain";
  industry: string;
  relationship: "imports" | "exports" | "supplier" | "buyer";
}

export type UserExposure =
  | GeographyExposure
  | CurrencyExposure
  | IndustryExposure
  | AssetClassExposure
  | EmploymentBusinessExposure
  | ConsumptionExposure
  | SupplyChainExposure;

export type ExposureDimension = UserExposure["dimension"];

type WithoutIdentity<T> = Omit<T, "exposureId" | "source">;

export type UserExposureInput = UserExposure extends infer Exposure
  ? Exposure extends UserExposure
    ? WithoutIdentity<Exposure>
    : never
  : never;

export interface PersonalImpactContext {
  contextVersion: "1";
  consent: PersonalizationConsent;
  callerScope: CallerScope;
  exposures: UserExposure[];
  semanticFingerprint: string;
}

export type PersonalImpactContextInput = Omit<
  PersonalImpactContext,
  "semanticFingerprint"
>;

export type PersonalImpactContextValidationResult =
  | {
      success: true;
      outcome: "disabled" | "enabled-no-exposures" | "enabled";
      context: PersonalImpactContext;
    }
  | {
      success: false;
      outcome: "invalid";
      issues: Array<{ path: string; message: string }>;
    };
