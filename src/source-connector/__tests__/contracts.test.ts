import { describe, expect, it } from "vitest";
import { SourceDocumentSchema } from "../../validation";
import {
  ConnectorCapabilitySchema,
  CredentialRequirementSchema,
  RawArtifactReferenceSchema,
  SourceAccessPolicySchema,
  SourceAcquisitionFailureSchema,
  SourceAcquisitionRequestSchema,
  SourceAcquisitionSuccessSchema,
  SourceLocatorSchema,
  assessConnectorInvocation,
  createContentHash,
  createRawArtifactId,
  createSourceIdentity,
  findRegisteredSourceConnector,
  FixtureSourceConnector,
} from "../index";

const capability = () => ConnectorCapabilitySchema.parse({
  connectorId: "web" as const,
  connectorVersion: "1",
  supportedContentKinds: ["text", "html"],
  credentialRequirement: { kind: "none" as const },
  paginationSupport: "none" as const,
  incrementalFetchSupport: false,
  canonicalLocatorSupport: true,
  timestampSupport: true,
});

const success = () => {
  const sourceIdentity = createSourceIdentity({
    kind: "web",
    url: "https://example.com/report",
  });
  const contentHash = createContentHash("A source body");
  return ({
  success: true as const,
  connectorId: "web" as const,
  locator: { kind: "web" as const, url: "https://example.com/report" },
  sourceIdentity,
  acquisitionId: "acquisition-1",
  acquiredAt: "2026-08-07T00:00:00.000Z",
  content: { representation: "inline-text" as const, text: "A source body" },
  rawArtifact: {
    artifactId: createRawArtifactId(sourceIdentity, contentHash),
    sourceIdentity,
    contentKind: "text" as const,
    mediaType: "text/plain",
    contentHash,
    byteLength: 13,
  },
  trace: { requestId: "request-1", connectorVersion: "1", attempt: 1 },
  });
};

describe("source connector contracts", () => {
  it("accepts a minimal connector capability", () => {
    expect(ConnectorCapabilitySchema.parse(capability())).toEqual(capability());
  });

  it("strictly rejects unknown capability fields", () => {
    expect(ConnectorCapabilitySchema.safeParse({
      ...capability(),
      platformFeatures: ["guessed"],
    }).success).toBe(false);
  });

  it("accepts a public acquisition request", () => {
    expect(SourceAcquisitionRequestSchema.safeParse({
      requestId: "request-1",
      connectorId: "web",
      locator: { kind: "web", url: "https://example.com/report" },
      requestedContentKind: "html",
      accessPolicy: { access: "public-only" },
    }).success).toBe(true);
  });

  it.each([
    ["reddit", { kind: "web", url: "https://example.com/post" }],
    ["web", { kind: "user-submitted", submissionId: "submission-1" }],
    ["user-submitted", { kind: "web", url: "https://example.com/input" }],
  ])("rejects incompatible connector %s and locator combinations", (connectorId, locator) => {
    expect(SourceAcquisitionRequestSchema.safeParse({
      requestId: "request-mismatch",
      connectorId,
      locator,
      accessPolicy: { access: "public-only" },
    }).success).toBe(false);
  });

  it("does not treat connector vocabulary as runtime availability", () => {
    const request = SourceAcquisitionRequestSchema.parse({
      requestId: "request-youtube",
      connectorId: "web",
      locator: { kind: "web", url: "https://example.com/video" },
      accessPolicy: { access: "public-only" },
    });
    expect(findRegisteredSourceConnector([], request)).toBeUndefined();
    expect(findRegisteredSourceConnector(
      [new FixtureSourceConnector()],
      request,
    )).toBeDefined();
  });

  it("rejects a requested content kind outside declared capability", () => {
    const request = SourceAcquisitionRequestSchema.parse({
      requestId: "request-video",
      connectorId: "web",
      locator: { kind: "web", url: "https://example.com/video" },
      requestedContentKind: "video",
      accessPolicy: { access: "public-only" },
    });
    expect(assessConnectorInvocation(capability(), request)).toEqual({
      supported: false,
      reason: "CONTENT_KIND_UNSUPPORTED",
    });
  });

  it("represents authenticated access without carrying credentials", () => {
    expect(SourceAccessPolicySchema.parse({
      access: "authenticated-explicit-consent",
    })).toEqual({ access: "authenticated-explicit-consent" });
    expect(CredentialRequirementSchema.parse({ kind: "oauth" })).toEqual({
      kind: "oauth",
    });
  });

  it("accepts authenticated-required request metadata without a secret", () => {
    expect(SourceAcquisitionRequestSchema.safeParse({
      requestId: "request-auth",
      connectorId: "web",
      locator: { kind: "web", url: "https://example.com/private" },
      accessPolicy: { access: "authenticated-explicit-consent" },
    }).success).toBe(true);
  });

  it.each(["apiKey", "token", "accessToken", "refreshToken", "password", "cookie"])(
    "rejects raw credential field %s",
    (field) => {
      expect(CredentialRequirementSchema.safeParse({
        kind: "api-key",
        [field]: "secret",
      }).success).toBe(false);
    },
  );

  it("accepts a strict acquisition success result", () => {
    expect(SourceAcquisitionSuccessSchema.safeParse(success()).success).toBe(true);
  });

  it("accepts a privacy-minimized typed failure", () => {
    expect(SourceAcquisitionFailureSchema.safeParse({
      success: false,
      connectorId: "web",
      locator: { kind: "web", url: "https://example.com/private" },
      requestId: "request-1",
      outcome: "authentication-required",
      retryable: false,
      reasonCode: "AUTHENTICATION_REQUIRED",
    }).success).toBe(true);
  });

  it("keeps RawArtifactReference distinct from SourceDocument", () => {
    expect(RawArtifactReferenceSchema.safeParse(success().rawArtifact).success)
      .toBe(true);
    expect(SourceDocumentSchema.safeParse(success().rawArtifact).success).toBe(false);
  });

  it("supports a non-URL locator without an arbitrary metadata bag", () => {
    expect(SourceLocatorSchema.parse({
      kind: "user-submitted",
      submissionId: "submission-1",
    })).toEqual({ kind: "user-submitted", submissionId: "submission-1" });
  });

  it("keeps runtime request metadata out of semantic source identity", () => {
    const first = createSourceIdentity({
      kind: "web",
      url: "https://example.com/report?utm_source=first",
    });
    const second = createSourceIdentity({
      kind: "web",
      url: "https://example.com/report?utm_source=second",
    });
    expect(first).toBe(second);
  });

  it.each(["confidence", "reliabilityScore", "truthScore", "epistemicType", "hypothesisStrength", "politicalBias", "sourceTrust", "evidenceWeight"])(
    "rejects evidence or reliability field %s",
    (field) => {
      expect(SourceAcquisitionSuccessSchema.safeParse({
        ...success(),
        [field]: 1,
      }).success).toBe(false);
    },
  );

  it.each(["metadata", "rawContext", "authorization", "credentials"])(
    "rejects arbitrary or sensitive result field %s",
    (field) => {
      expect(SourceAcquisitionSuccessSchema.safeParse({
        ...success(),
        [field]: { secret: "not-allowed" },
      }).success).toBe(false);
    },
  );
});
