# ADR-012: Renderer-Independent Briefing Script

- Status: Accepted
- Date: 2026-07-25

## Decision

Introduce `BriefingScript` between a validated explanation plan and future
motion/rendering layers. A deterministic compiler maps every required plan
section and step into ordered scenes, preserves evidence/provenance and
epistemic constraints, and produces only semantic presentation directives.

Presentation preference is explicit and user choice overrides automatic
selection. Static and reduced-motion modes disable or minimize camera motion.
Autoplay is always false and playback is user initiated.

The product layout contract fixes the composer at bottom center. During
playback it collapses into controls; focusing it pauses playback while
preserving the current visual viewport for future replanning.

`BriefingScriptValidator` checks identity, plan coverage, evidence/citations,
scene ordering and DAGs, visual/camera policy, fixed composer/safe viewport,
interaction, accessibility, and stop conditions. Invalid scripts cannot become
validated renderer input.

## Consequences

- Explanation defines what to explain; Script defines scene requirements;
  Motion Planner computes physical movement; Renderer executes presentation.
- No UI, map, chart, OpenAI, HTTP, or SQLite dependency enters `script`.
- Semantic fingerprints exclude generated IDs and timestamps.
- No migration or persistence adapter is introduced.
