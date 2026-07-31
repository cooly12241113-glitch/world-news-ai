# Sprint 15.3A — Runtime Fixture Compatibility Repair

**Status:** IMPLEMENTED / BROWSER RE-ACCEPTED / COMPLETE

## Purpose

Repair the regressions found during Sprint 15.3 browser acceptance without
reverting the runtime-first Web bootstrap or bypassing any domain stage.

## Root causes

- The generic rule-based plan proposal exposed requirement wording as visible
  scene semantics instead of the accepted seven-scene fixture semantics.
- The local evidence context and deterministic proposal omitted the canonical
  location identities and renderer-neutral geographic intents required for map
  scenes, routes, markers, viewports, and motion.
- Runtime-generated scenes could repeat visible evidence IDs. Follow-up context
  validation rejected those duplicates before clarification and full rebuild.
- The Script compiler used a step index for every binding in that step, allowing
  stable binding and citation IDs to collide.

The earlier focus returning to `BODY` was not reproduced during final browser
acceptance: map, button, and analysis-heading focus remained valid. No arbitrary
autofocus or map-focus behavior is introduced; future regression monitoring is
retained as Low debt.

## Repair

The accepted Sprint 13/14 demo meaning is extracted into one domain-level
canonical fixture. The local deterministic adapter converts the real
ExplanationPlan draft and EvidenceContextPackage into a structured proposal,
then adds the canonical scene objectives, plan kinds, visual intents, location
bindings, and data bindings. The proposal still passes through structured
generation validation and the real Script compiler.

The local context now contains explicit canonical location evidence. Follow-up
context construction de-duplicates visible evidence IDs while retaining their
first stable order. Compiler occurrence IDs use the binding position within the
step and derive location bindings from the actual context item.

## Preserved architecture

`Web → LocalBriefingRuntime → BriefingRunService → Contract → Context →
ExplanationPlan → structured generation → Script compiler → Session`

The Web bootstrap does not call `buildDemoScript`. The runtime and deterministic
provider do not return a precompiled BriefingScript.

## Regression coverage

- Runtime-generated canonical seven-scene order and objectives
- Opening, Global Overview, and Impact Path semantics
- Map-flow location, camera, route, and marker-compatible metadata
- Unique citation and evidence occurrence identities
- Runtime bootstrap followed by current-scene revision
- Clarification plus keep-current identity preservation
- Full rebuild with seven changed and seven removed scenes
- Existing renderer, player, map, and follow-up regression suites

## Browser re-acceptance

The ChatGPT/Codex desktop built-in browser passed the complete repair flow:
Opening 1/7, Global Overview 2/7, Impact Path 4/7, MapLibre route and three
markers, current-context, revision with Changed 1 / Preserved 6 / Removed 0,
clarification with three options, keep-current, full rebuild with Changed 7 /
Preserved 0 / Removed 7, return to Opening and Global Overview, drag/zoom,
map-view conflict handling, camera restoration, and replay. Duplicate citation
key warnings and React runtime warnings/errors were zero.

Complete browser request-level network certification was unavailable. Source
audit confirms that no OpenAI, search, backend, or telemetry integration was
added; existing MapLibre network behavior remains allowed.

## Sprint 15 final architecture

Before Sprint 15: `App → prebuilt demo Script → Session → UI`.

After Sprint 15: `CreateBriefingRequest → BriefingRunService → Contract →
Context → structured generation → ExplanationPlan → Script → Session → Web
presentation`.

Operational execution includes injected run identity and clock, a
privacy-minimized receipt, cooperative cancellation, late-result rejection,
stale-run acceptance, and strict structured outcomes. Web integration uses the
local deterministic runtime and browser adapters while the follow-up controller
remains the single authoritative Session owner.

## Boundaries

No live GPT, search, backend, telemetry, dependency, migration, UI redesign,
renderer rewrite, AnswerPolicy, true append, dark strategic map, 3D globe,
Strategic Foresight Engine, or Sprint 16 work is included. Sprint 15 is
implemented, integration verified, browser accepted, and final complete.
