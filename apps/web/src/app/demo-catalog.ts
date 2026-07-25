import { buildDemoScript } from "../fixtures/build-demo-script";

export const demoCatalog = [
  { id: "map-impact", label: "Map impact", description: "Technology policy → East Asian supply chain", script: buildDemoScript("auto") },
  { id: "fact-check", label: "Fact verification", description: "Primary document and evidence limits", script: buildDemoScript("document-led") },
  { id: "static", label: "Static", description: "Accessible presentation without motion", script: buildDemoScript("static") },
  { id: "reduced", label: "Reduced motion", description: "Minimal transitions and full captions", script: buildDemoScript("reduced-motion") },
] as const;
