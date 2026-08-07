import type {
  ConnectorCapability,
  SourceAcquisitionRequest,
  SourceConnector,
} from "./models";
import {
  ConnectorCapabilitySchema,
  SourceAcquisitionRequestSchema,
} from "./validation";

export type ConnectorInvocationAssessment =
  | { supported: true }
  | {
      supported: false;
      reason: "INVALID_CONTRACT" | "CONNECTOR_NOT_REGISTERED" | "CONTENT_KIND_UNSUPPORTED";
    };

export const assessConnectorInvocation = (
  capability: ConnectorCapability,
  request: SourceAcquisitionRequest,
): ConnectorInvocationAssessment => {
  const parsedCapability = ConnectorCapabilitySchema.safeParse(capability);
  const parsedRequest = SourceAcquisitionRequestSchema.safeParse(request);
  if (!parsedCapability.success || !parsedRequest.success) {
    return { supported: false, reason: "INVALID_CONTRACT" };
  }
  if (parsedCapability.data.connectorId !== parsedRequest.data.connectorId) {
    return { supported: false, reason: "CONNECTOR_NOT_REGISTERED" };
  }
  if (parsedRequest.data.requestedContentKind !== undefined &&
      !parsedCapability.data.supportedContentKinds.includes(
        parsedRequest.data.requestedContentKind,
      )) {
    return { supported: false, reason: "CONTENT_KIND_UNSUPPORTED" };
  }
  return { supported: true };
};

export const findRegisteredSourceConnector = (
  connectors: readonly SourceConnector[],
  request: SourceAcquisitionRequest,
): SourceConnector | undefined => connectors.find(
  (connector) => assessConnectorInvocation(connector.capability, request).supported,
);
