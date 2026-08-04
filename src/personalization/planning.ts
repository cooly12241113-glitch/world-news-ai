import { z } from "zod";
import type { PersonalImpactContext, UserExposure } from "./models";
import type {
  ImpactAssessment,
  ImpactChannel,
  ImpactCondition,
  ImpactScenario,
  PersonalizedImpactAnalysis,
} from "./impact-models";
import {
  ImpactAssessmentSchema,
  ImpactChannelSchema,
  ImpactConditionSchema,
  ImpactScenarioSchema,
} from "./impact-validation";

export interface SafeExposureDescriptor {
  exposureId: string;
  dimension: UserExposure["dimension"];
  canonicalSubject: string;
}

export interface PersonalizedImpactPlanningContext {
  personalContextFingerprint: string;
  analysisFingerprint: string;
  evidenceContextFingerprint: string;
  exposures: SafeExposureDescriptor[];
  conditions: ImpactCondition[];
  channels: ImpactChannel[];
  assessments: ImpactAssessment[];
  scenarios: ImpactScenario[];
}

const Id = z.string().trim().min(1);
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);

export const SafeExposureDescriptorSchema: z.ZodType<SafeExposureDescriptor> =
  z.strictObject({
    exposureId: Id,
    dimension: z.enum([
      "geography",
      "currency",
      "industry",
      "asset-class",
      "employment-business",
      "consumption",
      "supply-chain",
    ]),
    canonicalSubject: Id,
  });

export const PersonalizedImpactPlanningContextSchema:
z.ZodType<PersonalizedImpactPlanningContext> = z.strictObject({
  personalContextFingerprint: Fingerprint,
  analysisFingerprint: Fingerprint,
  evidenceContextFingerprint: Fingerprint,
  exposures: z.array(SafeExposureDescriptorSchema),
  conditions: z.array(ImpactConditionSchema),
  channels: z.array(ImpactChannelSchema),
  assessments: z.array(ImpactAssessmentSchema),
  scenarios: z.array(ImpactScenarioSchema),
});

export function createPersonalizedImpactPlanningContext(
  context: PersonalImpactContext,
  analysis: PersonalizedImpactAnalysis,
): PersonalizedImpactPlanningContext {
  if (context.semanticFingerprint !== analysis.personalContextFingerprint) {
    throw new Error("PERSONAL_CONTEXT_FINGERPRINT_MISMATCH");
  }
  return PersonalizedImpactPlanningContextSchema.parse({
    personalContextFingerprint: context.semanticFingerprint,
    analysisFingerprint: analysis.semanticFingerprint,
    evidenceContextFingerprint: analysis.evidenceContextFingerprint,
    exposures: context.exposures.map(toSafeExposure).sort(byExposureId),
    conditions: analysis.conditions,
    channels: analysis.channels,
    assessments: analysis.assessments,
    scenarios: analysis.scenarios,
  });
}

export function requiresPersonalizedImpactRebuild(
  currentPersonalContextFingerprint: string,
  nextPersonalContextFingerprint: string,
): boolean {
  return currentPersonalContextFingerprint !== nextPersonalContextFingerprint;
}

function toSafeExposure(exposure: UserExposure): SafeExposureDescriptor {
  const canonicalSubject = (() => {
    switch (exposure.dimension) {
      case "geography": return exposure.countryCode;
      case "currency": return exposure.currencyCode;
      case "industry": return exposure.industry;
      case "asset-class": return exposure.assetClass;
      case "employment-business": return `${exposure.industry}:${exposure.relationship}`;
      case "consumption": return exposure.category;
      case "supply-chain": return `${exposure.industry}:${exposure.relationship}`;
    }
  })();
  return { exposureId: exposure.exposureId, dimension: exposure.dimension, canonicalSubject };
}

function byExposureId(left: SafeExposureDescriptor, right: SafeExposureDescriptor): number {
  return left.exposureId.localeCompare(right.exposureId);
}
