# Next Phase Roadmap

This roadmap records candidates only; it does not implement them.

## Sprint 10 — ExplanationPlan Domain & Validator (Complete)

Define evidence-referenced explanation steps, section/visual instructions,
uncertainty obligations, validation, and deterministic plan fingerprints.

## Sprint 11 — Structured LLM Adapter (Complete)

Add a provider-neutral structured generation port with schema validation,
redaction, retry boundaries, audit metadata, and a deterministic offline fake.

## Sprint 12 — Briefing Script Compiler (Complete)

Compile validated plans into renderer-neutral scenes and narration contracts
without adding facts outside the context package.

## Milestone 02 — Pre-Renderer Readiness Audit (Complete)

Audit Sprint 00–12 contract compatibility, identity, provenance, determinism,
validation, security, and renderer-ready script boundaries. Final decision:
READY_WITH_NON_BLOCKING_DEBT.

## Sprint 13.1 — Renderer Prototype and Hardening (Complete)

Prototype map, chart, timeline, document, comparison, evidence-board, and text
renderers selected by the visual policy, with manual-only navigation, replay
scene motion, Composer context, MapLibre interaction handling, and responsive
safe viewport behavior.

## Sprint 14 — Interactive Briefing Session and Follow-up

**Status: COMPLETE**

Sprint 14.0 design and Sprint 14.1–14.3B delivery are complete. Sprint 14.3B
has passed automated validation, Chrome review, and final user browser
acceptance.

- Sprint 14.0: design complete
- Sprint 14.1: session domain and deterministic reducer implemented
- Sprint 14.2: deterministic follow-up and fixture replan adapter implemented
- Sprint 14.3A: follow-up outcome orchestrator implemented
- Sprint 14.3B: Composer and Session UI integration implemented, browser
  accepted, and final complete

Navigation remains manual-only. Live retrieval, LLM, backend, and persistent
session storage remain outside Sprint 14.

## Milestone 02 — Interactive Briefing Baseline (Complete)

Sprint 10–14 integration, identity, provenance, epistemic posture, Session and
Web atomic application, follow-up/replan, map/motion, accessibility, and favicon
delivery are audited. User-operated Chrome acceptance is complete. True append
and browser failure fixtures remain absent.
The existing MapLibre bundle-size warning is accepted debt; dark vector maps
and a 3D globe remain future renderer Sprint candidates.

## Sprint 15 — Briefing Runtime Orchestration

Sprint 15.0 runtime design and compatibility audit is **DESIGN COMPLETE**.
Implementation has not started. The design composes the existing
Contract, Context, generation, Script, and Session APIs behind a thin
application service, then migrates only the fixture Web bootstrap source.

- 15.1: run contracts and thin orchestrator — **IMPLEMENTED / REVIEWED / COMPLETE**
- 15.2: outcome, receipt, cancellation, and stale boundaries — **READY FOR IMPLEMENTATION**
- 15.3: deterministic fixture E2E and Web bootstrap

See [Sprint 15.0 design](../sprints/Sprint-15.0-Briefing-Runtime-Orchestration-Design.md).

The former production follow-up direction remains future work after the
fixture runtime boundary is proven.

Planning may begin after the accepted Interactive Briefing baseline. Any future
implementation must receive separate approval for real retrieval, generation,
backend, persistence, authentication, authorization, and operational policies.
Preserve the prior contracts and evidence lineage. This milestone does not
start Sprint 15 implementation.

## Sprint 16 — Personalized Impact Analysis

Add consented, caller-scoped exposure/scenario analysis. Do not introduce
direct buy/sell recommendations or inferred sensitive attributes.

## Cross-cutting prerequisites

Before unrestricted production ingestion: DNS-resolution SSRF controls,
retention/redaction policy, operational monitoring, and dependency/security
scanning. Before semantic retrieval: complete knowledge-record persistence and
an auditable deterministic fallback.
