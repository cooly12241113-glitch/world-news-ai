import { z } from "zod";
import {
  createExposureId,
  exposureSemanticKey,
  normalizePersonalizationText,
  personalImpactContextFingerprint,
} from "./fingerprint";
import type {
  PersonalImpactContext,
  PersonalImpactContextInput,
  PersonalImpactContextValidationResult,
  UserExposure,
  UserExposureInput,
} from "./models";

const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
const ExposureId = z.string().regex(/^exposure:[a-z-]+:[a-f0-9]{64}$/u);
const CountryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/u);
const CurrencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/u);
const NormalizedLabel = z.string()
  .transform(normalizePersonalizationText)
  .pipe(z.string().min(1).max(100));

const GeographyExposureInputSchema = z.strictObject({
  dimension: z.literal("geography"),
  countryCode: CountryCode,
});
const CurrencyExposureInputSchema = z.strictObject({
  dimension: z.literal("currency"),
  currencyCode: CurrencyCode,
});
const IndustryExposureInputSchema = z.strictObject({
  dimension: z.literal("industry"),
  industry: NormalizedLabel,
});
const AssetClassExposureInputSchema = z.strictObject({
  dimension: z.literal("asset-class"),
  assetClass: z.enum(["cash", "equity", "fixed-income", "commodity", "real-estate"]),
});
const EmploymentBusinessExposureInputSchema = z.strictObject({
  dimension: z.literal("employment-business"),
  industry: NormalizedLabel,
  relationship: z.enum(["employment", "business-owner", "contractor"]),
});
const ConsumptionExposureInputSchema = z.strictObject({
  dimension: z.literal("consumption"),
  category: z.enum(["fuel", "food", "housing", "utilities", "transportation"]),
});
const SupplyChainExposureInputSchema = z.strictObject({
  dimension: z.literal("supply-chain"),
  industry: NormalizedLabel,
  relationship: z.enum(["imports", "exports", "supplier", "buyer"]),
});

const exposureIdentity = {
  exposureId: ExposureId,
  source: z.literal("user-provided-explicit"),
};

export const UserExposureInputSchema: z.ZodType<UserExposureInput> =
  z.discriminatedUnion("dimension", [
    GeographyExposureInputSchema,
    CurrencyExposureInputSchema,
    IndustryExposureInputSchema,
    AssetClassExposureInputSchema,
    EmploymentBusinessExposureInputSchema,
    ConsumptionExposureInputSchema,
    SupplyChainExposureInputSchema,
  ]);

export const UserExposureSchema: z.ZodType<UserExposure> =
  z.discriminatedUnion("dimension", [
    GeographyExposureInputSchema.extend(exposureIdentity),
    CurrencyExposureInputSchema.extend(exposureIdentity),
    IndustryExposureInputSchema.extend(exposureIdentity),
    AssetClassExposureInputSchema.extend(exposureIdentity),
    EmploymentBusinessExposureInputSchema.extend(exposureIdentity),
    ConsumptionExposureInputSchema.extend(exposureIdentity),
    SupplyChainExposureInputSchema.extend(exposureIdentity),
  ]).superRefine((exposure, refinement) => {
    if (exposure.exposureId !== createExposureId(exposure)) {
      refinement.addIssue({
        code: "custom",
        path: ["exposureId"],
        message: "Exposure ID does not match its semantic fields.",
      });
    }
    if (containsSensitiveAttributeValue(exposure)) {
      refinement.addIssue({
        code: "custom",
        message: "Sensitive attributes cannot be represented as an exposure.",
      });
    }
  });

export const PersonalizationConsentSchema = z.strictObject({
  enabled: z.boolean(),
  purpose: z.literal("personalized-impact-analysis"),
});

export const CallerScopeSchema = z.strictObject({
  lifetime: z.literal("request-run"),
  propagation: z.literal("explicit-only"),
});

const contextShape = {
  contextVersion: z.literal("1"),
  consent: PersonalizationConsentSchema,
  callerScope: CallerScopeSchema,
  exposures: z.array(UserExposureSchema).max(20),
};

function addContextIssues(
  context: PersonalImpactContextInput,
  refinement: z.RefinementCtx,
): void {
  if (!context.consent.enabled && context.exposures.length > 0) {
    refinement.addIssue({
      code: "custom",
      path: ["exposures"],
      message: "Disabled personalization cannot carry exposures.",
    });
  }

  const semanticKeys = new Set<string>();
  for (const [index, exposure] of context.exposures.entries()) {
    const semanticKey = exposureSemanticKey(exposure);
    if (semanticKeys.has(semanticKey)) {
      refinement.addIssue({
        code: "custom",
        path: ["exposures", index],
        message: "Duplicate semantic exposure is not allowed.",
      });
    }
    semanticKeys.add(semanticKey);
  }
}

const PersonalImpactContextInputSchema: z.ZodType<PersonalImpactContextInput> =
  z.strictObject(contextShape).superRefine(addContextIssues);

export const PersonalImpactContextSchema: z.ZodType<PersonalImpactContext> =
  z.strictObject({
    ...contextShape,
    semanticFingerprint: Fingerprint,
  }).superRefine((context, refinement) => {
    addContextIssues(context, refinement);
    if (context.semanticFingerprint !== personalImpactContextFingerprint(context)) {
      refinement.addIssue({
        code: "custom",
        path: ["semanticFingerprint"],
        message: "Personal impact context fingerprint is invalid.",
      });
    }
  });

export function createUserExposure(input: unknown): UserExposure {
  const exposure = UserExposureInputSchema.parse(input);
  return UserExposureSchema.parse({
    ...exposure,
    exposureId: createExposureId(exposure),
    source: "user-provided-explicit",
  });
}

export function createPersonalImpactContext(input: unknown): PersonalImpactContext {
  const parsed = PersonalImpactContextInputSchema.parse(input);
  const exposures = [...parsed.exposures].sort((left, right) =>
    exposureSemanticKey(left).localeCompare(exposureSemanticKey(right))
  );
  return PersonalImpactContextSchema.parse({
    ...parsed,
    exposures,
    semanticFingerprint: personalImpactContextFingerprint({ ...parsed, exposures }),
  });
}

export function validatePersonalImpactContext(
  input: unknown,
): PersonalImpactContextValidationResult {
  const parsed = PersonalImpactContextSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      outcome: "invalid",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  return {
    success: true,
    outcome: !parsed.data.consent.enabled
      ? "disabled"
      : parsed.data.exposures.length === 0
        ? "enabled-no-exposures"
        : "enabled",
    context: parsed.data,
  };
}

const SENSITIVE_ATTRIBUTE_VALUES = new Set([
  "health-status",
  "race",
  "ethnicity",
  "race-ethnicity",
  "religion",
  "political-affiliation",
  "sexual-orientation",
  "criminal-history",
  "건강 상태",
  "인종",
  "민족",
  "종교",
  "정치 성향",
  "성적 지향",
  "범죄 이력",
].map(canonicalSensitiveAttributeValue));

function containsSensitiveAttributeValue(exposure: UserExposure): boolean {
  if (!("industry" in exposure)) return false;
  return SENSITIVE_ATTRIBUTE_VALUES.has(canonicalSensitiveAttributeValue(exposure.industry));
}

function canonicalSensitiveAttributeValue(value: string): string {
  return normalizePersonalizationText(value)
    .toLocaleLowerCase("en-US")
    .replace(/[\s_]+/gu, "-");
}
