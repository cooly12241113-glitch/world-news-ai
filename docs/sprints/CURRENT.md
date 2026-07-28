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

Sprint 14.1 — Briefing Session Domain and Deterministic Reducer.

**Status:** IMPLEMENTED

Sprint 14.0 design is complete. Sprint 14.1 implements the UI-independent
session aggregate, strict commands, deterministic reducer, semantic
fingerprints, privacy-minimized audit records, and an in-memory repository.
It adds no UI, live follow-up/replanning, backend, network, LLM, or migration.

- [Sprint 14 design](Sprint-14-Interactive-Briefing-Session.md)
- [Sprint 14.1 delivery](Sprint-14.1-Briefing-Session-Domain.md)
- [Session state machine](../architecture/Briefing-Session-State-Machine.md)
- [Follow-up and replanning contract](../architecture/Follow-up-and-Replanning-Contract.md)
- [Implementation matrix](../architecture/Sprint-14-Implementation-Matrix.md)

## Next target

- Sprint 14.2: fixture-only follow-up/replan adapter
- Sprint 14.3: Web session and UI integration

## Known non-blocking debt

Production DNS-rebinding controls, complete knowledge-record persistence,
semantic retrieval, context-package persistence, and operational
retention/redaction policy remain future work.
