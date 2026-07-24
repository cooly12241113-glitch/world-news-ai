import * as z from "zod";
import {
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
} from "../validation";
import type {
  BriefingContract,
  BriefingQuestion,
  QuestionIntentAnalysis,
} from "./models";

const StringArray = z.array(NonEmptyStringSchema);
const DomainSchema = z.enum([
  "geopolitics", "security", "diplomacy", "law-policy", "macroeconomics",
  "markets", "trade", "supply-chain", "technology", "corporate",
  "democracy-governance", "personal-finance",
]);
const IntentSchema = z.enum([
  "causal-explanation", "impact-analysis", "fact-verification", "comparison",
  "forecast", "personalized-impact", "situation-summary", "exploratory",
]);
const VisualModeSchema = z.enum([
  "map", "map-flow", "chart", "timeline", "document", "comparison",
  "evidence-board", "personalized-impact", "text",
]);

export const BriefingQuestionSchema: z.ZodType<BriefingQuestion> = z.strictObject({
  id: IdSchema,
  text: z.string().min(1).max(2000).refine((value) => value.trim().length > 0),
  language: z.enum(["ko", "en"]),
  submittedAt: ISODateStringSchema,
  conversationContext: StringArray.max(10).optional(),
  referencedEventIds: UniqueIdArraySchema,
  referencedEntityIds: UniqueIdArraySchema,
  userProvidedContext: z.strictObject({
    locations: StringArray.optional(),
    industries: StringArray.optional(),
    portfolioHoldings: StringArray.optional(),
    watchlist: StringArray.optional(),
    countryRisk: StringArray.optional(),
  }).optional(),
  personalizationRequested: z.boolean(),
});

const AmbiguitySchema = z.strictObject({
  status: z.enum(["clear", "defaults-applied", "clarification-required", "unsupported"]),
  issues: StringArray,
  missingInformation: StringArray,
  resolvableWithDefaults: z.boolean(),
  clarificationQuestion: NonEmptyStringSchema.optional(),
});

export const QuestionIntentAnalysisSchema: z.ZodType<QuestionIntentAnalysis> =
  z.strictObject({
    questionId: IdSchema,
    primaryIntent: IntentSchema,
    secondaryIntents: z.array(IntentSchema),
    answerGoal: NonEmptyStringSchema,
    targetSubjects: StringArray,
    targetOutcomes: StringArray,
    mentionedLocations: StringArray,
    mentionedEntities: StringArray,
    temporalSignals: StringArray,
    domainSignals: z.array(DomainSchema),
    personalizationSignals: StringArray,
    ambiguity: AmbiguitySchema,
    confidence: z.strictObject({
      score: z.number().min(0).max(1),
      reasons: StringArray.min(1),
    }),
    reasons: StringArray.min(1),
    analyzedBy: z.enum(["rule", "ai", "human"]),
    analyzedAt: ISODateStringSchema,
  });

export const BriefingContractSchema: z.ZodType<BriefingContract> = z.strictObject({
  id: IdSchema,
  questionId: IdSchema,
  intentAnalysis: QuestionIntentAnalysisSchema,
  status: z.enum(["ready", "clarification-required", "unsupported"]),
  answerGoal: NonEmptyStringSchema,
  audience: z.literal("general"),
  language: z.enum(["ko", "en"]),
  timeScope: z.strictObject({
    historicalStartPolicy: z.enum(["direct-trigger", "nearest-sufficient-background", "caller-specified", "event-start", "not-applicable"]),
    focalPeriod: NonEmptyStringSchema,
    forecastHorizon: NonEmptyStringSchema.optional(),
    temporalGranularity: z.enum(["hour", "day", "week", "month", "year"]),
    defaultsApplied: StringArray,
  }),
  geographicScope: z.strictObject({
    focalLocations: StringArray, affectedLocations: StringArray,
    userRelevantLocations: StringArray, expansionPolicy: StringArray,
    maximumLocationCount: z.number().int().positive().max(7),
    defaultsApplied: StringArray,
  }),
  domainScope: z.array(DomainSchema),
  evidencePolicy: z.strictObject({
    minimumEvidencePerKeyStatement: z.number().int().positive(),
    requirePrimarySourcesWhenAvailable: z.boolean(),
    requireContradictingEvidence: z.boolean(),
    requireIndependentSources: z.boolean(),
    allowUnverifiedClaims: z.boolean(),
    evidenceConfidenceThreshold: z.number().min(0).max(1),
    sourceCategoryRequirements: StringArray,
    citationGranularity: z.enum(["briefing", "section", "statement"]),
  }),
  uncertaintyPolicy: z.strictObject({
    requireKnownUnknowns: z.boolean(), requireAlternativeExplanations: z.boolean(),
    requireAssumptionsForForecasts: z.boolean(), requireConfidenceLabels: z.boolean(),
    prohibitFalsePrecision: z.boolean(), separateFactFromInference: z.boolean(),
    includeNextVerificationSignals: z.boolean(),
  }),
  visualPolicy: z.strictObject({
    mapUsage: z.enum(["required", "preferred", "optional", "disabled"]),
    allowedModes: z.array(VisualModeSchema),
    preferredModes: z.array(VisualModeSchema),
    preferenceReasons: StringArray,
    maximumScenes: z.number().int().positive().max(7),
    requireVisualJustification: z.boolean(),
    fallbackMode: VisualModeSchema,
  }),
  explanationPolicy: z.strictObject({
    maximumCausalSteps: z.number().int().positive().max(6),
    maximumBackgroundItems: z.number().int().nonnegative().max(3),
    directAnswerFirst: z.boolean(), requireCounterFactors: z.boolean(),
    requireAlternativeCauses: z.boolean(), requireMechanism: z.boolean(),
    startPointPolicy: NonEmptyStringSchema, endpointPolicy: NonEmptyStringSchema,
    compressionPolicy: NonEmptyStringSchema,
  }),
  personalizationPolicy: z.strictObject({
    enabled: z.boolean(),
    targetType: z.enum(["none", "geographic", "industry", "portfolio", "watchlist", "country-risk"]),
    allowedUserContextFields: StringArray,
    missingRequiredContext: StringArray,
    recommendationMode: z.enum(["information-only", "exposure-analysis", "scenario-analysis"]),
    privacyWarnings: StringArray,
  }),
  sectionPolicy: z.strictObject({ orderedSections: StringArray.min(1) }),
  stopConditions: z.strictObject({
    maximumEvidenceItems: z.number().int().positive(),
    maximumCausalSteps: z.number().int().positive().max(6),
    maximumScenes: z.number().int().positive().max(7),
    minimumEvidenceConfidence: z.number().min(0).max(1),
    stopAtAnswerGoal: z.boolean(), stopAtTimeBoundary: z.boolean(),
    stopAtGeographicBoundary: z.boolean(), stopWhenEvidenceWeakens: z.boolean(),
  }),
  warnings: StringArray,
  createdAt: ISODateStringSchema,
  policyVersion: NonEmptyStringSchema,
  semanticFingerprint: NonEmptyStringSchema,
});
