import {
  ConnectorCapabilitySchema,
  SourceAcquisitionRequestSchema,
  SourceAcquisitionResultSchema,
  assessConnectorInvocation,
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
import { privacyMinimizedLocator } from "./failure-mapping";

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

export interface DetailedSafeSourceConnector extends SourceConnector {
  acquireDetailed(
    request: SourceAcquisitionRequest,
    context?: SourceConnectorExecutionContext,
  ): Promise<DetailedSafeAcquisitionResult>;
}

export interface SafeRuntimeSourceConnectorOptions {
  capability: ConnectorCapability;
  now?: () => string;
}

/**
 * Converts one trusted safe-runtime result into the strict SourceConnector
 * contract. It owns no transport and grants no network authority.
 */
export class SafeRuntimeSourceConnector implements DetailedSafeSourceConnector {
  readonly capability: ConnectorCapability;
  readonly #now: () => string;

  constructor(
    private readonly runtime: SafeAcquisitionExecutor,
    options: SafeRuntimeSourceConnectorOptions,
  ) {
    this.capability = ConnectorCapabilitySchema.parse(options.capability);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

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
      return {
        success: false,
        sourceAcquisition: this.failure(
          request,
          "failed",
          "INVALID_ACQUISITION_REQUEST",
        ),
      };
    }
    const validated = parsed.data;
    if (!assessConnectorInvocation(this.capability, validated).supported) {
      return {
        success: false,
        sourceAcquisition: this.failure(
          validated,
          "unsupported",
          "TARGET_UNSUPPORTED",
        ),
      };
    }
    const acquired = await this.runtime.execute({
      request: validated,
      credentialRequirement: this.capability.credentialRequirement,
      cancellation: context.cancellation,
    });
    if (!acquired.success) return { success: false, sourceAcquisition: acquired };
    if (acquired.body === undefined) {
      return {
        success: false,
        sourceAcquisition: this.failure(
          validated,
          "failed",
          "RESPONSE_BODY_REQUIRED",
        ),
      };
    }
    if (!this.capability.supportedContentKinds.includes(
      acquired.body.contentKind,
    )) {
      return {
        success: false,
        sourceAcquisition: this.failure(
          validated,
          "unsupported",
          "CONTENT_KIND_MISMATCH",
        ),
      };
    }
    const sourceIdentity = createSourceIdentity(validated.locator);
    const result: SourceAcquisitionSuccess = {
      success: true,
      connectorId: this.capability.connectorId,
      locator: validated.locator,
      sourceIdentity,
      acquisitionId: `safe-acquisition:${validated.requestId}`,
      acquiredAt: this.#now(),
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

  private failure(
    request: SourceAcquisitionRequest,
    outcome: SourceAcquisitionFailure["outcome"],
    reasonCode: string,
  ): SourceAcquisitionFailure {
    return {
      success: false,
      connectorId: this.capability.connectorId,
      locator: privacyMinimizedLocator(request.locator),
      requestId: request.requestId,
      outcome,
      retryable: false,
      reasonCode,
    };
  }
}

/** Compatibility wrapper retained for existing Milestone 04 fixtures. */
export class SafeRuntimeFixtureConnector extends SafeRuntimeSourceConnector {
  constructor(
    runtime: SafeAcquisitionExecutor,
    now: () => string = () => "2026-08-12T00:00:00.000Z",
  ) {
    super(runtime, {
      now,
      capability: ConnectorCapabilitySchema.parse({
        connectorId: "web",
        connectorVersion: "safe-runtime-fixture-1",
        supportedContentKinds: ["text", "html"],
        credentialRequirement: { kind: "none" },
        paginationSupport: "none",
        incrementalFetchSupport: false,
        canonicalLocatorSupport: false,
        timestampSupport: true,
      }),
    });
  }
}
