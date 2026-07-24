import type {
  BriefingDomain,
  BriefingQuestion,
  QuestionIntent,
  QuestionIntentAnalysis,
  QuestionIntentAnalyzer,
} from "./models";

const INTENT_RULES: ReadonlyArray<{
  intent: QuestionIntent;
  patterns: RegExp[];
  goal: string;
}> = [
  { intent: "causal-explanation", patterns: [/왜|원인|배경|어떻게\s*시작|why|cause|background/i], goal: "Explain the causes and mechanism." },
  { intent: "impact-analysis", patterns: [/영향|파급|어떻게\s*미치|effect|impact|consequence/i], goal: "Assess direct and downstream impacts." },
  { intent: "fact-verification", patterns: [/사실인가|진짜인가|맞나|검증|true|verify|fact[\s-]?check/i], goal: "Verify the claim against evidence." },
  { intent: "comparison", patterns: [/비교|차이|어느\s*쪽|versus|\bvs\.?\b|compare|difference/i], goal: "Compare the subjects using shared criteria." },
  { intent: "forecast", patterns: [/앞으로|가능성|전망|어떻게\s*될|forecast|likely|probability/i], goal: "Describe evidence-bound scenarios and verification signals." },
  { intent: "personalized-impact", patterns: [/나의|내\s|보유|포트폴리오|자산|\bmy\b|portfolio|holdings/i], goal: "Assess impact within user-provided context." },
  { intent: "situation-summary", patterns: [/요약|현재\s*상황|무슨\s*일|summary|what\s+happened|situation/i], goal: "Summarize the current situation." },
];

const DOMAIN_RULES: ReadonlyArray<[BriefingDomain, RegExp]> = [
  ["security", /전쟁|군사|안보|충돌|war|military|security|conflict/i],
  ["diplomacy", /외교|협상|정상회담|diplomacy|negotiation|summit/i],
  ["law-policy", /법안|법률|규제|판결|law|legal|regulation|ruling/i],
  ["macroeconomics", /경제|물가|인플레이션|고용|gdp|economy|inflation|employment/i],
  ["markets", /시장|주가|금리|환율|채권|market|stock|interest rate|exchange rate|bond/i],
  ["trade", /무역|관세|수출|수입|trade|tariff|export|import/i],
  ["supply-chain", /공급망|물류|운송|supply chain|logistics|shipping/i],
  ["technology", /기술|반도체|인공지능|technology|semiconductor|\bai\b/i],
  ["corporate", /기업|회사|실적|공시|corporate|company|earnings|disclosure/i],
  ["democracy-governance", /선거|민주주의|정부|의회|election|democracy|government|parliament/i],
  ["personal-finance", /포트폴리오|자산|보유|portfolio|holdings|personal finance/i],
  ["geopolitics", /지정학|국제|국가|국경|geopolitic|international|border/i],
];

