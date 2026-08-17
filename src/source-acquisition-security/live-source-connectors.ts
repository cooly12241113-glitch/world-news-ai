import {
  ConnectorCapabilitySchema,
  SourceAcquisitionRequestSchema,
  type SourceAcquisitionRequest,
  type SourceConnectorExecutionContext,
} from "../source-connector";
import {
  createLifecycleFailure,
  privacyMinimizedLocator,
} from "./failure-mapping";
import {
  SafeRuntimeSourceConnector,
  type DetailedSafeAcquisitionResult,
  type SafeAcquisitionExecutor,
} from "./runtime-source-connector";

export const LIVE_WEB_CONNECTOR_CAPABILITY = ConnectorCapabilitySchema.parse({
  connectorId: "web",
  connectorVersion: "live-web-1",
  supportedContentKinds: ["html"],
  credentialRequirement: { kind: "none" },
  paginationSupport: "none",
  incrementalFetchSupport: false,
  canonicalLocatorSupport: false,
  timestampSupport: true,
});

/**
 * Production Web/HTML connector over the sole safe acquisition executor.
 * This adapter owns no DNS, socket, HTTP client, redirect, or parsing logic.
 */
export class LiveWebSourceConnector extends SafeRuntimeSourceConnector {
  constructor(
    runtime: SafeAcquisitionExecutor,
    now: () => string = () => new Date().toISOString(),
  ) {
    super(runtime, { capability: LIVE_WEB_CONNECTOR_CAPABILITY, now });
  }

  override async acquireDetailed(
    request: SourceAcquisitionRequest,
    context: SourceConnectorExecutionContext = {},
  ): Promise<DetailedSafeAcquisitionResult> {
    const parsed = SourceAcquisitionRequestSchema.safeParse(request);
    if (parsed.success && parsed.data.accessPolicy.access === "prohibited") {
      return {
        success: false,
        sourceAcquisition: createLifecycleFailure(
          parsed.data,
          "SOURCE_ACCESS_PROHIBITED",
        ),
      };
    }
    if (parsed.success &&
        (parsed.data.requestedContentKind !== "html" ||
          parsed.data.accessPolicy.access !== "public-only")) {
      return {
        success: false,
        sourceAcquisition: {
          success: false,
          connectorId: "web",
          locator: privacyMinimizedLocator(parsed.data.locator),
          requestId: parsed.data.requestId,
          outcome: "unsupported",
          retryable: false,
          reasonCode: "TARGET_UNSUPPORTED",
        },
      };
    }
    return super.acquireDetailed(request, context);
  }
}
