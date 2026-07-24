import { randomUUID } from "node:crypto";
import { RuleBasedQuestionIntentAnalyzer } from "./analyzer";
import { createSemanticFingerprint } from "./fingerprint";
import type {
  BriefingContract,
  BriefingDomain,
  BriefingQuestion,
  CompileBriefingResult,
  QuestionIntent,
  QuestionIntentAnalyzer,
  VisualMode,
} from "./models";
import {
  BriefingContractSchema,
  BriefingQuestionSchema,
  QuestionIntentAnalysisSchema,
} from "./validation";

const STANDARD_SECTIONS = [
  "Direct Answer", "Current Situation", "Necessary Background", "Explanation Path",
  "Counter Factors / Alternative Explanations", "What Is Confirmed",
  "What Is Uncertain", "What To Watch Next", "Sources",
];

const SECTION_OVERRIDES: Partial<Record<QuestionIntent, string[]>> = {
  "fact-verification": [
    "Claim", "Origin", "Supporting Evidence", "Contradicting Evidence",
    "Verdict", "Uncertainty", "Sources",
  ],
  comparison: [
    "Comparison Criteria", "Subject A", "Subject B", "Key Differences", "Reasons", "Sources",
  ],
  forecast: [
    "Current State", "Drivers", "Scenarios", "Assumptions", "Verification Signals", "Sources",
  ],
};

export interface BriefingCompilerOptions {
  analyzer?: QuestionIntentAnalyzer;
  now?: () => Date;
  createId?: () => string;
  policyVersion?: string;
}

export class BriefingContractCompiler {
  private readonly analyzer: QuestionIntentAnalyzer;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly policyVersion: string;

  constructor(options: BriefingCompilerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.policyVersion = options.policyVersion ?? "standard-v1";
    this.analyzer = options.analyzer ?? new RuleBasedQuestionIntentAnalyzer(this.now);
  }

