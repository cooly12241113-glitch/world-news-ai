import type {
  ConnectorCapability,
  SourceAcquisitionFailure,
  SourceAcquisitionRequest,
  SourceAcquisitionResult,
  SourceConnector,
  SourceConnectorExecutionContext,
} from "./models";
import {
  createContentHash,
  createRawArtifactId,
  createSourceIdentity,
} from "./identity";
import {
  ConnectorCapabilitySchema,
  SourceAcquisitionRequestSchema,
  SourceAcquisitionResultSchema,
} from "./validation";
import { assessConnectorInvocation } from "./availability";

export const FIXTURE_TEXT_URL = "https://fixtures.world-news.ai/source.txt";
export const FIXTURE_HTML_URL = "https://fixtures.world-news.ai/source.html";
export const FIXTURE_AUTH_URL = "https://fixtures.world-news.ai/auth-required";

const FIXTURE_TEXT =
  "Fixture Research Outlook\n\nThe deterministic source reports a stable offline acquisition result.";
const FIXTURE_HTML = `<!doctype html>
<html lang="en"><head>
<link rel="canonical" href="${FIXTURE_HTML_URL}">
<script type="application/ld+json">{"@type":"NewsArticle","headline":"Fixture HTML Report","articleBody":"The deterministic HTML fixture contains stable evidence text.","publisher":{"name":"Fixture News"}}</script>
</head><body><article><h1>Fixture HTML Report</h1><p>The deterministic HTML fixture contains stable evidence text.</p></article></body></html>`;

export class FixtureSourceConnector implements SourceConnector {
  readonly capability: ConnectorCapability = ConnectorCapabilitySchema.parse({
    connectorId: "web",
    connectorVersion: "fixture-1",
    supportedContentKinds: ["text", "html"],
    credentialRequirement: { kind: "none" },
    paginationSupport: "none",
    incrementalFetchSupport: false,
    canonicalLocatorSupport: true,
    timestampSupport: true,
  });

  constructor(
    private readonly now: () => string = () => "2026-08-07T00:00:00.000Z",
  ) {}

  async acquire(
    request: SourceAcquisitionRequest,
    context: SourceConnectorExecutionContext = {},
  ): Promise<SourceAcquisitionResult> {
    const parsed = SourceAcquisitionRequestSchema.safeParse(request);
    if (!parsed.success) {
      return this.failure(
        request,
        "failed",
        false,
        "INVALID_ACQUISITION_REQUEST",
      );
    }
    const validated = parsed.data;
    if (context.cancellation?.isCancellationRequested() === true) {
      return this.failure(validated, "cancelled", false, "ACQUISITION_CANCELLED");
    }
    if (validated.accessPolicy.access === "prohibited") {
      return this.failure(validated, "access-denied", false, "ACCESS_PROHIBITED");
    }
    const invocation = assessConnectorInvocation(this.capability, validated);
    if (!invocation.supported || validated.locator.kind !== "web") {
      return this.failure(validated, "unsupported", false, "TARGET_UNSUPPORTED");
    }
    if (validated.locator.url === FIXTURE_AUTH_URL) {
      return this.failure(
        validated,
        "authentication-required",
        false,
        "AUTHENTICATION_REQUIRED",
      );
    }
    const fixture = validated.locator.url === FIXTURE_TEXT_URL
      ? { contentKind: "text" as const, mediaType: "text/plain", text: FIXTURE_TEXT }
      : validated.locator.url === FIXTURE_HTML_URL
        ? { contentKind: "html" as const, mediaType: "text/html", text: FIXTURE_HTML }
        : undefined;
    if (fixture === undefined ||
        (validated.requestedContentKind !== undefined &&
         validated.requestedContentKind !== fixture.contentKind)) {
      return this.failure(validated, "unsupported", false, "TARGET_UNSUPPORTED");
    }
    const sourceIdentity = createSourceIdentity(validated.locator);
    const contentHash = createContentHash(fixture.text);
    const result: SourceAcquisitionResult = {
      success: true,
      connectorId: this.capability.connectorId,
      locator: validated.locator,
      canonicalLocator: validated.locator,
      sourceIdentity,
      acquisitionId: `fixture-acquisition:${validated.requestId}`,
      acquiredAt: this.now(),
      content: { representation: "inline-text", text: fixture.text },
      rawArtifact: {
        artifactId: createRawArtifactId(sourceIdentity, contentHash),
        sourceIdentity,
        contentKind: fixture.contentKind,
        mediaType: fixture.mediaType,
        contentHash,
        byteLength: new TextEncoder().encode(fixture.text).byteLength,
      },
      trace: {
        requestId: validated.requestId,
        connectorVersion: this.capability.connectorVersion,
        attempt: 1,
      },
    };
    return SourceAcquisitionResultSchema.parse(result);
  }

  private failure(
    request: SourceAcquisitionRequest,
    outcome: SourceAcquisitionFailure["outcome"],
    retryable: boolean,
    reasonCode: string,
  ): SourceAcquisitionFailure {
    return {
      success: false,
      connectorId: this.capability.connectorId,
      locator: request.locator,
      requestId: request.requestId,
      outcome,
      retryable,
      reasonCode,
    };
  }
}
