import { describe, expect, it } from "vitest";
import { RuleBasedBriefingScriptCompiler } from "../compiler";
import { compileInput, compiled, now } from "./fixtures";

describe("RuleBasedBriefingScriptCompiler", () => {
  it("compiles every required plan section and step", () => {
    const { input, script } = compiled();
    const coveredSections = new Set(script.scenes.flatMap(({ sourceSectionIds }) => sourceSectionIds));
    const coveredSteps = new Set(script.scenes.flatMap(({ sourceStepIds }) => sourceStepIds));
    expect(input.plan.sections.every(({ id }) => coveredSections.has(id))).toBe(true);
    expect(input.plan.sections.flatMap(({ steps }) => steps).every(({ id }) => coveredSteps.has(id))).toBe(true);
  });

  it("creates opening, closing, citations, narration requirements, and no prose", () => {
    const { input, script } = compiled();
    expect(script.scenes[0]?.kind).toBe("opening");
    expect(script.scenes.at(-1)?.kind).toBe("closing");
    expect(script.scenes.filter(({ contentBindings }) => contentBindings.length)
      .every(({ citationCues }) => citationCues.length > 0)).toBe(true);
    expect(JSON.stringify(script)).not.toContain(input.contextPackage.excerpts[0]?.text);
  });

  it("keeps bottom composer, playback transition, interaction, and safe viewport", () => {
    const { script } = compiled();
    expect(script.playbackPolicy).toMatchObject({
      autoplay: false, userInitiated: true, composerDuringPlayback: "playback-controls",
    });
    expect(script.interactionPolicy).toMatchObject({
      pauseOnComposerFocus: true, pauseOnManualMapInteraction: true,
      preserveUserView: true, followUpContext: "current-scene",
    });
    expect(script.scenes.every(({ layoutDirective }) =>
      layoutDirective.composerPosition === "bottom-center" &&
      layoutDirective.safeViewport.reserveBottomComposer &&
      layoutDirective.safeViewport.mobileSafeAreaRequired)).toBe(true);
  });

  it.each(["static", "reduced-motion"] as const)("creates a %s fallback without camera motion", (mode) => {
    const result = new RuleBasedBriefingScriptCompiler(() => new Date(now)).compile(compileInput(mode));
    expect(result).toMatchObject({ success: true, outcome: "validated-static-script" });
    if (!result.success || !("script" in result)) throw new Error("script missing");
    expect(result.script.scenes.flatMap(({ visualDirectives }) => visualDirectives)
      .every(({ cameraIntent }) => cameraIntent.action === "no-camera-motion")).toBe(true);
  });

  it("is deterministic across compilation time", () => {
    const input = compileInput();
    const first = new RuleBasedBriefingScriptCompiler(() => new Date(now)).compile(input);
    const second = new RuleBasedBriefingScriptCompiler(() => new Date("2030-01-01T00:00:00.000Z")).compile(input);
    if (!first.success || !second.success || !("script" in first) || !("script" in second)) throw new Error("script missing");
    expect(first.script.fingerprint).toBe(second.script.fingerprint);
  });

  it("stops for an unvalidated plan and insufficient context", () => {
    const invalid = compileInput();
    invalid.plan = { ...invalid.plan, status: "draft" } as never;
    expect(new RuleBasedBriefingScriptCompiler().compile(invalid))
      .toMatchObject({ success: false, error: { code: "PLAN_NOT_VALIDATED" } });
    const insufficient = compileInput();
    insufficient.contextPackage.status = "insufficient-evidence";
    expect(new RuleBasedBriefingScriptCompiler().compile(insufficient))
      .toMatchObject({ success: true, outcome: "insufficient-context" });
  });
});