  compile(input: unknown): CompileBriefingResult {
    const inputError = this.validateInput(input);
    if (inputError) return inputError;
    const parsed = BriefingQuestionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: { code: "INVALID_QUESTION", message: parsed.error.message } };
    }
    const question = parsed.data;

    try {
      const analysisResult = QuestionIntentAnalysisSchema.safeParse(this.analyzer.analyze(question));
      if (!analysisResult.success) {
        return {
          success: false,
          error: { code: "CONTRACT_COMPILATION_FAILED", message: analysisResult.error.message },
        };
      }
      const analysis = analysisResult.data;
      const createdAt = this.now().toISOString();
      const contract = this.buildContract(question, analysis, createdAt);
      contract.semanticFingerprint = this.fingerprint(question, contract);
      const contractResult = BriefingContractSchema.safeParse(contract);
      if (!contractResult.success) {
        return {
          success: false,
          error: { code: "INVALID_BRIEFING_CONTRACT", message: contractResult.error.message },
        };
      }
      return {
        success: true,
        outcome: contractResult.data.status,
        intentAnalysis: analysis,
        contract: contractResult.data,
        ...(analysis.ambiguity.clarificationQuestion
          ? { clarificationQuestion: analysis.ambiguity.clarificationQuestion }
          : {}),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CONTRACT_COMPILATION_FAILED",
          message: error instanceof Error ? error.message : "Contract compilation failed.",
        },
      };
    }
  }

  private validateInput(input: unknown): CompileBriefingResult | undefined {
    if (typeof input !== "object" || input === null) {
      return { success: false, error: { code: "INVALID_QUESTION", message: "Question must be an object." } };
    }
    const candidate = input as Record<string, unknown>;
    if (typeof candidate.text === "string" && candidate.text.trim().length === 0) {
      return { success: false, error: { code: "EMPTY_QUESTION", message: "Question text is empty." } };
    }
    if (typeof candidate.text === "string" && candidate.text.length > 2000) {
      return { success: false, error: { code: "QUESTION_TOO_LONG", message: "Question exceeds 2,000 characters." } };
    }
    if (candidate.language !== undefined && candidate.language !== "ko" && candidate.language !== "en") {
      return { success: false, error: { code: "UNSUPPORTED_LANGUAGE", message: "Only ko and en are supported." } };
    }
    return undefined;
  }

  private buildContract(
    question: BriefingQuestion,
    analysis: ReturnType<QuestionIntentAnalyzer["analyze"]>,
    createdAt: string,
  ): BriefingContract {
    const intent = analysis.primaryIntent;
    const defaultsApplied = analysis.ambiguity.status === "defaults-applied"
      ? ["forecast horizon: 3 months"]
      : [];
    const visual = this.visualPolicy(intent, analysis.domainSignals, analysis.mentionedLocations);
    const personalization = this.personalizationPolicy(question);
    const status = analysis.ambiguity.status === "clarification-required"
      ? "clarification-required"
      : analysis.ambiguity.status === "unsupported" ? "unsupported" : "ready";

    return {
      id: this.createId(),
      questionId: question.id,
      intentAnalysis: analysis,
      status,
      answerGoal: analysis.answerGoal,
      audience: "general",
      language: question.language,
      timeScope: {
        historicalStartPolicy: this.startPolicy(intent),
        focalPeriod: intent === "forecast" ? "current state" : "question-relevant period",
        ...(intent === "forecast" ? { forecastHorizon: "3 months" } : {}),
        temporalGranularity: intent === "forecast" ? "month" : "day",
        defaultsApplied,
      },
      geographicScope: {
        focalLocations: analysis.mentionedLocations,
        affectedLocations: [],
        userRelevantLocations: question.userProvidedContext?.locations ?? [],
        expansionPolicy: [
          "question-explicit locations", "directly connected event locations",
          "core impact path", "question endpoint",
        ],
        maximumLocationCount: 7,
        defaultsApplied: [],
      },
      domainScope: analysis.domainSignals,
      evidencePolicy: {
        minimumEvidencePerKeyStatement: 1,
        requirePrimarySourcesWhenAvailable: true,
        requireContradictingEvidence: true,
        requireIndependentSources: true,
        allowUnverifiedClaims: true,
        evidenceConfidenceThreshold: 0.4,
        sourceCategoryRequirements: ["authoritative primary source or independent corroboration"],
        citationGranularity: "statement",
      },
      uncertaintyPolicy: {
        requireKnownUnknowns: true,
        requireAlternativeExplanations: true,
        requireAssumptionsForForecasts: intent === "forecast",
        requireConfidenceLabels: true,
        prohibitFalsePrecision: true,
        separateFactFromInference: true,
        includeNextVerificationSignals: true,
      },
      visualPolicy: visual,
      explanationPolicy: {
        maximumCausalSteps: 6,
        maximumBackgroundItems: 3,
        directAnswerFirst: true,
        requireCounterFactors: true,
        requireAlternativeCauses: intent === "causal-explanation",
        requireMechanism: intent === "causal-explanation" || intent === "impact-analysis",
        startPointPolicy: this.startPolicy(intent),
        endpointPolicy: "stop when the answer goal is met",
        compressionPolicy: "retain only evidence-bearing steps and up to three necessary background items",
      },
      personalizationPolicy: personalization,
      sectionPolicy: { orderedSections: SECTION_OVERRIDES[intent] ?? STANDARD_SECTIONS },
      stopConditions: {
        maximumEvidenceItems: 30,
        maximumCausalSteps: 6,
        maximumScenes: 7,
        minimumEvidenceConfidence: 0.4,
        stopAtAnswerGoal: true,
        stopAtTimeBoundary: true,
        stopAtGeographicBoundary: true,
        stopWhenEvidenceWeakens: true,
      },
      warnings: [
        ...analysis.ambiguity.issues,
        ...(personalization.enabled ? ["Use only explicitly provided user context."] : []),
      ],
      createdAt,
      policyVersion: this.policyVersion,
      semanticFingerprint: "pending",
    };
  }

  private startPolicy(intent: QuestionIntent): BriefingContract["timeScope"]["historicalStartPolicy"] {
    if (intent === "causal-explanation") return "direct-trigger";
    if (intent === "impact-analysis") return "event-start";
    if (intent === "fact-verification" || intent === "comparison") return "nearest-sufficient-background";
    if (intent === "forecast") return "not-applicable";
    return "caller-specified";
  }

  private visualPolicy(
    intent: QuestionIntent,
    domains: BriefingDomain[],
    locations: string[],
  ): BriefingContract["visualPolicy"] {
    const preferred: VisualMode[] = [];
    const reasons: string[] = [];
    if (intent === "fact-verification") {
      preferred.push("evidence-board", "document");
      reasons.push("Verification benefits from claim-to-evidence traceability.");
    } else if (intent === "comparison") {
      preferred.push("comparison");
      reasons.push("A shared comparison frame exposes material differences.");
    } else if (intent === "forecast") {
      preferred.push("chart", "timeline");
      reasons.push("Scenarios and verification signals are time-dependent.");
    } else if (intent === "personalized-impact") {
      preferred.push("personalized-impact");
      reasons.push("The answer is scoped to caller-provided context.");
    }
    if (domains.includes("supply-chain")) {
      preferred.unshift("map-flow");
      reasons.unshift("Supply-chain movement has a spatial path.");
    } else if (domains.some((domain) => ["markets", "macroeconomics"].includes(domain))) {
      preferred.unshift("chart");
      reasons.unshift("Quantitative market or economic changes favor a chart.");
    } else if (domains.includes("law-policy")) {
      preferred.unshift("document", "timeline");
      reasons.unshift("Legal and policy questions depend on source documents and chronology.");
    }
    if (locations.length >= 2) {
      preferred.unshift("map");
      reasons.unshift("Multiple explicit locations make spatial comparison useful.");
    }
    const uniquePreferred = [...new Set(preferred)];
    return {
      mapUsage: locations.length >= 2 || domains.includes("supply-chain") ? "preferred" : "optional",
      allowedModes: [
        "map", "map-flow", "chart", "timeline", "document", "comparison",
        "evidence-board", "personalized-impact", "text",
      ],
      preferredModes: uniquePreferred.length > 0 ? uniquePreferred : ["text"],
      preferenceReasons: reasons.length > 0 ? [...new Set(reasons)] : ["No specialized visual is required."],
      maximumScenes: 7,
      requireVisualJustification: true,
      fallbackMode: "text",
    };
  }

  private personalizationPolicy(question: BriefingQuestion): BriefingContract["personalizationPolicy"] {
    const context = question.userProvidedContext;
    const candidates: Array<[BriefingContract["personalizationPolicy"]["targetType"], keyof NonNullable<typeof context>]> = [
      ["portfolio", "portfolioHoldings"], ["watchlist", "watchlist"], ["industry", "industries"],
      ["geographic", "locations"], ["country-risk", "countryRisk"],
    ];
    const selected = candidates.find(([, key]) => (context?.[key]?.length ?? 0) > 0);
    const enabled = question.personalizationRequested && selected !== undefined;
    return {
      enabled,
      targetType: enabled && selected ? selected[0] : "none",
      allowedUserContextFields: selected ? [selected[1]] : [],
      missingRequiredContext: question.personalizationRequested && !selected ? ["userProvidedContext"] : [],
      recommendationMode: enabled ? "exposure-analysis" : "information-only",
      privacyWarnings: enabled ? ["Do not infer user data beyond explicitly supplied context."] : [],
    };
  }

  private fingerprint(question: BriefingQuestion, contract: BriefingContract): string {
    const userContext = Object.fromEntries(
      Object.entries(question.userProvidedContext ?? {})
        .map(([key, values]) => [key, [...values].sort()]),
    );
    return createSemanticFingerprint({
      question: {
        text: question.text.trim().replace(/\s+/g, " "),
        language: question.language,
        conversationContext: question.conversationContext ?? [],
        referencedEventIds: [...question.referencedEventIds].sort(),
        referencedEntityIds: [...question.referencedEntityIds].sort(),
        userProvidedContext: userContext,
        personalizationRequested: question.personalizationRequested,
      },
      policyVersion: contract.policyVersion,
      intent: {
        primary: contract.intentAnalysis.primaryIntent,
        secondary: [...contract.intentAnalysis.secondaryIntents].sort(),
        domains: [...contract.intentAnalysis.domainSignals].sort(),
      },
      scopes: {
        time: contract.timeScope,
        geography: {
          ...contract.geographicScope,
          focalLocations: [...contract.geographicScope.focalLocations].sort(),
          affectedLocations: [...contract.geographicScope.affectedLocations].sort(),
          userRelevantLocations: [...contract.geographicScope.userRelevantLocations].sort(),
        },
        domain: [...contract.domainScope].sort(),
      },
      policies: {
        evidence: contract.evidencePolicy,
        uncertainty: contract.uncertaintyPolicy,
        visual: contract.visualPolicy,
        explanation: contract.explanationPolicy,
        personalization: contract.personalizationPolicy,
        sections: contract.sectionPolicy,
        stop: contract.stopConditions,
      },
    });
  }
}
