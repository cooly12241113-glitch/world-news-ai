import { describe, expect, it } from "vitest";
import { briefingScriptFingerprint } from "../fingerprint";
import { BriefingScriptValidator } from "../validator";
import { compiled } from "./fixtures";

describe("BriefingScript validator and fingerprint", () => {
  it("validates a compiled script", () => {
    const { input, script } = compiled();
    expect(new BriefingScriptValidator().validate(
      script, input.plan, input.contract, input.contextPackage,
    ).outcome).toMatch(/valid/);
  });

  it("detects duplicate order and missing plan coverage", () => {
    const { input, script } = compiled();
    const broken = structuredClone(script);
    broken.scenes[1]!.order = 0;
    broken.scenes[1]!.sourceStepIds = [];
    const result = new BriefingScriptValidator().validate(broken, input.plan, input.contract, input.contextPackage);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["INVALID_SCENE_ORDER", "MISSING_PLAN_STEP_COVERAGE"]),
    );
  });

  it.each([
    ["self", (script: ReturnType<typeof compiled>["script"]) => {
      script.scenes[1]!.dependsOnSceneIds = [script.scenes[1]!.id];
    }],
    ["direct cycle", (script: ReturnType<typeof compiled>["script"]) => {
      script.scenes[0]!.dependsOnSceneIds = [script.scenes[1]!.id];
      script.scenes[1]!.dependsOnSceneIds = [script.scenes[0]!.id];
    }],
    ["missing", (script: ReturnType<typeof compiled>["script"]) => {
      script.scenes[1]!.dependsOnSceneIds = ["missing"];
    }],
  ])("detects %s dependency failure", (_name, mutate) => {
    const { input, script } = compiled(); mutate(script);
    const result = new BriefingScriptValidator().validate(script, input.plan, input.contract, input.contextPackage);
    expect(result.issues.some(({ code }) =>
      code === "SCENE_DEPENDENCY_CYCLE" || code === "BROKEN_SCENE_DEPENDENCY")).toBe(true);
  });

  it("rejects broken content, provenance, and citation references", () => {
    const { input, script } = compiled();
    const scene = script.scenes.find(({ contentBindings }) => contentBindings.length)!;
    scene.contentBindings[0]!.contextItemIds = ["missing"];
    scene.contentBindings[0]!.provenanceRecordIds = ["missing"];
    scene.citationCues = [];
    const result = new BriefingScriptValidator().validate(script, input.plan, input.contract, input.contextPackage);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["BROKEN_CONTENT_BINDING", "BROKEN_CITATION_REFERENCE"]),
    );
  });

  it("rejects provenance and citations that cross the scene evidence boundary", () => {
    const { input, script } = compiled();
    const scene = script.scenes.find(({ contentBindings }) => contentBindings.length)!;
    scene.contentBindings[0]!.sourceDocumentIds = ["invented-document"];
    scene.citationCues[0]!.contextItemIds = ["invented-context"];
    const result = new BriefingScriptValidator().validate(
      script, input.plan, input.contract, input.contextPackage,
    );
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["BROKEN_CONTENT_BINDING", "BROKEN_CITATION_REFERENCE"]),
    );
  });

  it("fingerprint ignores generated IDs, timestamps, warnings, and reference order", () => {
    const { script } = compiled();
    const changed = structuredClone(script);
    changed.id = "different"; changed.createdAt = "2030-01-01T00:00:00.000Z";
    changed.warnings.reverse();
    const sceneIds = new Map(changed.scenes.map((scene) => [scene.id, `different-${scene.id}`]));
    for (const scene of changed.scenes) {
      scene.id = sceneIds.get(scene.id)!;
      scene.dependsOnSceneIds = scene.dependsOnSceneIds.map((id) => sceneIds.get(id)!);
      scene.sourceStepIds.reverse(); scene.sourceSectionIds.reverse();
      scene.contentBindings.forEach((binding) => {
        binding.id = `different-${binding.id}`; binding.contextItemIds.reverse();
      });
    }
    expect(briefingScriptFingerprint(changed)).toBe(briefingScriptFingerprint(script));
  });

  it.each([
    ["scene order", (script: ReturnType<typeof compiled>["script"]) => { script.scenes[1]!.order += 3; }],
    ["presentation", (script: ReturnType<typeof compiled>["script"]) => { script.presentationPreference.mode = "chart-led"; }],
    ["animation", (script: ReturnType<typeof compiled>["script"]) => { script.presentationPreference.animationPolicy = "minimal"; }],
    ["plan", (script: ReturnType<typeof compiled>["script"]) => { script.explanationPlanFingerprint = "changed"; }],
    ["compiler", (script: ReturnType<typeof compiled>["script"]) => { script.compiler.version = "2"; }],
  ])("fingerprint changes with %s semantics", (_name, mutate) => {
    const { script } = compiled(); const changed = structuredClone(script); mutate(changed);
    expect(briefingScriptFingerprint(changed)).not.toBe(briefingScriptFingerprint(script));
  });
});
