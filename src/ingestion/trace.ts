import type { IngestionRequest, IngestionTrace } from "./types";

export const createTrace = (request: IngestionRequest): IngestionTrace => ({
  inputKind: request.kind,
  fetchAttempts: [],
  redirects: [],
  capabilityEvaluations: [],
  selectedCapabilityReasons: [],
  metadataSelections: [],
  normalizationWarnings: [],
  validationSucceeded: false,
  fingerprintGenerated: false,
  completedStages: [],
});
