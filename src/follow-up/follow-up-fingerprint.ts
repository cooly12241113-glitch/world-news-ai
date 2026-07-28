import {
  createSemanticFingerprint,
  createSha256Fingerprint,
} from "../briefing/fingerprint";
import type { FollowUpRequest } from "./follow-up-request";
import type { ReplanDecision } from "./replan-decision";
import { normalizeFollowUpText } from "./follow-up-normalizer";

export function followUpContentHash(text: string): string {
  return createSha256Fingerprint(normalizeFollowUpText(text));
}

export function followUpFingerprint(request: FollowUpRequest): string {
  return createSemanticFingerprint({
    normalizedContentHash: followUpContentHash(request.text),
    locale: request.locale,
    parentQuestionId: request.parentQuestionId,
    expectedSessionFingerprint: request.expectedSessionFingerprint,
    currentSceneId: request.currentSceneId,
    policyVersion: request.policyVersion,
  });
}

export function replanDecisionFingerprint(
  decision: Omit<ReplanDecision, "semanticFingerprint"> | ReplanDecision,
): string {
  return createSemanticFingerprint({
    scope: decision.scope,
    confidenceBand: decision.confidenceBand,
    matchedRuleCodes: [...decision.matchedRuleCodes].sort(),
    preservesCurrentScript: decision.preservesCurrentScript,
    requiresReplacementScript: decision.requiresReplacementScript,
    requiresNewEvidence: decision.requiresNewEvidence,
    suggestedSceneMappingPolicy: decision.suggestedSceneMappingPolicy,
    requestedPresentationPreference: decision.requestedPresentationPreference,
    policyVersion: decision.policyVersion,
  });
}
