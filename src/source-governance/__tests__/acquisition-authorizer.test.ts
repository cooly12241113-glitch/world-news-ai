import { describe, expect, it } from "vitest";
import {
  SourceAcquisitionAuthorizer,
  type SourceAcquisitionAuthorizationInput,
} from "../index";

const input = (): SourceAcquisitionAuthorizationInput => ({
  connectorId: "web",
  sourceAccessPolicy: { access: "public-only" },
  credentialRequirement: { kind: "none" },
});

const authorizer = new SourceAcquisitionAuthorizer();

describe("source acquisition authorizer", () => {
  it("allows a public acquisition without fabricating a raw artifact", () => {
    expect(authorizer.authorize(input())).toEqual({
      status: "allowed",
      reasonCode: "ACQUISITION_AUTHORIZED",
      connectorId: "web",
    });
  });

  it("denies a prohibited source before acquisition", () => {
    const value = input();
    value.sourceAccessPolicy = { access: "prohibited" };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "prohibited",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
  });

  it("requires explicit consent for authenticated access", () => {
    const value = input();
    value.sourceAccessPolicy = { access: "authenticated-explicit-consent" };
    value.credentialRequirement = { kind: "oauth" };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "explicit-consent-required",
      reasonCode: "SOURCE_ACCOUNT_CONSENT_REQUIRED",
    });
  });

  it("requires a credential reference after consent", () => {
    const value = input();
    value.sourceAccessPolicy = { access: "authenticated-explicit-consent" };
    value.credentialRequirement = { kind: "oauth" };
    value.sourceAccountConsent = {
      granted: true,
      purpose: "source-account-access",
      scope: "this-acquisition",
    };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "credential-required",
      reasonCode: "CREDENTIAL_REFERENCE_REQUIRED",
    });
  });

  it("fails closed for connector mismatch, missing availability, and denial", () => {
    const value = input();
    value.credentialRequirement = { kind: "oauth" };
    value.credentialReference = {
      credentialRefId: "credential-rss",
      connectorId: "rss",
      requirement: "oauth",
      scope: {
        purpose: "source-acquisition",
        connectorId: "rss",
        consentScope: "none",
      },
    };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "denied",
      reasonCode: "CREDENTIAL_CONNECTOR_SCOPE_MISMATCH",
    });
    value.credentialReference = {
      ...value.credentialReference,
      connectorId: "web",
      scope: { ...value.credentialReference.scope, connectorId: "web" },
    };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "credential-required",
      reasonCode: "CREDENTIAL_AVAILABILITY_REQUIRED",
    });
    value.credentialAvailability = {
      status: "unavailable",
      reasonCode: "REFERENCE_NOT_FOUND",
    };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "credential-required",
      reasonCode: "CREDENTIAL_REFERENCE_UNAVAILABLE",
    });
    value.credentialAvailability = {
      status: "denied",
      reasonCode: "REFERENCE_ACCESS_DENIED",
    };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "denied",
      reasonCode: "CREDENTIAL_REFERENCE_ACCESS_DENIED",
    });
  });

  it("accepts no secret-bearing or unknown fields", () => {
    expect(authorizer.authorize({ ...input(), token: "forbidden" })).toMatchObject({
      status: "denied",
      reasonCode: "INVALID_ACQUISITION_AUTHORIZATION_INPUT",
    });
  });

  it("fails closed without throwing for an invalid connector", () => {
    expect(authorizer.authorize({ ...input(), connectorId: "unknown" }))
      .toMatchObject({
        status: "denied",
        reasonCode: "INVALID_ACQUISITION_AUTHORIZATION_INPUT",
      });
  });

  it("denies a credential of the wrong required kind", () => {
    const value = input();
    value.credentialRequirement = { kind: "api-key" };
    value.credentialReference = {
      credentialRefId: "credential-web",
      connectorId: "web",
      requirement: "oauth",
      scope: {
        purpose: "source-acquisition",
        connectorId: "web",
        consentScope: "none",
      },
    };
    value.credentialAvailability = { status: "available" };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "denied",
      reasonCode: "CREDENTIAL_REQUIREMENT_MISMATCH",
    });
  });

  it("keeps prohibited access authoritative over credential mismatch", () => {
    const value = input();
    value.sourceAccessPolicy = { access: "prohibited" };
    value.credentialRequirement = { kind: "api-key" };
    value.credentialReference = {
      credentialRefId: "credential-web",
      connectorId: "web",
      requirement: "oauth",
      scope: {
        purpose: "source-acquisition",
        connectorId: "web",
        consentScope: "none",
      },
    };
    value.credentialAvailability = { status: "available" };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "prohibited",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
  });

  it("keeps prohibited access authoritative over a missing credential", () => {
    const value = input();
    value.sourceAccessPolicy = { access: "prohibited" };
    value.credentialRequirement = { kind: "oauth" };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "prohibited",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
  });

  it("keeps prohibited access authoritative over unavailable credentials", () => {
    const value = input();
    value.sourceAccessPolicy = { access: "prohibited" };
    value.credentialRequirement = { kind: "oauth" };
    value.credentialReference = {
      credentialRefId: "credential-web",
      connectorId: "web",
      requirement: "oauth",
      scope: {
        purpose: "source-acquisition",
        connectorId: "web",
        consentScope: "none",
      },
    };
    value.credentialAvailability = {
      status: "unavailable",
      reasonCode: "REFERENCE_NOT_FOUND",
    };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "prohibited",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
  });

  it("keeps prohibited access authoritative over missing consent", () => {
    const value = input();
    value.sourceAccessPolicy = { access: "prohibited" };
    value.credentialRequirement = { kind: "oauth" };
    value.credentialReference = {
      credentialRefId: "credential-web",
      connectorId: "web",
      requirement: "oauth",
      scope: {
        purpose: "source-acquisition",
        connectorId: "web",
        consentScope: "explicit-source-access",
      },
    };
    value.credentialAvailability = { status: "available" };
    expect(authorizer.authorize(value)).toMatchObject({
      status: "prohibited",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
  });
});
