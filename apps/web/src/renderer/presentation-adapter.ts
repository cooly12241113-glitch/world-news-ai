import type {
  BriefingScene,
  BriefingScriptDraft,
  PresentationMode,
  ValidatedBriefingScript,
} from "@world-news-ai/script-web";
import { rendererFailure, type RendererResult } from "./renderer-result";

export type RenderSurfaceKind =
  | "map" | "chart" | "document" | "timeline" | "evidence-board"
  | "comparison" | "text" | "unsupported";

export interface RenderableScene {
  id: string;
  order: number;
  kind: BriefingScene["kind"];
  objective: string;
  primarySurface: RenderSurfaceKind;
  visualDirectives: BriefingScene["visualDirectives"];
  contentBindings: BriefingScene["contentBindings"];
  caption: BriefingScene["captionDirective"];
  citations: BriefingScene["citationCues"];
  uncertainties: BriefingScene["uncertaintyCues"];
  layout: BriefingScene["layoutDirective"];
}

export interface RenderableBriefing {
  scriptId: string;
  fingerprint: string;
  titleRequirement: string;
  mode: PresentationMode;
  scenes: RenderableScene[];
  playbackPolicy: ValidatedBriefingScript["playbackPolicy"];
  interactionPolicy: ValidatedBriefingScript["interactionPolicy"];
  accessibilityPolicy: ValidatedBriefingScript["accessibilityPolicy"];
}

const surface = (scene: BriefingScene): RenderSurfaceKind => {
  const mode = scene.visualDirectives[0]?.mode;
  if (mode === "map" || mode === "map-flow") return "map";
  if (mode === "chart") return "chart";
  if (mode === "document") return "document";
  if (mode === "timeline") return "timeline";
  if (mode === "evidence-board") return "evidence-board";
  if (mode === "comparison") return "comparison";
  if (mode === "text" || mode === undefined) return "text";
  return "unsupported";
};

export function adaptBriefingScript(
  script: BriefingScriptDraft,
): RendererResult<RenderableBriefing> {
  if (script.status !== "validated" && script.status !== "static-only") {
    return rendererFailure("INVALID_SCRIPT", "Only validated scripts can be rendered.");
  }
  const scenes = [...script.scenes].sort((left, right) => left.order - right.order)
    .map((scene): RenderableScene => ({
      id: scene.id,
      order: scene.order,
      kind: scene.kind,
      objective: scene.objective,
      primarySurface: surface(scene),
      visualDirectives: scene.visualDirectives,
      contentBindings: scene.contentBindings,
      caption: scene.captionDirective,
      citations: scene.citationCues,
      uncertainties: scene.uncertaintyCues,
      layout: scene.layoutDirective,
    }));
  if (scenes.some((scene, index) => scene.order !== index)) {
    return rendererFailure("INVALID_SCRIPT", "Scene order is not contiguous.");
  }
  return {
    success: true,
    value: {
      scriptId: script.id,
      fingerprint: script.fingerprint,
      titleRequirement: script.titleRequirement,
      mode: script.presentationPreference.mode,
      scenes,
      playbackPolicy: script.playbackPolicy,
      interactionPolicy: script.interactionPolicy,
      accessibilityPolicy: script.accessibilityPolicy,
    },
    warnings: scenes.filter(({ primarySurface }) => primarySurface === "unsupported")
      .map(({ id }) => `Unsupported surface in ${id}`),
  };
}
