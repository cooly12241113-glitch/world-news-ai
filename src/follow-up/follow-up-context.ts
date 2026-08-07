import { z } from "zod";
import type {
  AnalysisTab,
  ManualMapViewState,
} from "../session/briefing-session";
import type { BriefingPresentationPreference } from "../script/models";
import { BriefingPresentationPreferenceSchema } from "../script/validation";

export interface EvidenceAllowlist {
  contextItemIds: string[];
  excerptIds: string[];
  provenanceRecordIds: string[];
  sourceDocumentIds: string[];
  claimIds: string[];
  evidenceLinkIds: string[];
  dataPointIds: string[];
}

export interface FollowUpContext {
  sessionId: string;
  currentSceneId: string;
  currentSceneIndex: number;
  scriptId: string;
  scriptFingerprint: string;
  contractId: string;
  contractFingerprint: string;
  planId: string;
  planFingerprint: string;
  contextPackageId: string;
  contextPackageFingerprint: string;
  availableSceneIds: string[];
  completedSceneIds: string[];
  remainingSceneIds: string[];
  visibleEvidenceIds: string[];
  evidenceAllowlist: EvidenceAllowlist;
  presentationPreference: BriefingPresentationPreference;
  selectedAnalysisTab: AnalysisTab;
  manualMapViewStatus: ManualMapViewState["status"];
  priorFollowUpId?: string;
  personalizedImpact?: {
    personalContextFingerprint: string;
    analysisFingerprint: string;
    exposureIds: string[];
    impactChannelIds: string[];
    impactAssessmentIds: string[];
    scenarioIds: string[];
  };
  policyVersion: string;
}

const Id = z.string().trim().min(1);
const UniqueIds = z.array(Id).refine((ids) => new Set(ids).size === ids.length, {
  message: "IDs must be unique.",
});

export const EvidenceAllowlistSchema = z.strictObject({
  contextItemIds: UniqueIds,
  excerptIds: UniqueIds,
  provenanceRecordIds: UniqueIds,
  sourceDocumentIds: UniqueIds,
  claimIds: UniqueIds,
  evidenceLinkIds: UniqueIds,
  dataPointIds: UniqueIds,
});

export const FollowUpContextSchema: z.ZodType<FollowUpContext> = z
  .strictObject({
    sessionId: Id,
    currentSceneId: Id,
    currentSceneIndex: z.number().int().nonnegative(),
    scriptId: Id,
    scriptFingerprint: Id,
    contractId: Id,
    contractFingerprint: Id,
    planId: Id,
    planFingerprint: Id,
    contextPackageId: Id,
    contextPackageFingerprint: Id,
    availableSceneIds: UniqueIds.min(1),
    completedSceneIds: UniqueIds,
    remainingSceneIds: UniqueIds,
    visibleEvidenceIds: UniqueIds,
    evidenceAllowlist: EvidenceAllowlistSchema,
    presentationPreference: BriefingPresentationPreferenceSchema,
    selectedAnalysisTab: z.enum([
      "key", "evidence", "limits", "uncertainty", "sources",
    ]),
    manualMapViewStatus: z.enum([
      "inactive", "active", "returning-to-briefing",
    ]),
    priorFollowUpId: Id.optional(),
    personalizedImpact: z.strictObject({
      personalContextFingerprint: Id,
      analysisFingerprint: Id,
      exposureIds: UniqueIds.min(1),
      impactChannelIds: UniqueIds.min(1),
      impactAssessmentIds: UniqueIds.min(1),
      scenarioIds: UniqueIds,
    }).optional(),
    policyVersion: Id,
  })
  .superRefine((context, refinement) => {
    const available = new Set(context.availableSceneIds);
    if (!available.has(context.currentSceneId)) {
      refinement.addIssue({ code: "custom", message: "Current scene is unavailable." });
    }
    for (const id of [...context.completedSceneIds, ...context.remainingSceneIds]) {
      if (!available.has(id)) {
        refinement.addIssue({ code: "custom", message: "Scene partition exceeds available scenes." });
      }
    }
    const allowedEvidence = new Set(Object.values(context.evidenceAllowlist).flat());
    if (context.visibleEvidenceIds.some((id) => !allowedEvidence.has(id))) {
      refinement.addIssue({ code: "custom", message: "Visible evidence exceeds the allowlist." });
    }
  });