const TEMPORAL_PATTERNS = [
  /오늘|현재|지금|이번\s*(?:주|달|분기|년)|향후\s*\d+\s*(?:일|주|개월|년)/gi,
  /\b(?:today|now|current(?:ly)?|this\s+(?:week|month|quarter|year)|next\s+\d+\s+(?:days?|weeks?|months?|years?))\b/gi,
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class RuleBasedQuestionIntentAnalyzer implements QuestionIntentAnalyzer {
  readonly id = "rule-based-question-intent";
  readonly version = "1.0.0";

  constructor(private readonly now: () => Date = () => new Date()) {}

  analyze(question: BriefingQuestion): QuestionIntentAnalysis {
    const text = question.text.trim();
    const scored = INTENT_RULES.map((rule, order) => {
      const matches = rule.patterns.filter((pattern) => pattern.test(text)).length;
      const contextualBoost =
        rule.intent === "personalized-impact" &&
        (question.personalizationRequested || /나의|내\s|보유|포트폴리오|자산|\bmy\b|portfolio|holdings/i.test(text))
          ? 2
          : 0;
      return { ...rule, order, score: matches + contextualBoost };
    }).filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.order - right.order);

    const primary = scored[0] ?? {
      intent: "exploratory" as const,
      goal: "Explore the question within explicit evidence and scope boundaries.",
      score: 1,
      order: INTENT_RULES.length,
      patterns: [],
    };
    const secondaryIntents = unique(scored.slice(1).map((item) => item.intent));
    const domains = DOMAIN_RULES.filter(([, pattern]) => pattern.test(text)).map(([domain]) => domain);
    const temporalSignals = unique(TEMPORAL_PATTERNS.flatMap((pattern) => text.match(pattern) ?? []));
    const personalizationSignals = [
      ...(question.personalizationRequested ? ["explicit-personalization-request"] : []),
      ...(question.userProvidedContext ? ["caller-provided-context"] : []),
    ];
    const ambiguity = this.evaluateAmbiguity(question, primary.intent, temporalSignals);
    const score = Math.min(0.98, 0.5 + primary.score * 0.15 + (scored.length > 0 ? 0.1 : 0));

    return {
      questionId: question.id,
      primaryIntent: primary.intent,
      secondaryIntents,
      answerGoal: primary.goal,
      targetSubjects: unique([...question.referencedEventIds, ...question.referencedEntityIds]),
      targetOutcomes: secondaryIntents.map((intent) => `Address ${intent}.`),
      mentionedLocations: unique(question.userProvidedContext?.locations ?? []),
      mentionedEntities: [...question.referencedEntityIds],
      temporalSignals,
      domainSignals: unique(domains),
      personalizationSignals,
      ambiguity,
      confidence: {
        score,
        reasons: scored.length > 0
          ? [`Matched ${primary.score} deterministic signal(s) for ${primary.intent}.`]
          : ["No specialized signal dominated; exploratory intent is the safe baseline."],
      },
      reasons: scored.length > 0
        ? scored.map((item) => `${item.intent}: ${item.score} signal(s)`)
        : ["Applied the exploratory fallback."],
      analyzedBy: "rule",
      analyzedAt: this.now().toISOString(),
    };
  }

  private evaluateAmbiguity(
    question: BriefingQuestion,
    intent: QuestionIntent,
    temporalSignals: string[],
  ): QuestionIntentAnalysis["ambiguity"] {
    const issues: string[] = [];
    const missingInformation: string[] = [];
    let clarificationQuestion: string | undefined;
    const hasReferences = question.referencedEventIds.length + question.referencedEntityIds.length > 0;
    if (/(이것|그것|이\s*사안|\bthis\b|\bthat\b|\bit\b)/i.test(question.text) && !hasReferences) {
      issues.push("The referenced subject is not identifiable.");
      missingInformation.push("referenced subject");
      clarificationQuestion = question.language === "ko"
        ? "어떤 사건이나 대상을 가리키는지 알려주세요."
        : "Which event or subject are you referring to?";
    }
    if (
      intent === "comparison" &&
      question.referencedEventIds.length + question.referencedEntityIds.length < 2 &&
      /어느\s*쪽|which\s+one/i.test(question.text)
    ) {
      issues.push("The comparison subjects or criteria are incomplete.");
      missingInformation.push("comparison subjects and criteria");
      clarificationQuestion ??= question.language === "ko"
        ? "비교할 두 대상과 기준을 알려주세요."
        : "Which two subjects and criteria should be compared?";
    }
    const context = question.userProvidedContext;
    const hasPersonalContext = context !== undefined &&
      Object.values(context).some((values) => values !== undefined && values.length > 0);
    if ((question.personalizationRequested || intent === "personalized-impact") && !hasPersonalContext) {
      issues.push("Personalization was requested without user-provided context.");
      missingInformation.push("personalization context");
      clarificationQuestion ??= question.language === "ko"
        ? "영향을 분석할 지역, 산업, 보유 자산 또는 관심 목록을 알려주세요."
        : "Provide a location, industry, holding, or watchlist for the impact analysis.";
    }
    if (issues.length > 0) {
      return {
        status: "clarification-required",
        issues,
        missingInformation,
        resolvableWithDefaults: false,
        clarificationQuestion,
      };
    }
    if (intent === "forecast" && temporalSignals.length === 0) {
      return {
        status: "defaults-applied",
        issues: ["No forecast horizon was specified."],
        missingInformation: [],
        resolvableWithDefaults: true,
      };
    }
    if (!/[\p{L}\p{N}]/u.test(question.text)) {
      return {
        status: "unsupported",
        issues: ["The question has no interpretable text."],
        missingInformation: [],
        resolvableWithDefaults: false,
      };
    }
    return { status: "clear", issues: [], missingInformation: [], resolvableWithDefaults: false };
  }
}
