import { z } from "zod";
import {
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  URLStringSchema,
} from "../validation/common";
import {
  CREDENTIAL_REQUIREMENT_KINDS,
  SOURCE_ACCESS_LEVELS,
  SOURCE_ACQUISITION_FAILURE_OUTCOMES,
  SOURCE_CONNECTOR_IDS,
  SOURCE_CONTENT_KINDS,
  type AcquisitionTraceMetadata,
  type AcquiredInlineText,
  type ConnectorCapability,
  type CredentialRequirement,
  type RawArtifactReference,
  type SourceAccessPolicy,
  type SourceAcquisitionFailure,
  type SourceAcquisitionRequest,
  type SourceAcquisitionResult,
  type SourceAcquisitionSuccess,
  type SourceLocator,
} from "./models";
import {
  createContentHash,
  createRawArtifactId,
  createSourceIdentity,
} from "./identity";

export const SourceConnectorIdSchema = z.enum(SOURCE_CONNECTOR_IDS);
export const SourceContentKindSchema = z.enum(SOURCE_CONTENT_KINDS);

export const SourceLocatorSchema: z.ZodType<SourceLocator> =
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("web"), url: URLStringSchema }),
    z.strictObject({
      kind: z.literal("user-submitted"),
      submissionId: IdSchema,
    }),
  ]);

export const CredentialRequirementSchema:
z.ZodType<CredentialRequirement> = z.strictObject({
  kind: z.enum(CREDENTIAL_REQUIREMENT_KINDS),
});

export const SourceAccessPolicySchema: z.ZodType<SourceAccessPolicy> =
  z.strictObject({ access: z.enum(SOURCE_ACCESS_LEVELS) });

export const ConnectorCapabilitySchema: z.ZodType<ConnectorCapability> =
  z.strictObject({
    connectorId: SourceConnectorIdSchema,
    connectorVersion: NonEmptyStringSchema,
    supportedContentKinds: z.array(SourceContentKindSchema).min(1)
      .refine((values) => new Set(values).size === values.length),
    credentialRequirement: CredentialRequirementSchema,
    paginationSupport: z.enum(["none", "cursor", "page"]),
    incrementalFetchSupport: z.boolean(),
    canonicalLocatorSupport: z.boolean(),
    timestampSupport: z.boolean(),
  });

export const SourceAcquisitionRequestSchema:
z.ZodType<SourceAcquisitionRequest> = z.strictObject({
  requestId: IdSchema,
  connectorId: SourceConnectorIdSchema,
  locator: SourceLocatorSchema,
  requestedContentKind: SourceContentKindSchema.optional(),
  accessPolicy: SourceAccessPolicySchema,
}).superRefine((request, context) => {
  const usesWebLocator = request.connectorId === "web" ||
    request.connectorId === "rss";
  const compatible =
    (usesWebLocator && request.locator.kind === "web") ||
    (request.connectorId === "user-submitted" &&
      request.locator.kind === "user-submitted");
  if (!compatible) {
    context.addIssue({
      code: "custom",
      path: ["locator"],
      message: "Connector and locator kinds are not compatible or registered.",
    });
  }
});

export const RawArtifactReferenceSchema: z.ZodType<RawArtifactReference> =
  z.strictObject({
    artifactId: IdSchema,
    sourceIdentity: IdSchema,
    contentKind: SourceContentKindSchema,
    mediaType: NonEmptyStringSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    byteLength: z.number().int().nonnegative(),
  });

export const AcquiredInlineTextSchema: z.ZodType<AcquiredInlineText> =
  z.strictObject({
    representation: z.literal("inline-text"),
    text: NonEmptyStringSchema.max(5_000_000),
  });

export const AcquisitionTraceMetadataSchema:
z.ZodType<AcquisitionTraceMetadata> = z.strictObject({
  requestId: IdSchema,
  connectorVersion: NonEmptyStringSchema,
  attempt: z.number().int().positive(),
});

export const SourceAcquisitionSuccessSchema:
z.ZodType<SourceAcquisitionSuccess> = z.strictObject({
  success: z.literal(true),
  connectorId: SourceConnectorIdSchema,
  locator: SourceLocatorSchema,
  canonicalLocator: SourceLocatorSchema.optional(),
  sourceIdentity: IdSchema,
  acquisitionId: IdSchema,
  acquiredAt: ISODateStringSchema,
  content: AcquiredInlineTextSchema,
  rawArtifact: RawArtifactReferenceSchema,
  trace: AcquisitionTraceMetadataSchema,
}).superRefine((result, context) => {
  const sourceIdentity = createSourceIdentity(
    result.canonicalLocator ?? result.locator,
  );
  const contentHash = createContentHash(result.content.text);
  const byteLength = new TextEncoder().encode(result.content.text).byteLength;
  if (result.sourceIdentity !== sourceIdentity) {
    context.addIssue({
      code: "custom",
      path: ["sourceIdentity"],
      message: "Source identity must match the canonical locator semantics.",
    });
  }
  if (result.sourceIdentity !== result.rawArtifact.sourceIdentity) {
    context.addIssue({
      code: "custom",
      path: ["rawArtifact", "sourceIdentity"],
      message: "Raw artifact source identity must match the acquisition result.",
    });
  }
  if (result.rawArtifact.contentHash !== contentHash ||
      result.rawArtifact.byteLength !== byteLength) {
    context.addIssue({
      code: "custom",
      path: ["rawArtifact"],
      message: "Raw artifact hash and byte length must match inline content.",
    });
  }
  if (result.rawArtifact.artifactId !==
      createRawArtifactId(result.sourceIdentity, contentHash)) {
    context.addIssue({
      code: "custom",
      path: ["rawArtifact", "artifactId"],
      message: "Raw artifact identity must match source identity and content hash.",
    });
  }
  if (result.trace.requestId.trim().length === 0) {
    context.addIssue({ code: "custom", message: "Trace request ID is required." });
  }
  if (!["text", "html"].includes(result.rawArtifact.contentKind)) {
    context.addIssue({
      code: "custom",
      path: ["rawArtifact", "contentKind"],
      message: "Inline text supports only text or HTML content kinds.",
    });
  }
});

export const SourceAcquisitionFailureSchema:
z.ZodType<SourceAcquisitionFailure> = z.strictObject({
  success: z.literal(false),
  connectorId: SourceConnectorIdSchema,
  locator: SourceLocatorSchema,
  requestId: IdSchema,
  outcome: z.enum(SOURCE_ACQUISITION_FAILURE_OUTCOMES),
  retryable: z.boolean(),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
});

export const SourceAcquisitionResultSchema:
z.ZodType<SourceAcquisitionResult> = z.union([
  SourceAcquisitionSuccessSchema,
  SourceAcquisitionFailureSchema,
]);
