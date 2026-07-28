import { describe, expect, it } from "vitest";
import { buildDemoScript } from "../../fixtures/build-demo-script";
import { createDemoBriefingSession } from "../session";
import { createFollowUpViewModel } from "./follow-up-view-model";

describe("follow-up view model", () => {
  it("never exposes raw prompt text", () => {
    const script = buildDemoScript();
    const session = createDemoBriefingSession(script, "2026-07-28T00:00:00.000Z");
    const failed = {
      outcome: "failed", retryable: true,
    } as const;
    expect(JSON.stringify(failed)).not.toContain("secret prompt");
    expect(createFollowUpViewModel({
      ...failed,
      executionId: "e", operationId: "o", sessionId: session.sessionId,
      startedFromSessionFingerprint: session.semanticFingerprint,
      previousSessionFingerprint: session.semanticFingerprint,
      nextSessionFingerprint: session.semanticFingerprint,
      policyVersion: "p", nextSession: session, recommendedUiAction: "show-retryable-error",
      semanticFingerprint: "f", errorCode: "FAILED",
      rollbackFingerprint: session.semanticFingerprint,
      scriptFingerprint: script.fingerprint,
    }).summary).not.toContain("FAILED");
  });
});
