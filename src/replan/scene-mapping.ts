import type { SceneReplacementMapping } from "../session";

export interface SceneMappingInput {
  strategy: SceneReplacementMapping["strategy"];
  currentSceneId: string;
  previousSceneIds: string[];
  replacementSceneIds: string[];
  completedSceneIds: string[];
}

export function createSceneReplacementMapping(
  input: SceneMappingInput,
): SceneReplacementMapping {
  const replacement = input.replacementSceneIds;
  if (replacement.length === 0 || new Set(replacement).size !== replacement.length) {
    throw new Error("Replacement scenes must be non-empty and unique.");
  }
  const indexOf = (sceneId: string): number => replacement.indexOf(sceneId);
  if (input.strategy === "preserve-current-scene") {
    if (indexOf(input.currentSceneId) < 0) {
      throw new Error("Current scene cannot be preserved.");
    }
    return {
      strategy: "preserve-current-scene",
      viewportPolicy: "preserve-when-scene-survives",
    };
  }
  if (input.strategy === "restart-at-opening") {
    return {
      strategy: "restart-at-opening",
      viewportPolicy: "apply-replacement-scene-camera",
    };
  }
  let targetSceneId: string | undefined;
  if (input.strategy === "map-to-replacement-scene") {
    targetSceneId = replacement.includes(input.currentSceneId)
      ? input.currentSceneId
      : undefined;
  } else if (input.strategy === "map-to-nearest-preceding-scene") {
    targetSceneId = [...input.completedSceneIds]
      .reverse()
      .find((id) => replacement.includes(id));
  } else {
    const previous = new Set(input.previousSceneIds);
    targetSceneId = replacement.find((id) => !previous.has(id));
  }
  if (targetSceneId === undefined) {
    throw new Error("Scene mapping target is unavailable.");
  }
  return {
    strategy: input.strategy,
    targetSceneId,
    targetSceneIndex: indexOf(targetSceneId),
    viewportPolicy:
      input.strategy === "map-to-nearest-preceding-scene"
        ? "preserve-when-scene-survives"
        : "apply-replacement-scene-camera",
  };
}
