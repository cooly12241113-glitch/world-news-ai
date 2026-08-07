import type { FollowUpContext } from "./follow-up-context";
import { FollowUpContextSchema } from "./follow-up-context";
import { replanDecisionFingerprint } from "./follow-up-fingerprint";
import type { FollowUpRequest } from "./follow-up-request";
import { FollowUpRequestSchema } from "./follow-up-request";
import type { FollowUpRuleCode, ReplanDecision } from "./replan-decision";

export interface FollowUpClassifierPolicy {
  decisionId: string;
  policyVersion: string;
}

type Rule = {
  code: FollowUpRuleCode;
  expressions: RegExp[];
};

const RULES: Record<
  Exclude<ReplanDecision["scope"], "clarification-required">,
  Rule
> = {
  unsupported: {
    code: "UNSUPPORTED_SYSTEM_ACTION",
    expressions: [
      /(?:delete|remove)\s+(?:a\s+)?file|system\s+command|change\s+(?:my\s+)?account|buy\s+or\s+sell/iu,
      /파일(?:을|를)?\s*(?:삭제|지워)|시스템\s*(?:명령|제어)|계정\s*변경|매수|매도|근거\s*없이.*사실/iu,
    ],
  },
  "rebuild-entire-briefing": {
    code: "FULL_REBUILD_RESTART",
    expressions: [
      /start\s+over|rebuild\s+the\s+whole\s+briefing|explain\s+everything\s+for\s+a\s+beginner|switch\s+to\s+a\s+different\s+topic/iu,
      /처음부터.*다시|전체.*초보자|완전히\s*다른\s*주제|브리핑\s*전체.*재구성/iu,
    ],
  },
  "replace-remaining-scenes": {
    code: "REPLACE_REMAINING_FROM_HERE",
    expressions: [
      /from\s+here\s+onward|replace\s+the\s+remaining\s+scenes|redo\s+the\s+rest|change\s+the\s+next\s+sections/iu,
      /여기서부터\s*다시|이후\s*장면.*바꿔|남은\s*부분|다음\s*장면부터.*재구성/iu,
    ],
  },
  "append-scenes": {
    code: "APPEND_IMPACT_SCENE",
    expressions: [
      /add\s+a\s+scene|also\s+cover\s+the\s+impact|append\s+a\s+comparison|add\s+this\s+at\s+the\s+end/iu,
      /경제\s*영향.*추가|산업\s*영향.*추가|별도\s*장면|마지막에\s*비교.*추가/iu,
    ],
  },
  "revise-current-scene": {
    code: "CURRENT_SCENE_COUNTEREVIDENCE",
    expressions: [
      /revise\s+this\s+scene|add\s+counterevidence\s+here|expand\s+this\s+scene|compare\s+within\s+this\s+scene/iu,
      /이\s*장면.*추가|현재\s*장면.*수정|반대\s*근거.*보여|이\s*부분.*자세히|같은\s*장면.*비교/iu,
    ],
  },
  "answer-current-context": {
    code: "CURRENT_CONTEXT_SOURCE_REQUEST",
    expressions: [
      /source|evidence|where\s+did\s+this\s+number\s+come\s+from|support\s+for\s+this\s+claim|citation/iu,
      /출처|(?<!반대\s)근거|이\s*수치|이\s*데이터|어디서\s*나온|확실해|증거\s*보여/iu,
    ],
  },
};

const AMBIGUOUS = [
  /what\s+did\s+they\s+do|explain\s+what\s+they\s+did|do\s+that\s+again/iu,
  /그\s*사람.*왜|그것만.*줄여|저거.*다시|그게\s*뭐야/iu,
];

