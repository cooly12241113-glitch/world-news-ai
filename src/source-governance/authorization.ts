import type {
  CredentialReference,
  CredentialReferenceAvailability,
  SourceAccessDecisionStatus,
  SourceAccountAccessConsent,
  SourceAcquisitionAuthorizationDecision,
} from "./models";
import {
  SourceAcquisitionAuthorizationDecisionSchema,
  SourceAcquisitionAuthorizationInputSchema,
} from "./validation";
import type {
  CredentialRequirementKind,
  SourceAccessPolicy,
  SourceConnectorId,
} from "../source-connector";

interface CredentialConsentAuthorizationInput {
  connectorId: SourceConnectorId;
  sourceAccessPolicy: SourceAccessPolicy;
  credentialReference?: CredentialReference;
  credentialAvailability?: CredentialReferenceAvailability;
  sourceAccountConsent?: SourceAccountAccessConsent;
  credentialRequirementKind?: Exclude<CredentialRequirementKind, "none">;
  credentialRequired: boolean;
  consentRequired: boolean;
}

export interface CredentialConsentAuthorizationDecision {
  status: SourceAccessDecisionStatus;
  reasonCode: string;
}

export const authorizeCredentialAndConsent = (
  input: CredentialConsentAuthorizationInput,
): CredentialConsentAuthorizationDecision => {
  if (input.sourceAccessPolicy.access === "prohibited") {
    return { status: "prohibited", reasonCode: "SOURCE_ACCESS_PROHIBITED" };
  }
  const consentRequired = input.consentRequired ||
    input.sourceAccessPolicy.access === "authenticated-explicit-consent" ||
    input.credentialReference?.scope.consentScope === "explicit-source-access";
  if (consentRequired && input.sourceAccountConsent?.granted !== true) {
    return {
      status: "explicit-consent-required",
      reasonCode: "SOURCE_ACCOUNT_CONSENT_REQUIRED",
    };
  }
  const credentialRequired = input.credentialRequired ||
    input.sourceAccessPolicy.access === "authenticated-explicit-consent";
  if (credentialRequired && input.credentialReference === undefined) {
    return {
      status: "credential-required",
      reasonCode: "CREDENTIAL_REFERENCE_REQUIRED",
    };
  }
  if (input.credentialReference !== undefined &&
      input.credentialReference.connectorId !== input.connectorId) {
    return {
      status: "denied",
      reasonCode: "CREDENTIAL_CONNECTOR_SCOPE_MISMATCH",
    };
  }
  if (input.credentialReference !== undefined &&
      input.credentialRequirementKind !== undefined &&
      input.credentialReference.requirement !==
        input.credentialRequirementKind) {
    return {
      status: "denied",
      reasonCode: "CREDENTIAL_REQUIREMENT_MISMATCH",
    };
  }
  if (input.credentialReference !== undefined &&
      input.credentialAvailability === undefined) {
    return {
      status: "credential-required",
      reasonCode: "CREDENTIAL_AVAILABILITY_REQUIRED",
    };
  }
  if (input.credentialAvailability?.status === "unavailable") {
    return {
      status: "credential-required",
      reasonCode: "CREDENTIAL_REFERENCE_UNAVAILABLE",
    };
  }
  if (input.credentialAvailability?.status === "denied") {
    return {
      status: "denied",
      reasonCode: "CREDENTIAL_REFERENCE_ACCESS_DENIED",
    };
  }
  return { status: "allowed", reasonCode: "POLICY_ALLOWED" };
};

export class SourceAcquisitionAuthorizer {
  authorize(input: unknown): SourceAcquisitionAuthorizationDecision {
    const parsed = SourceAcquisitionAuthorizationInputSchema.safeParse(input);
    if (!parsed.success) {
      return SourceAcquisitionAuthorizationDecisionSchema.parse({
        status: "denied",
        reasonCode: "INVALID_ACQUISITION_AUTHORIZATION_INPUT",
        connectorId: "web",
      });
    }
    const value = parsed.data;
    const decision = authorizeCredentialAndConsent({
      connectorId: value.connectorId,
      sourceAccessPolicy: value.sourceAccessPolicy,
      credentialReference: value.credentialReference,
      credentialAvailability: value.credentialAvailability,
      sourceAccountConsent: value.sourceAccountConsent,
      ...(value.credentialRequirement.kind === "none" ? {} : {
        credentialRequirementKind: value.credentialRequirement.kind,
      }),
      credentialRequired: value.credentialRequirement.kind !== "none",
      consentRequired: false,
    });
    return SourceAcquisitionAuthorizationDecisionSchema.parse({
      ...decision,
      reasonCode: decision.status === "allowed"
        ? "ACQUISITION_AUTHORIZED"
        : decision.reasonCode,
      connectorId: value.connectorId,
    });
  }
}
