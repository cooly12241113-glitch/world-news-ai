export type QuestionIntent =
  | "causal-explanation"
  | "impact-analysis"
  | "fact-verification"
  | "comparison"
  | "forecast"
  | "personalized-impact"
  | "situation-summary"
  | "exploratory";

export interface UserProvidedContext {
  locations?: string[];
  industries?: string[];
  portfolioHoldings?: string[];
  watchlist?: string[];
  countryRisk?: string[];
}

export interface BriefingQuestion {
  id: string;
  text: string;
  language: "ko" | "en";
  submittedAt: string;
  conversationContext?: string[];
  referencedEventIds: string[];
  referencedEntityIds: string[];
  userProvidedContext?: UserProvidedContext;
  personalizationRequested: boolean;
}

export interface QuestionAmbiguity {
  status:
    | "clear"
    | "defaults-applied"
    | "clarification-required"
    | "unsupported";
  issues: string[];
  missingInformation: string[];
  resolvableWithDefaults: boolean;
  clarificationQuestion?: string;
}

export interface IntentConfidence {
  score: number;
  reasons: string[];
}

export interface QuestionIntentAnalysis {
  questionId: string;
  primaryIntent: QuestionIntent;
  secondaryIntents: QuestionIntent[];
  answerGoal: string;
  targetSubjects: string[];
  targetOutcomes: string[];
  mentionedLocations: string[];
  mentionedEntities: string[];
  temporalSignals: string[];
  domainSignals: BriefingDomain[];
  personalizationSignals: string[];
  ambiguity: QuestionAmbiguity;
  confidence: IntentConfidence;
  reasons: string[];
  analyzedBy: "rule" | "ai" | "human";
  analyzedAt: string;
}

export type BriefingDomain =
  | "geopolitics"
  | "security"
  | "diplomacy"
  | "law-policy"
  | "macroeconomics"
  | "markets"
  | "trade"
  | "supply-chain"
  | "technology"
  | "corporate"
  | "democracy-governance"
  | "personal-finance";

export type VisualMode =
  | "map"
  | "map-flow"
  | "chart"
  | "timeline"
  | "document"
  | "comparison"
  | "evidence-board"
  | "personalized-impact"
  | "text";

export interface BriefingContract {
  id: string;
  questionId: string;
  intentAnalysis: QuestionIntentAnalysis;
  status: "ready" | "clarification-required" | "unsupported";
  answerGoal: string;
  audience: "general";
  language: "ko" | "en";
  timeScope: {
    historicalStartPolicy:
      | "direct-trigger"
      | "nearest-sufficient-background"
      | "caller-specified"
      | "event-start"
      | "not-applicable";
    focalPeriod: string;
    forecastHorizon?: string;
    temporalGranularity: "hour" | "day" | "week" | "month" | "year";
    defaultsApplied: string[];
  };
  geographicScope: {
    focalLocations: string[];
    affectedLocations: string[];
    userRelevantLocations: string[];
    expansionPolicy: string[];
    maximumLocationCount: number;
    defaultsApplied: string[];
  };
  domainScope: BriefingDomain[];
  evidencePolicy: {
    minimumEvidencePerKeyStatement: number;
    requirePrimarySourcesWhenAvailable: boolean;
    requireContradictingEvidence: boolean;
    requireIndependentSources: boolean;
    allowUnverifiedClaims: boolean;
    evidenceConfidenceThreshold: number;
    sourceCategoryRequirements: string[];
    citationGranularity: "briefing" | "section" | "statement";
  };
  uncertaintyPolicy: {
    requireKnownUnknowns: boolean;
    requireAlternativeExplanations: boolean;
    requireAssumptionsForForecasts: boolean;
    requireConfidenceLabels: boolean;
    prohibitFalsePrecision: boolean;
    separateFactFromInference: boolean;
    includeNextVerificationSignals: boolean;
  };
  visualPolicy: {
    mapUsage: "required" | "preferred" | "optional" | "disabled";
    allowedModes: VisualMode[];
    preferredModes: VisualMode[];
    preferenceReasons: string[];
    maximumScenes: number;
    requireVisualJustification: boolean;
    fallbackMode: VisualMode;
  };
  explanationPolicy: {
    maximumCausalSteps: number;
    maximumBackgroundItems: number;
    directAnswerFirst: boolean;
    requireCounterFactors: boolean;
    requireAlternativeCauses: boolean;
    requireMechanism: boolean;
    startPointPolicy: string;
    endpointPolicy: string;
    compressionPolicy: string;
  };
  personalizationPolicy: {
    enabled: boolean;
    targetType:
      | "none"
      | "geographic"
      | "industry"
      | "portfolio"
      | "watchlist"
      | "country-risk";
    allowedUserContextFields: string[];
    missingRequiredContext: string[];
    recommendationMode:
      | "information-only"
      | "exposure-analysis"
      | "scenario-analysis";
    privacyWarnings: string[];
  };
  sectionPolicy: { orderedSections: string[] };
  stopConditions: {
    maximumEvidenceItems: number;
    maximumCausalSteps: number;
    maximumScenes: number;
    minimumEvidenceConfidence: number;
    stopAtAnswerGoal: boolean;
    stopAtTimeBoundary: boolean;
    stopAtGeographicBoundary: boolean;
    stopWhenEvidenceWeakens: boolean;
  };
  warnings: string[];
  createdAt: string;
  policyVersion: string;
  semanticFingerprint: string;
}

export type CompileBriefingResult =
  | {
      success: true;
      outcome: "ready" | "clarification-required" | "unsupported";
      intentAnalysis: QuestionIntentAnalysis;
      contract: BriefingContract;
      clarificationQuestion?: string;
    }
  | {
      success: false;
      error: {
        code:
          | "EMPTY_QUESTION"
          | "QUESTION_TOO_LONG"
          | "INVALID_QUESTION"
          | "UNSUPPORTED_LANGUAGE"
          | "INTENT_UNCERTAIN"
          | "AMBIGUOUS_REFERENCE"
          | "MISSING_PERSONALIZATION_CONTEXT"
          | "UNSUPPORTED_QUESTION"
          | "INVALID_BRIEFING_CONTRACT"
          | "POLICY_CONFLICT"
          | "CONTRACT_COMPILATION_FAILED";
        message: string;
      };
    };

export interface QuestionIntentAnalyzer {
  readonly id: string;
  readonly version: string;
  analyze(question: BriefingQuestion): QuestionIntentAnalysis;
}

export interface BriefingSessionRepository {
  save(question: BriefingQuestion, contract: BriefingContract): void;
}
