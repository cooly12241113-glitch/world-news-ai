# Current Project Status

## Current Milestone

Milestone 02 — Pre-Renderer Integration & Completeness Audit

**Status:** READY_WITH_NON_BLOCKING_DEBT

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

- Prepare the Milestone 02 / Sprint 14 integration audit without changing the
  fixture-only boundary.

## Known non-blocking debt

Production DNS-rebinding controls, complete knowledge-record persistence,
semantic retrieval, context-package persistence, and operational
retention/redaction policy remain future work.
Live GPT/search, true-append and browser-failure fixtures, and production
backend integration remain unavailable. The existing MapLibre bundle-size
warning remains accepted debt; dark vector maps and a 3D globe belong to a
future renderer Sprint.
