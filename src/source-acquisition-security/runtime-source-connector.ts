import {
  ConnectorCapabilitySchema,
  SourceAcquisitionRequestSchema,
  SourceAcquisitionResultSchema,
  createRawArtifactId,
  createSourceIdentity,
  type ConnectorCapability,
  type SourceAcquisitionRequest,
  type SourceAcquisitionFailure,
  type SourceAcquisitionSuccess,
  type SourceAcquisitionResult,
  type SourceConnector,
  type SourceConnectorExecutionContext,
} from "../source-connector";
import type {
  SafeNetworkAcquisitionInput,
  SafeNetworkAcquisitionResult,
  SafeNetworkAcquisitionSuccess,
} from "./lifecycle-models";

export interface SafeAcquisitionExecutor {
  execute(input: SafeNetworkAcquisitionInput): Promise<SafeNetworkAcquisitionResult>;
}

export type DetailedSafeAcquisitionResult =
  | {
      success: true;
      boundedAcquisition: SafeNetworkAcquisitionSuccess;
      sourceAcquisition: SourceAcquisitionSuccess;
    }
  | { success: false; sourceAcquisition: SourceAcquisitionFailure };

export class SafeRuntimeFixtureConnector implements SourceConnector {
  readonly capability: ConnectorCapability = ConnectorCapabilitySchema.parse({
    connectorId: "web",
    connectorVersion: "safe-runtime-fixture-1",
    supportedContentKinds: ["text", "html"],
    credentialRequirement: { kind: "none" },
    paginationSupport: "none",
    incrementalFetchSupport: false,
    canonicalLocatorSupport: false,
    timestampSupport: true,
  });

  constructor(
    private readonly runtime: SafeAcquisitionExecutor,
    private readonly now: () => string = () => "2026-08-12T00:00:00.000Z",
  ) {}

  async acquire(
    request: SourceAcquisitionRequest,
    context: SourceConnectorExecutionContext = {},
  ): Promise<SourceAcquisitionResult> {
    const detailed = await this.acquireDetailed(request, context);
    return detailed.sourceAcquisition;
  }

  async acquireDetailed(
    request: SourceAcquisitionRequest,
    context: SourceConnectorExecutionContext = {},
  ): Promise<DetailedSafeAcquisitionResult> {
    const parsed = SourceAcquisitionRequestSchema.safeParse(request);
    if (!parsed.success) {
      return { success: false, sourceAcquisition: {
        success: false,
        connectorId: "web",
        locator: request.locator,
        requestId: request.requestId,
        outcome: "failed",
        retryable: false,
        reasonCode: "INVALID_ACQUISITION_REQUEST",
      } };
    }
    const validated = parsed.data;
    const acquired = await this.runtime.execute({
      request: validated,
      credentialRequirement: this.capability.credentialRequirement,
      cancellation: context.cancellation,
    });
    if (!acquired.success) return { success: false, sourceAcquisition: acquired };
    if (acquired.body === undefined) {
      return { success: false, sourceAcquisition: {
        success: false,
        connectorId: "web",
        locator: validated.locator,
        requestId: validated.requestId,
        outcome: "failed",
        retryable: false,
        reasonCode: "RESPONSE_BODY_REQUIRED",
      } };
    }
    const sourceIdentity = createSourceIdentity(validated.locator);
    const result: SourceAcquisitionSuccess = {
      success: true,
      connectorId: "web",
      locator: validated.locator,
      sourceIdentity,
      acquisitionId: `safe-acquisition:${validated.requestId}`,
      acquiredAt: this.now(),
      content: { representation: "inline-text", text: acquired.body.text },
      rawArtifact: {
        artifactId: createRawArtifactId(sourceIdentity, acquired.body.decodedSha256),
        sourceIdentity,
        contentKind: acquired.body.contentKind,
        mediaType: acquired.body.mediaType,
        contentHash: acquired.body.decodedSha256,
        byteLength: acquired.body.decodedBytesProduced,
      },
      trace: {
        requestId: validated.requestId,
        connectorVersion: this.capability.connectorVersion,
        attempt: acquired.attemptNumber,
      },
    };
    return {
      success: true,
      boundedAcquisition: acquired,
      sourceAcquisition: SourceAcquisitionResultSchema.parse(result) as SourceAcquisitionSuccess,
    };
  }
}
