import type { BriefingContract } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import type { ValidatedExplanationPlan } from "../explanation";
import type { EvidenceAllowlist, FollowUpContext } from "../follow-up";
import {
  BriefingScriptValidator,
  briefingScriptFingerprint,
  type BriefingScriptDraft,
  type ValidatedBriefingScript,
} from "../script";

export interface ReplacementValidationInput {
  script: BriefingScriptDraft;
  plan: ValidatedExplanationPlan;
  contract: BriefingContract;
  contextPackage: EvidenceContextPackage;
  followUpContext: FollowUpContext;
}

export interface ValidatedReplacement {
  script: ValidatedBriefingScript;
  evidenceAllowlist: EvidenceAllowlist;
}

export function evidenceAllowlistFromContext(
  context: EvidenceContextPackage,
): EvidenceAllowlist {
  const unique = (values: string[]) => [...new Set(values)].sort();
  return {
    contextItemIds: unique(context.selectedItems.map((item) => item.id)),
    excerptIds: unique(context.excerpts.map((excerpt) => excerpt.id)),
    provenanceRecordIds: unique(
      context.provenanceIndex.map((record) => record.provenanceId),
    ),
    sourceDocumentIds: unique(context.selectedItems.flatMap((item) => item.sourceDocumentIds)),
    claimIds: unique(context.selectedItems.flatMap((item) => [
      ...item.supportsClaimIds, ...item.contradictsClaimIds,
    ])),
    evidenceLinkIds: unique(context.selectedItems
      .filter((item) => item.itemType === "evidence-link")
      .map((item) => item.recordId)),
    dataPointIds: unique(context.selectedItems.flatMap((item) => item.dataPointIds)),
  };
}

export function validateReplacement(
  input: ReplacementValidationInput,
): ValidatedReplacement {
  if (briefingScriptFingerprint(input.script) !== input.script.fingerprint) {
    throw new Error("Replacement Script fingerprint is invalid.");
  }
  const validation = new BriefingScriptValidator().validate(
    input.script,
    input.plan,
    input.contract,
    input.contextPackage,
  );
  if (!("script" in validation)) {
    throw new Error(`Replacement Script failed validation: ${validation.issues.map((issue) => issue.code).join(",")}`);
  }
  const allowlist = evidenceAllowlistFromContext(input.contextPackage);
  const allowed = new Set(Object.values(allowlist).flat());
  const referenced = input.script.scenes.flatMap((scene) =>
    scene.contentBindings.flatMap((binding) => [
      ...binding.contextItemIds,
      ...binding.excerptIds,
      ...binding.provenanceRecordIds,
      ...binding.sourceDocumentIds,
      ...binding.claimIds,
      ...binding.evidenceLinkIds,
      ...binding.dataPointIds,
    ]),
  );
  if (referenced.some((id) => !allowed.has(id))) {
    throw new Error("Replacement Script contains an unknown evidence ID.");
  }
  return { script: validation.script, evidenceAllowlist: allowlist };
}
