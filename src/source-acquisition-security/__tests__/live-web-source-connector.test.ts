import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SourceAcquisitionRequest } from "../../source-connector";
import {
  LIVE_WEB_CONNECTOR_CAPABILITY,
  LiveWebSourceConnector,
  type SafeAcquisitionExecutor,
  type SafeNetworkAcquisitionSuccess,
} from "../index";

const html = "<html><body><article>Live Web</article></body></html>";
const request = (overrides: Partial<SourceAcquisitionRequest> = {}):
SourceAcquisitionRequest => ({
  requestId: "live-web-request",
  connectorId: "web",
  locator: { kind: "web", url: "https://news.example/article" },
  requestedContentKind: "html",
  accessPolicy: { access: "public-only" },
  ...overrides,
});

const acquired = (
  text = html,
  contentKind: "html" | "text" = "html",
): SafeNetworkAcquisitionSuccess => {
  const bytes = new TextEncoder().encode(text);
  return {
    success: true,
    connectorId: "web",
    requestId: "live-web-request",
    finalTarget: {
      scheme: "https",
      hostname: "news.example",
      port: 443,
      targetFingerprint: "a".repeat(64),
    },
    statusCode: 200,
    attemptNumber: 1,
    redirectHop: 0,
    body: {
      bytes,
      text,
      mediaType: contentKind === "html" ? "text/html" : "text/plain",
      contentKind,
      contentEncoding: "identity",
      encodedBytesReceived: bytes.byteLength,
      decodedBytesProduced: bytes.byteLength,
      decodedSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
};

describe("LiveWebSourceConnector", () => {
  it("publishes the closed public Web/HTML capability contract", () => {
    expect(LIVE_WEB_CONNECTOR_CAPABILITY).toEqual({
      connectorId: "web",
      connectorVersion: "live-web-1",
      supportedContentKinds: ["html"],
      credentialRequirement: { kind: "none" },
      paginationSupport: "none",
      incrementalFetchSupport: false,
      canonicalLocatorSupport: false,
      timestampSupport: true,
    });
  });

  it("delegates a validated request exactly once to the safe executor", async () => {
    const execute = vi.fn(async () => acquired());
    const connector = new LiveWebSourceConnector(
      { execute } satisfies SafeAcquisitionExecutor,
      () => "2026-08-17T00:00:00.000Z",
    );

    const result = await connector.acquireDetailed(request());

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      request: request(),
      credentialRequirement: { kind: "none" },
      cancellation: undefined,
    });
    expect(result).toMatchObject({
      success: true,
      sourceAcquisition: {
        connectorId: "web",
        acquisitionId: "safe-acquisition:live-web-request",
        rawArtifact: { contentKind: "html", mediaType: "text/html" },
        trace: { connectorVersion: "live-web-1" },
      },
    });
  });

  it("rejects invalid, wrong-connector, non-HTML, and non-public requests before networking", async () => {
    const execute = vi.fn(async () => acquired());
    const connector = new LiveWebSourceConnector({ execute });

    const results = await Promise.all([
      connector.acquireDetailed({ ...request(), requestId: "" }),
      connector.acquireDetailed({ ...request(), connectorId: "rss" }),
      connector.acquireDetailed({ ...request(), requestedContentKind: "text" }),
      connector.acquireDetailed({ ...request(), requestedContentKind: undefined }),
      connector.acquireDetailed({
        ...request(),
        accessPolicy: { access: "authenticated-explicit-consent" },
      }),
    ]);

    expect(results.every((result) => !result.success)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it("preserves prohibited-source policy precedence before networking", async () => {
    const execute = vi.fn(async () => acquired());
    const result = await new LiveWebSourceConnector({ execute }).acquireDetailed({
      ...request(),
      accessPolicy: { access: "prohibited" },
    });

    expect(result).toMatchObject({
      success: false,
      sourceAcquisition: {
        outcome: "access-denied",
        reasonCode: "SOURCE_ACCESS_PROHIBITED",
      },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a non-HTML safe-runtime result and never adds network authority", async () => {
    const execute = vi.fn(async () => acquired("plain", "text"));
    const result = await new LiveWebSourceConnector({ execute })
      .acquireDetailed(request());

    expect(result).toMatchObject({
      success: false,
      sourceAcquisition: { reasonCode: "CONTENT_KIND_MISMATCH" },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
