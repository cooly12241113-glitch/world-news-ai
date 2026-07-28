import { z } from "zod";
import type { EvidenceAllowlist } from "../follow-up";

export type EvidenceContinuityStatus =
  | "preserved"
  | "partially-preserved"
  | "replaced"
  | "invalid";

export interface EvidenceContinuityAssessment {
  preservedEvidenceIds: string[];
  removedEvidenceIds: string[];
  addedEvidenceIds: string[];
  invalidatedEvidenceIds: string[];
  unresolvedEvidenceIds: string[];
  continuityStatus: EvidenceContinuityStatus;
  policyVersion: string;
}

const Id = z.string().trim().min(1);
export const EvidenceContinuityAssessmentSchema:
  z.ZodType<EvidenceContinuityAssessment> = z.strictObject({
    preservedEvidenceIds: z.array(Id),
    removedEvidenceIds: z.array(Id),
    addedEvidenceIds: z.array(Id),
    invalidatedEvidenceIds: z.array(Id),
    unresolvedEvidenceIds: z.array(Id),
    continuityStatus: z.enum([
      "preserved", "partially-preserved", "replaced", "invalid",
    ]),
    policyVersion: Id,
  });

function ids(allowlist: EvidenceAllowlist): string[] {
  return [...new Set(Object.values(allowlist).flat())].sort();
}

export function assessEvidenceContinuity(
  previous: EvidenceAllowlist,
  replacement: EvidenceAllowlist,
  invalidatedEvidenceIds: string[],
  policyVersion: string,
): EvidenceContinuityAssessment {
  const oldIds = new Set(ids(previous));
  const newIds = new Set(ids(replacement));
  const unknownInvalidations = invalidatedEvidenceIds.filter(
    (id) => !oldIds.has(id) && !newIds.has(id),
  );
  const preserved = [...oldIds].filter((id) => newIds.has(id)).sort();
  const removed = [...oldIds].filter((id) => !newIds.has(id)).sort();
  const added = [...newIds].filter((id) => !oldIds.has(id)).sort();
  const invalidated = [...new Set(invalidatedEvidenceIds)].sort();
  const continuityStatus: EvidenceContinuityStatus =
    unknownInvalidations.length > 0
      ? "invalid"
      : preserved.length === oldIds.size && added.length === 0 && invalidated.length === 0
        ? "preserved"
        : preserved.length === 0
          ? "replaced"
          : "partially-preserved";
  return {
    preservedEvidenceIds: preserved,
    removedEvidenceIds: removed,
    addedEvidenceIds: added,
    invalidatedEvidenceIds: invalidated,
    unresolvedEvidenceIds: unknownInvalidations.sort(),
    continuityStatus,
    policyVersion,
  };
}

export function assertEvidenceContinuitySafe(
  assessment: EvidenceContinuityAssessment,
): void {
  if (
    assessment.continuityStatus === "invalid" ||
    assessment.unresolvedEvidenceIds.length > 0
  ) {
    throw new Error("Evidence continuity contains unknown IDs.");
  }
}
