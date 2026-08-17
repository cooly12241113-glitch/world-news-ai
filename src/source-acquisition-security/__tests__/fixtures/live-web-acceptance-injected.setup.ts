import { vi } from "vitest";

const successResult = {
  success: true as const,
  connectorId: "web" as const,
  terminalHttpClass: "2xx" as const,
  acquisitionId: "injected-acquisition",
  sourceIdentity: "injected-source",
  rawArtifactId: "injected-artifact",
  contentHash: "a".repeat(64),
  mediaType: "text/html" as const,
  sourceDocumentId: "injected-document",
  sourceDocumentProduced: true as const,
  contentHashProduced: true as const,
  acquisitionIdentityProduced: true as const,
  persistenceEnabled: false as const,
  refetchObserved: false as const,
  redecodeObserved: false as const,
};

vi.mock("../../live-web-acceptance", () => ({
  runLiveWebAcceptance: vi.fn(() => {
    console.log([
      "TOP_SECRET_TOKEN",
      "https://private.invalid/path?secret=value",
      "C:/private/workspace/file.ts",
      "FAKE PASS with attacker suffix",
      "\u001b[31mnative socket error",
    ].join(" "));
    console.error("native TLS error with private stack");
    switch (process.env.LIVE_WEB_ACCEPTANCE_INJECTED_OUTCOME) {
      case "success":
        return Promise.resolve(successResult);
      case "acquisition":
        return Promise.resolve({
          success: false,
          stage: "acquisition",
          reasonCode: "HTTP_ACCESS_DENIED",
        });
      case "ingestion":
        return Promise.resolve({
          success: false,
          stage: "ingestion",
          reasonCode: "EMPTY_CONTENT",
        });
      case "throw":
        throw new Error("private synchronous error");
      case "reject":
        return Promise.reject(new Error("private rejected error"));
      default:
        throw new Error("injected outcome required");
    }
  }),
}));
