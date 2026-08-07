import { describe, expect, it } from "vitest";
import { IngestionPipeline } from "../../ingestion";
import {
  FIXTURE_AUTH_URL,
  FIXTURE_HTML_URL,
  FIXTURE_TEXT_URL,
  FixtureSourceConnector,
  SourceAcquisitionIngestionBridge,
  type SourceAcquisitionRequest,
} from "../index";

const request = (
  url: string,
  requestedContentKind?: "text" | "html",
): SourceAcquisitionRequest => ({
  requestId: `request:${url}`,
  connectorId: "web",
  locator: { kind: "web", url },
  ...(requestedContentKind ? { requestedContentKind } : {}),
  accessPolicy: { access: "public-only" },
});

describe("deterministic fixture source connector", () => {
  it("acquires a known text target without network access", async () => {
    const result = await new FixtureSourceConnector().acquire(
      request(FIXTURE_TEXT_URL, "text"),
    );
    expect(result).toMatchObject({
      success: true,
      connectorId: "web",
      rawArtifact: { contentKind: "text", mediaType: "text/plain" },
    });
  });

  it("acquires a known HTML target deterministically", async () => {
    const connector = new FixtureSourceConnector();
    const first = await connector.acquire(request(FIXTURE_HTML_URL, "html"));
    const second = await connector.acquire(request(FIXTURE_HTML_URL, "html"));
    expect(first).toEqual(second);
  });

  it("keeps runtime acquisition identity separate from source identity", async () => {
    const first = await new FixtureSourceConnector(
      () => "2026-08-07T00:00:00.000Z",
    ).acquire(request(FIXTURE_TEXT_URL, "text"));
    const secondRequest = request(FIXTURE_TEXT_URL, "text");
    secondRequest.requestId = "request:second-attempt";
    const second = await new FixtureSourceConnector(
      () => "2026-08-08T00:00:00.000Z",
    ).acquire(secondRequest);
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.sourceIdentity).toBe(second.sourceIdentity);
      expect(first.acquisitionId).not.toBe(second.acquisitionId);
      expect(first.acquiredAt).not.toBe(second.acquiredAt);
    }
  });

  it("returns unsupported for an unknown target", async () => {
    const result = await new FixtureSourceConnector().acquire(
      request("https://fixtures.world-news.ai/unknown"),
    );
    expect(result).toMatchObject({
      success: false,
      outcome: "unsupported",
      reasonCode: "TARGET_UNSUPPORTED",
    });
  });

  it("returns unsupported for content outside declared capability", async () => {
    const videoRequest = request(FIXTURE_TEXT_URL) as SourceAcquisitionRequest;
    videoRequest.requestedContentKind = "video";
    const result = await new FixtureSourceConnector().acquire(videoRequest);
    expect(result).toMatchObject({ success: false, outcome: "unsupported" });
  });

  it("returns authentication-required without a credential value", async () => {
    const result = await new FixtureSourceConnector().acquire(
      request(FIXTURE_AUTH_URL),
    );
    expect(result).toMatchObject({
      success: false,
      outcome: "authentication-required",
    });
    expect(JSON.stringify(result)).not.toMatch(/token|password|cookie|secret/iu);
  });

  it("uses the framework-neutral cancellation convention", async () => {
    const result = await new FixtureSourceConnector().acquire(
      request(FIXTURE_TEXT_URL),
      { cancellation: { isCancellationRequested: () => true } },
    );
    expect(result).toMatchObject({ success: false, outcome: "cancelled" });
  });
});

describe("acquisition to existing ingestion bridge", () => {
  it("projects connector content and provenance into an existing ingestion request", async () => {
    const acquisition = await new FixtureSourceConnector().acquire(
      request(FIXTURE_TEXT_URL, "text"),
    );
    const result = new SourceAcquisitionIngestionBridge().project(acquisition, {
      hints: {
        expectedLanguage: "en",
        expectedDocumentType: "ResearchReport",
        sourceName: "Fixture Research",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.projection.ingestionRequest).toMatchObject({
        kind: "content",
        mediaType: "text/plain",
        sourceUrl: FIXTURE_TEXT_URL,
      });
      expect(result.projection.provenance).toMatchObject({
        connectorId: "web",
        connectorVersion: "fixture-1",
      });
    }
  });

  it("does not create evidence or reliability fields", async () => {
    const acquisition = await new FixtureSourceConnector().acquire(
      request(FIXTURE_TEXT_URL),
    );
    const projection = new SourceAcquisitionIngestionBridge().project(acquisition);
    expect(JSON.stringify(projection)).not.toMatch(
      /evidenceLink|reliabilityScore|truthScore|hypothesis|politicalBias/u,
    );
  });

  it("runs projected text through the existing plain-text pipeline", async () => {
    const acquisition = await new FixtureSourceConnector().acquire(
      request(FIXTURE_TEXT_URL, "text"),
    );
    const bridge = new SourceAcquisitionIngestionBridge().project(acquisition, {
      hints: {
        expectedLanguage: "en",
        expectedDocumentType: "ResearchReport",
        sourceName: "Fixture Research",
      },
    });
    expect(bridge.success).toBe(true);
    if (!bridge.success) return;
    const result = await new IngestionPipeline().ingest(
      bridge.projection.ingestionRequest,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.trace.selectedCapability).toBe("plain-text");
      expect(result.document.documentType).toBe("ResearchReport");
    }
  });

  it("runs projected HTML through the existing HTML pipeline", async () => {
    const acquisition = await new FixtureSourceConnector().acquire(
      request(FIXTURE_HTML_URL, "html"),
    );
    const bridge = new SourceAcquisitionIngestionBridge().project(acquisition);
    expect(bridge.success).toBe(true);
    if (!bridge.success) return;
    const result = await new IngestionPipeline().ingest(
      bridge.projection.ingestionRequest,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.trace.selectedCapability).toBe("generic-html");
      expect(result.document.title).toBe("Fixture HTML Report");
    }
  });

  it("leaves the direct existing HTML/plain-text entry path unchanged", async () => {
    const result = await new IngestionPipeline().ingest({
      kind: "content",
      content: "Direct Entry\n\nThe existing deterministic path remains available.",
      mediaType: "text/plain",
      sourceUrl: "https://example.com/direct.txt",
      retrievedAt: "2026-08-07T00:00:00.000Z",
      hints: {
        expectedLanguage: "en",
        expectedDocumentType: "ResearchReport",
        sourceName: "Direct Fixture",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.trace.selectedCapability).toBe("plain-text");
  });
});
