import { createSemanticFingerprint } from "../briefing/fingerprint";
import type {
  PersonalImpactContext,
  PersonalImpactContextInput,
  UserExposure,
  UserExposureInput,
} from "./models";

export function normalizePersonalizationText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function exposureSemanticValue(
  exposure: UserExposure | UserExposureInput,
): Record<string, string> {
  switch (exposure.dimension) {
    case "geography":
      return { dimension: exposure.dimension, countryCode: exposure.countryCode.toUpperCase() };
    case "currency":
      return { dimension: exposure.dimension, currencyCode: exposure.currencyCode.toUpperCase() };
    case "industry":
      return { dimension: exposure.dimension, industry: normalizePersonalizationText(exposure.industry) };
    case "asset-class":
      return { dimension: exposure.dimension, assetClass: exposure.assetClass };
    case "employment-business":
      return {
        dimension: exposure.dimension,
        industry: normalizePersonalizationText(exposure.industry),
        relationship: exposure.relationship,
      };
    case "consumption":
      return { dimension: exposure.dimension, category: exposure.category };
    case "supply-chain":
      return {
        dimension: exposure.dimension,
        industry: normalizePersonalizationText(exposure.industry),
        relationship: exposure.relationship,
      };
  }
}

export function exposureSemanticKey(
  exposure: UserExposure | UserExposureInput,
): string {
  return createSemanticFingerprint(exposureSemanticValue(exposure));
}

export function createExposureId(exposure: UserExposureInput): string {
  return `exposure:${exposure.dimension}:${exposureSemanticKey(exposure)}`;
}

export function personalImpactContextFingerprint(
  context: PersonalImpactContext | PersonalImpactContextInput,
): string {
  const exposures = context.exposures
    .map(exposureSemanticValue)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createSemanticFingerprint({
    contextVersion: context.contextVersion,
    enabled: context.consent.enabled,
    purpose: context.consent.purpose,
    callerScope: context.callerScope,
    exposures,
  });
}
