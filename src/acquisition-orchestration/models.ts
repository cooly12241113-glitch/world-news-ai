import type { IngestionResult } from "../ingestion";
import type {
  AcquisitionBridgeOptions,
  AcquisitionProvenance,
  SourceAcquisitionFailure,
  SourceAcquisitionRequest,
  SourceConnectorExecutionContext,
  RawArtifactReference,
  SourceConnectorId,
} from "../source-connector";
import type {
  RawArtifactLifecyclePolicy,
  RawArtifactOperationContext,
} from "../source-governance";
import type {
  RawPersistenceResult,
} from "../raw-persistence";

export interface RawPersistencePort {
  persist(candidate: import("../raw-persistence").RawArtifactCandidate): RawPersistenceResult;
}

export interface RequestedRawPersistence {
  service: RawPersistencePort;
  policy: RawArtifactLifecyclePolicy;
  context: RawArtifactOperationContext;
}

export interface ProductionAcquisitionRequest {
  acquisition: SourceAcquisitionRequest;
  executionContext?: SourceConnectorExecutionContext;
  bridgeOptions?: AcquisitionBridgeOptions;
  rawPersistence?: RequestedRawPersistence;
}

export interface ProductionAcquisitionSummary {
  connectorId: SourceConnectorId;
  requestId: string;
  acquisitionId: string;
  sourceIdentity: string;
  rawArtifact: RawArtifactReference;
  acquiredAt: string;
}

type IngestionSuccess = Extract<IngestionResult, { success: true }>;
type IngestionFailure = Extract<IngestionResult, { success: false }>;

export type ProductionAcquisitionResult =
  | {
      success: true;
      outcome: "ingested" | "persisted-and-ingested";
      acquisition: ProductionAcquisitionSummary;
      persistence: { requested: false } | {
        requested: true;
        result: Extract<RawPersistenceResult, { success: true }>;
      };
      ingestion: IngestionSuccess;
      provenance: AcquisitionProvenance;
    }
  | {
      success: false;
      stage: "acquisition";
      acquisition: SourceAcquisitionFailure;
    }
  | {
      success: false;
      stage: "bridge";
      acquisition: ProductionAcquisitionSummary;
      persistence: { requested: false } | { requested: true; result: RawPersistenceResult };
      error: { code: string; message: string };
    }
  | {
      success: false;
      stage: "persistence";
      acquisition: ProductionAcquisitionSummary;
      persistence: {
        requested: true;
        result: Extract<RawPersistenceResult, { success: false }>;
      };
      ingestion: IngestionResult;
      provenance?: AcquisitionProvenance;
    }
  | {
      success: false;
      stage: "ingestion";
      acquisition: ProductionAcquisitionSummary;
      persistence: { requested: false } | { requested: true; result: RawPersistenceResult };
      ingestion: IngestionFailure;
      provenance: AcquisitionProvenance;
    };
