import { describe, expect, it } from "vitest";
import type { BriefingScriptDraft } from "@world-news-ai/script-web";
import { buildDemoScript } from "../fixtures/build-demo-script";
import { adaptBriefingScript } from "./presentation-adapter";

describe("Web presentation adapter", () => {
  it("preserves fingerprint, references, order, and input immutability", () => {
    const script = buildDemoScript();
    const before = structuredClone(script);
    const result = adaptBriefingScript(Object.freeze(script));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.fingerprint).toBe(script.fingerprint);
    expect(result.value.scenes.map(({ order }) => order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.value.scenes[3]?.contentBindings[0]?.contextItemIds)
      .toEqual(script.scenes[3]?.contentBindings[0]?.contextItemIds);
    expect(script).toEqual(before);
  });

  it("rejects an invalid script status", () => {
    const script: BriefingScriptDraft = structuredClone(buildDemoScript());
    script.status = "draft";
    expect(adaptBriefingScript(script)).toMatchObject({
      success: false, error: { code: "INVALID_SCRIPT" },
    });
  });

  it.each([
    ["map", 1, "map"], ["map-flow", 3, "map"], ["chart", 4, "chart"],
    ["document", 5, "document"], ["text", 0, "text"],
  ])("maps %s scenes to %s surface", (_name, index, expected) => {
    const result = adaptBriefingScript(buildDemoScript());
    if (!result.success) throw new Error("adaptation failed");
    expect(result.value.scenes[index]?.primarySurface).toBe(expected);
  });
});
