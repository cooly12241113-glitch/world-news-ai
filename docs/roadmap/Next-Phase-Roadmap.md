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

**Status: IMPLEMENTED / INTEGRATION VERIFIED / BROWSER ACCEPTED / FINAL COMPLETE**

Sprint 15 composes the existing Contract, Context, generation, Script, and
Session APIs behind a thin application service and migrates the fixture Web
bootstrap source without adding live services.

- 15.1: run contracts and thin orchestrator — **IMPLEMENTED / REVIEWED / COMPLETE**
- 15.2: outcome, receipt, cancellation, and stale boundaries — **IMPLEMENTED / REVIEWED / COMPLETE**
- 15.3: deterministic fixture E2E and Web bootstrap — **IMPLEMENTED / BROWSER ACCEPTED / COMPLETE**
- 15.3A: runtime fixture compatibility repair — **IMPLEMENTED / BROWSER RE-ACCEPTED / COMPLETE**

See [Sprint 15.0 design](../sprints/Sprint-15.0-Briefing-Runtime-Orchestration-Design.md).

The fixture runtime boundary is proven. Live production integration remains
future work requiring separate approval.

Planning may begin after the accepted Interactive Briefing baseline. Any future
implementation must receive separate approval for real retrieval, generation,
backend, persistence, authentication, authorization, and operational policies.
Preserve the prior contracts and evidence lineage. This milestone does not
start Sprint 15 implementation.

## Sprint 16 — Personalized Impact Analysis

**Status: 16.0 DESIGN COMPLETE**

Add consented, caller-scoped exposure/scenario analysis. Do not introduce
direct buy/sell recommendations or inferred sensitive attributes.

The compatibility audit and implementation contract are defined in
[Sprint 16.0](../sprints/Sprint-16.0-Personalized-Impact-Analysis-Design.md).
Sprint 16.1 explicit context and exposure contracts are **IMPLEMENTED /
REVIEWED / COMPLETE**. See
[Sprint 16.1](../sprints/Sprint-16.1-Explicit-Personal-Context-Exposure-Contracts.md).

Sprint 16.2 personalized impact channel and scenario domain is **IMPLEMENTED /
REVIEWED / COMPLETE**. Runtime and presentation integration remain
deferred. See
[Sprint 16.2](../sprints/Sprint-16.2-Personalized-Impact-Channel-Scenario-Domain.md).

Sprint 16.3 personalized impact runtime and briefing integration is
**IMPLEMENTED / REVIEWED / COMPLETE**. It connects explicit
personalized intent to the optional impact stage, safe generation projection,
Plan/Script bindings, runtime lineage, and deterministic Contract-to-Session
tests without adding Web UI. See
[Sprint 16.3](../sprints/Sprint-16.3-Personalized-Impact-Runtime-Briefing-Integration.md).

Sprint 16.4 My Lens presentation and existing-Composer follow-up integration
is **IMPLEMENTED / REVIEWED / BROWSER ACCEPTED / COMPLETE**. It consumes only the safe
personalized projection already carried by a validated Script and leaves
ordinary briefing semantics unchanged. See
[Sprint 16.4](../sprints/Sprint-16.4-My-Lens-Presentation-Follow-up.md).

## Milestone 03 — Personalized Intelligence Baseline (Complete)

Sprint 16.0–16.4 are accepted as the privacy-minimized personalized
intelligence baseline. See
[Milestone 03](../milestones/Milestone-03-Personalized-Intelligence-Baseline.md).

## Strategic Intelligence North Star — Candidate Architecture Plan

The following sequence is planning only. It does not authorize production
implementation, providers, ingestion, persistence, or an Explore redesign.

1. Sprint 17 — Source Intelligence Foundation
2. Sprint 18 — Media & OSINT Intelligence
3. Sprint 19 — Competing Hypothesis & Evidence Verification
4. Sprint 20 — Analysis Depth Router
5. Sprint 21 — Advisory Council Foundation / Blind Analysis
6. Sprint 22 — Cross Examination / Revision / Red Team
7. Sprint 23 — Strategic Scenario Engine (Base / Worse / Severe / Tail-risk)
8. Sprint 24 — Early Warning Engine
9. Sprint 25 — War Room / Council Live
10. Sprint 26 — Multi-Model Council
11. Sprint 27 — Explore / Global Intelligence UI
12. Sprint 28 — Operational Intelligence / Monitoring

### Candidate design principles

- Evidence Reliability remains separate from political or ideological value.
- User values belong in a separate Value/Risk Evaluation layer.
- Existing fact/claim/inference/forecast/unknown posture remains authoritative.
  Confirmed, strong-inference, plausible-hypothesis, weak-signal, and
  speculation may be evaluated later as an orthogonal Hypothesis Strength
  axis; they do not replace epistemic posture.
- Numerical scenario probability requires a calibrated basis. Early strategic
  scenarios prefer qualitative or confidence-band expression.
- Preparedness and risk mitigation remain separate from direct transaction
  recommendations.
- Council Live exposes only publishable structured `CouncilStatement` output,
  never hidden chain-of-thought.
- Source acquisition is independent of LLM browsing and uses a dedicated
  Source Connector / ingestion architecture.

The next recommended activity is Sprint 17.0 — Strategic Intelligence
Compatibility Audit, not Sprint 17 production implementation.

## Cross-cutting prerequisites

Before unrestricted production ingestion: DNS-resolution SSRF controls,
retention/redaction policy, operational monitoring, and dependency/security
scanning. Before semantic retrieval: complete knowledge-record persistence and
an auditable deterministic fallback.
