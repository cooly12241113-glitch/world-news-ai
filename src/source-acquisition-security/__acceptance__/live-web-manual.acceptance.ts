import { describe, expect, it } from "vitest";
import { runLiveWebAcceptance } from "../live-web-acceptance";

const ACCEPTANCE_MARKER = "WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE=";

const requiredLiveWebUrl = (): string => {
  const value = process.env.LIVE_WEB_URL;
  if (value === undefined || value.trim() === "") {
    throw new Error("LIVE_WEB_URL_REQUIRED");
  }
  return value;
};

describe("explicit live Web acceptance", () => {
  it("acquires one approved public HTML URL through the production safe path", async () => {
    const result = await runLiveWebAcceptance({
      url: requiredLiveWebUrl(),
      hints: {
        expectedDocumentType: "NewsArticle",
        expectedLanguage: "en",
        sourceName: "Live Web Acceptance",
      },
    });
    const diagnostic = result.success
      ? {
          success: true as const,
          connectorId: result.connectorId,
          terminalHttpClass: result.terminalHttpClass,
          mediaType: result.mediaType,
          sourceDocumentProduced: result.sourceDocumentProduced,
          contentHashProduced: result.contentHashProduced,
          acquisitionIdentityProduced: result.acquisitionIdentityProduced,
          persistenceEnabled: result.persistenceEnabled,
          refetchObserved: result.refetchObserved,
          redecodeObserved: result.redecodeObserved,
        }
      : {
          success: false as const,
          stage: result.stage,
          reason: result.reasonCode,
        };
    console.log(`${ACCEPTANCE_MARKER}${JSON.stringify(diagnostic)}`);
    expect(result).toMatchObject({
      success: true,
      connectorId: "web",
      mediaType: "text/html",
    });
    if (result.success) {
      expect(result.acquisitionId).not.toBe("");
      expect(result.sourceIdentity).not.toBe("");
      expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(result.sourceDocumentId).not.toBe("");
    }
  });
});
