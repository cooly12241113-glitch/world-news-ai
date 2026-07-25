# Sprint 13 — Interactive Briefing Renderer Prototype

- Status: Complete
- Scope: fixture-only web prototype
- Persistence migration: none; version remains 2

Sprint 13 adds a React/Vite application that consumes only validated or
static-only BriefingScripts through a browser-safe presentation adapter. The
prototype renders a persistent MapLibre map during map sequences, semantic
surfaces, captions, citations, uncertainty, a bottom composer, and playback
controls. It contains no backend, live provider, ingestion, authentication, or
database write.

## Delivery

- Presentation adapter and structured renderer errors
- Player reducer, keyboard controls, and bounded scene auto-advance
- Scene dispatcher for map, chart, document, evidence, comparison/timeline/text fallback
- Map adapter port with MapLibre and deterministic fake implementations
- Fixture location catalog, target resolution, overlays, and Motion Planner v0
- Safe viewport calculation for composer, caption, side panel, and mobile sheet
- Static and reduced-motion policies
- Four schema-validated demo scripts and eight renderer integration scenarios
- Responsive, accessible dark intelligence-dashboard prototype

Sprint 14 may build richer player interactions on the validated boundaries. It
must not introduce evidence, verdicts, or renderer state into core contracts.
