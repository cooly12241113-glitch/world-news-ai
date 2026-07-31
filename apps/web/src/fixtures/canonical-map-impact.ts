import type { SceneKind, SceneVisualDirective } from "@world-news-ai/script-web";

export interface CanonicalMapImpactScene {
  kind: SceneKind;
  objective: string;
  mode?: SceneVisualDirective["mode"];
  locationIds: string[];
}

export const canonicalMapImpactScenes: readonly CanonicalMapImpactScene[] = [
  {
    kind: "opening",
    objective: "Frame the policy question and evidence boundary.",
    locationIds: [],
  },
  {
    kind: "global-overview",
    objective: "Establish the global technology-policy context.",
    mode: "map",
    locationIds: ["world"],
  },
  {
    kind: "regional-focus",
    objective: "Focus on the United States and East Asia.",
    mode: "map",
    locationIds: ["united-states", "east-asia"],
  },
  {
    kind: "impact-path",
    objective: "Trace the evidence-bound semiconductor supply path toward South Korea.",
    mode: "map-flow",
    locationIds: ["united-states", "taiwan", "south-korea"],
  },
  {
    kind: "supporting-evidence",
    objective: "Compare the fixture exposure indicator and primary policy source.",
    mode: "chart",
    locationIds: [],
  },
  {
    kind: "uncertainty",
    objective: "Separate assumptions, limits, and verification signals.",
    mode: "evidence-board",
    locationIds: [],
  },
  {
    kind: "closing",
    objective: "Return to the evidence boundary and invite a follow-up.",
    locationIds: [],
  },
] as const;

export const canonicalMapLocationIds = [...new Set(
  canonicalMapImpactScenes.flatMap(({ locationIds }) => locationIds),
)];