const PERSONALIZED_RULES: Array<{
  scope: "answer-current-context" | "rebuild-entire-briefing";
  code: FollowUpRuleCode;
  expressions: RegExp[];
  requiresScenario?: boolean;
}> = [
  {
    scope: "rebuild-entire-briefing",
    code: "FULL_REBUILD_REMOVE_PERSONALIZATION",
    expressions: [
      /(?:remove|without|exclude)\s+(?:my\s+)?personal(?:ization|\s+information|\s+context)/iu,
      /개인화\s*정보(?:는|를)?\s*(?:빼|제외)|개인\s*정보(?:는|를)?\s*(?:빼|제외)/iu,
    ],
  },
  {
    scope: "rebuild-entire-briefing",
    code: "FULL_REBUILD_PERSONAL_CONTEXT_CHANGE",
    expressions: [
      /assume\s+(?:that\s+)?i\s+(?:do\s+not|don't)\s+(?:hold|have|own)\s+usd/iu,
      /달러\s*보유(?:가|는)?\s*없(?:다고|는\s*것으로)|usd\s*보유(?:가|는)?\s*없/iu,
    ],
  },
  {
    scope: "answer-current-context",
    code: "CURRENT_CONTEXT_PERSONAL_IMPACT_EXPLANATION",
    expressions: [
      /why\s+(?:does|would|could)\s+(?:this|it)\s+(?:affect|impact)\s+me/iu,
      /왜\s*(?:나한테|내게|나에게)\s*(?:영향|관련)/iu,
    ],
  },
  {
    scope: "answer-current-context",
    code: "CURRENT_CONTEXT_VALIDATED_COUNTER_SCENARIO",
    expressions: [
      /(?:show|explain)\s+(?:the\s+)?(?:opposite|counter)\s+scenario/iu,
      /반대\s*시나리오(?:도)?\s*(?:보여|설명)/iu,
    ],
    requiresScenario: true,
  },
];

function matches(text: string, rule: Rule): boolean {
  return rule.expressions.some((expression) => expression.test(text));
}

export function classifyFollowUp(
  requestInput: FollowUpRequest,
  contextInput: FollowUpContext,
  policy: FollowUpClassifierPolicy,
): ReplanDecision {
  const request = FollowUpRequestSchema.parse(requestInput);
  const context = FollowUpContextSchema.parse(contextInput);
  if (
    request.sessionId !== context.sessionId ||
    request.currentSceneId !== context.currentSceneId ||
    request.scriptFingerprint !== context.scriptFingerprint ||
    request.contextPackageFingerprint !== context.contextPackageFingerprint
  ) {
    throw new Error("Follow-up request does not match its captured context.");
  }

  const text = request.text;
  const personalizedRule = context.personalizedImpact && PERSONALIZED_RULES.find((rule) =>
    (!rule.requiresScenario || context.personalizedImpact!.scenarioIds.length > 0) &&
    rule.expressions.some((expression) => expression.test(text))
  );
  if (personalizedRule) {
    const replacement = personalizedRule.scope === "rebuild-entire-briefing";
    const decisionWithoutFingerprint: Omit<ReplanDecision, "semanticFingerprint"> = {
      decisionId: policy.decisionId,
      followUpId: request.followUpId,
      scope: personalizedRule.scope,
      confidenceBand: "high",
      matchedRuleCodes: [personalizedRule.code],
      preservesCurrentScript: !replacement,
      requiresReplacementScript: replacement,
      requiresNewEvidence: false,
      ...(replacement
        ? { suggestedSceneMappingPolicy: "restart-at-opening" as const }
        : {}),
      policyVersion: policy.policyVersion,
    };
    return {
      ...decisionWithoutFingerprint,
      semanticFingerprint: replanDecisionFingerprint(decisionWithoutFingerprint),
    };
  }
  const matchedScopes = (Object.keys(RULES) as Array<keyof typeof RULES>)
    .filter((scope) => matches(text, RULES[scope]));
  let scope: ReplanDecision["scope"];
  let code: FollowUpRuleCode;
  let confidence: ReplanDecision["confidenceBand"] = "high";

  if (matchedScopes.includes("unsupported")) {
    scope = "unsupported"; code = RULES.unsupported.code;
  } else if (AMBIGUOUS.some((expression) => expression.test(text))) {
    scope = "clarification-required"; code = "AMBIGUOUS_REFERENT";
  } else {
    const contentScopes = matchedScopes.filter((item) => item !== "unsupported");
    if (contentScopes.length > 1) {
      scope = "clarification-required";
      code = "COMPOUND_SCOPE_REQUIRES_CLARIFICATION";
      confidence = "medium";
    } else if (contentScopes.length === 1) {
      scope = contentScopes[0]!;
      code = RULES[scope].code;
    } else {
      scope = "clarification-required";
      code = "NO_EXPLICIT_SCOPE";
      confidence = "low";
    }
  }

  const replacement = [
    "revise-current-scene", "append-scenes", "replace-remaining-scenes",
    "rebuild-entire-briefing",
  ].includes(scope);
  const decisionWithoutFingerprint: Omit<ReplanDecision, "semanticFingerprint"> = {
    decisionId: policy.decisionId,
    followUpId: request.followUpId,
    scope,
    confidenceBand: confidence,
    matchedRuleCodes: [code],
    ...(scope === "clarification-required"
      ? { clarificationReason: "The target or requested scope is not unambiguous." }
      : {}),
    ...(scope === "unsupported"
      ? { unsupportedReason: "The request is outside the supported evidence and product boundary." }
      : {}),
    preservesCurrentScript: !replacement,
    requiresReplacementScript: replacement,
    requiresNewEvidence: false,
    ...(scope === "revise-current-scene"
      ? { suggestedSceneMappingPolicy: "map-to-replacement-scene" as const }
      : scope === "append-scenes"
        ? { suggestedSceneMappingPolicy: "preserve-current-scene" as const }
        : scope === "replace-remaining-scenes"
          ? { suggestedSceneMappingPolicy: "map-to-nearest-preceding-scene" as const }
          : scope === "rebuild-entire-briefing"
            ? { suggestedSceneMappingPolicy: "restart-at-opening" as const }
            : {}),
    ...(request.requestedPresentationPreference
      ? { requestedPresentationPreference: request.requestedPresentationPreference }
      : {}),
    policyVersion: policy.policyVersion,
  };
  return {
    ...decisionWithoutFingerprint,
    semanticFingerprint: replanDecisionFingerprint(decisionWithoutFingerprint),
  };
}
