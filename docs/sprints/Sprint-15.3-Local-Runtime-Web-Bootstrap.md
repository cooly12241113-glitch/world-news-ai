# Sprint 15.3 — Local Runtime and Web Bootstrap

**Status:** IMPLEMENTED / BROWSER ACCEPTED / COMPLETE

## Goal and baseline

Replace the Web app's prebuilt Script bootstrap with the deterministic local
BriefingRun pipeline while preserving the accepted Sprint 14 presentation,
player, map, and follow-up behavior. The baseline is commit
`0cbd4cd68b13c2073d64569bbfdc0601e3a792b4`.

## Bootstrap architecture

Before: `demoCatalog → buildDemoScript → createDemoBriefingSession → Web`.

After: `Web bootstrap → local fixture evidence → BriefingRunService → Contract
→ Context → structured fixture generation → ExplanationPlan → Script → Session
→ existing presentation/player/follow-up UI`.

The local runtime assembles the existing compilers, context builder, structured
generation coordinator, deterministic provider, and Session fingerprinting. It
does not return a prebuilt Script and does not bypass a pipeline stage.

## Web adapters and cancellation

The Web boundary supplies `crypto.randomUUID()` runtime IDs,
`new Date().toISOString()` clock values, and an AbortController bridge. These
concrete browser dependencies do not enter the application runtime contracts.
Cleanup or replacement cancels the prior handle, and cooperative cancellation
prevents late Script or Session application.

## StrictMode and run acceptance

Each effect lifecycle owns one runtime handle. Cleanup cancels that handle.
`BootstrapRunController` retains only the latest run identity and uses the pure
`isCurrentBriefingRun()` helper before applying a result. A stale, cancelled, or
superseded run cannot mutate the Web state. React StrictMode remains enabled.

## Ownership and atomic application

A completed outcome is adapted into one coherent bootstrap value containing
the validated Script, validated Session, and presentation. The existing
follow-up controller receives the Script/Session pair and remains the single
authoritative Session owner. App does not retain a second Session. The existing
Player reducer continues to own its cursor and synchronizes against the
accepted Script and Session.

## Bootstrap outcomes and accessibility

The minimal states are `loading`, `ready`, and `terminal-unavailable`. Loading
uses an accessible polite status. Any non-completed outcome becomes a safe,
generic terminal message; raw exceptions, questions, prompts, receipts, and
provider responses are not exposed.

## Fixture and test coverage

The runtime uses two local fixture documents and the deterministic structured
provider. It is fixture-only and does not imply live retrieval or AI access.
Tests cover the complete local pipeline, receipt lineage, Script/Session
identity, cancellation, latest-run acceptance, cleanup, safe terminal mapping,
and asynchronous App bootstrap. Existing Sprint 14 regression tests remain.

## Browser acceptance result

The ChatGPT/Codex desktop built-in browser accepted the localhost fixture at
`http://127.0.0.1:5173`. Opening 1/7, Global Overview 2/7, Impact Path 4/7,
the MapLibre surface, the United States–Taiwan–South Korea route, three role
markers, current-context, current-scene revision, clarification, keep-current,
full rebuild, map drag/zoom, camera restoration, and replay all passed. The
browser console contained no duplicate citation-key warning or React runtime
warning/error, and no automatic scene advancement occurred.

The built-in browser did not expose complete request-level network
certification, so this acceptance does not claim exactly zero browser requests.
Source audit confirms no OpenAI, search, backend, or telemetry integration was
added. Existing MapLibre map network behavior remains allowed.

## Boundaries and known limitations

There is no live GPT, search, backend, persistence, telemetry, authentication,
or billing. Map tile traffic remains the accepted renderer dependency. The
runtime remains fixture-only; true append and browser failure fixtures are not
available. The existing MapLibre bundle-size warning remains. Dark vector maps
and 3D globe rendering remain future renderer work.

## Sprint 15 completion criteria

Sprint 15.3 passed automated validation and browser acceptance. Its compatibility
repair is recorded in Sprint 15.3A, and Sprint 15 is final complete.

## Browser acceptance failure and Sprint 15.3A repair

The first browser acceptance exposed compatibility regressions: generic plan
requirements leaked into visible scene semantics, canonical geographic intent
was absent from the runtime proposal, duplicate visible evidence IDs made
clarification and full rebuild fail validation, and compiler binding IDs could
collide within one step. Sprint 15.3A repairs these causes while preserving the
runtime-first architecture. The accepted demo semantics are now shared as
domain-level fixture data, not as a precompiled Script or bootstrap shortcut.
See [Sprint 15.3A repair](Sprint-15.3A-Runtime-Fixture-Compatibility-Repair.md).

## Out of scope

Live services, AnswerPolicy, true append, persistence, UI redesign, dark maps,
3D globe, and Sprint 16 work are excluded.
