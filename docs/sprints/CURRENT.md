# Current Project Status

## Current Milestone

Milestone 02 — Interactive Briefing Integration Audit

**Status:** IMPLEMENTED / AUDIT COMPLETE / BROWSER ACCEPTED / FINAL COMPLETE

Sprint 10–14 integration, identity, provenance, epistemic posture,
Session/Script/Player/Web atomic application, follow-up/replan, map/motion,
accessibility, and favicon delivery are audited and accepted. The fixture-only
baseline has 67 test files and at least 652 passing tests.

## Completed delivery

- Sprint 00–03: Event-centric domain and strict runtime validation
- Sprint 04: generalized source/evidence domain
- Sprint 05: adaptive source ingestion
- Sprint 06: persistent ingestion, identity, revisions, observations, jobs
- Sprint 07: evidence-first EventDossier
- Sprint 08: question intent and BriefingContract
- Sprint 09: evidence retrieval and EvidenceContextPackage
- Milestone 01: boundary, compatibility, determinism, provenance,
  failure-mode, security/privacy, dependency/runtime, and end-to-end audit

## Baseline state

- Foundation predecessor: `c4ead239ae29f7312f4ee61d847ac959215808aa`
- Baseline commit: `af50333f857b5f990741fff83176efbad36a250d`
- SQLite migration version: 2
- Test files: 51 passing
- Tests: 484 passing
- Integration scenarios: 4 offline deterministic scenarios
- External network/API/LLM calls in integration tests: none
- Architecture baseline: [System Architecture Baseline](../architecture/System-Architecture-Baseline.md)
- End-to-end flow: [End-to-End Data Flow](../architecture/End-to-End-Data-Flow.md)

## Current delivery

Sprint 13.1 — Interactive Briefing Renderer hardening.

**Status:** Complete

Validated BriefingScripts drive a fixture-only React/Vite player with MapLibre
behind an adapter, deterministic motion planning, accessible map/chart/document/
evidence surfaces, Bottom Composer, manual-only scene navigation, playback
controls, replay scene motion, and responsive safe viewport behavior.

## Current delivery

Sprint 14.3B — Composer, Session & Replan UI Integration.

**Status:** IMPLEMENTED / BROWSER ACCEPTED / FINAL COMPLETE

Sprint 14.0–14.3A are complete. Sprint 14.3B connects the existing Composer,
BriefingSession, core classifier, fixture resolver, outcome orchestrator,
atomic Script/presentation application, and AnalysisPanel. Automated
implementation checks, Codex Chrome review, and final user browser acceptance
are complete.

- [Sprint 14 design](Sprint-14-Interactive-Briefing-Session.md)
- [Sprint 14.1 delivery](Sprint-14.1-Briefing-Session-Domain.md)
- [Sprint 14.2 delivery](Sprint-14.2-Follow-up-and-Fixture-Replan.md)
- [Sprint 14.3A delivery](Sprint-14.3A-Follow-up-Outcome-Orchestrator.md)
- [Sprint 14.3B delivery](Sprint-14.3B-Composer-Session-UI-Integration.md)
- [Session state machine](../architecture/Briefing-Session-State-Machine.md)
- [Follow-up and replanning contract](../architecture/Follow-up-and-Replanning-Contract.md)
- [Implementation matrix](../architecture/Sprint-14-Implementation-Matrix.md)

## Next target

- Sprint 15.0 — Briefing Runtime Orchestration Design & Compatibility Audit.

  **Status:** DESIGN COMPLETE

  The application orchestration boundary, compatibility constraints, outcome,
  receipt, cancellation, stale-run policy, fixture E2E route, Web bootstrap
  migration, and Sprint 15.1–15.3 split are defined without implementation.
  See [Sprint 15.0 design](Sprint-15.0-Briefing-Runtime-Orchestration-Design.md).

- Sprint 15.1 — Briefing Run Contracts & Thin Orchestrator.

  **Status:** IMPLEMENTED / REVIEWED / COMPLETE

  Strict request, stage, outcome, and semantic-lineage contracts plus the thin
  application orchestrator are implemented against the existing Contract,
  Context, structured generation, Script, and Session APIs. Web bootstrap,
  operational receipt, clock/ID framework, advanced cancellation, and stale
  acceptance remain deferred. See
  [Sprint 15.1 delivery](Sprint-15.1-Briefing-Run-Contracts-Orchestrator.md).

- Sprint 15.2 — Runtime Receipt, Cancellation & Execution Identity.

  **Status:** READY FOR IMPLEMENTATION

  Sprint 15 remains in progress. Web bootstrap integration remains deferred to
  Sprint 15.3.

## Known non-blocking debt

Production DNS-rebinding controls, complete knowledge-record persistence,
semantic retrieval, context-package persistence, and operational
retention/redaction policy remain future work.
Live GPT/search, true-append and browser-failure fixtures, and production
backend integration remain unavailable. The existing MapLibre bundle-size
warning remains accepted debt; dark vector maps and a 3D globe belong to a
future renderer Sprint.
