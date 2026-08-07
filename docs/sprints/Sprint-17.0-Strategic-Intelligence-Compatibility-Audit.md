# Sprint 17.0 — Strategic Intelligence Compatibility Audit

## Status

**AUDIT COMPLETE / DESIGN COMPLETE / REVIEWED / COMPLETE**

Sprint 17.1 is **READY FOR IMPLEMENTATION**. This Sprint changes documentation only.
It adds no production source, tests, dependency, provider, connector, database
migration, scheduler, or UI behavior.

## Baseline and audit basis

- Expected and observed HEAD: `69dee4eb643e12d45858391097a73a6453b808b1`
  (`feat: complete personalized impact experience`).
- Branch `main`; `origin/main...main` was `0 0`; pre-audit tree was clean.
- Milestone 03 baseline: 75 test files / 746 tests, SQLite migration v2,
  package and lock files unchanged.
- The repository and attachment directories contain no separately named
  “Strategic Intelligence Handoff” artifact. The complete A–AT requirements
  embedded in the Sprint 17.0 request are therefore the audited handoff basis.
- Source-of-truth order remains Sprint document, `CURRENT.md`, architecture,
  `AGENTS.md`, then README.

## Documents reviewed

`CURRENT.md`, the Next Phase Roadmap, Milestone 03, System Architecture
Baseline, End-to-End Data Flow, ADR-005, ADR-006, Persistence Architecture,
Event Dossier Architecture, Evidence Retrieval & Context Architecture,
Structured LLM Generation Architecture, Question Briefing Architecture,
Runtime Validation Contract, Briefing Script Architecture, and Sprint
15.0–15.3A and 16.0–16.4 delivery documents were reviewed. Actual domain,
validation, ingestion, persistence, dossier, context, generation, explanation,
runtime, personalization, Script, Session, follow-up/replan, Web, and test
modules were then audited.

## Requirement matrix

Disposition means: **REUSE** an authoritative implementation, **EXTEND** it
additively, **NEW** for a genuinely absent bounded contract, or **DO NOT MERGE**
where existing semantics must remain separate.

| ID | Requirement | Status | Disposition | Repository evidence and finding |
| --- | --- | --- | --- | --- |
| A | Independent Source/Data Infrastructure | PARTIAL | EXTEND | Domain, ingestion, persistence, dossier, and context are port-separated; acquisition/discovery and live operations are absent. |
| B | Universal Source Connector | MISSING | NEW | No connector/acquisition port or credential/access-policy contract exists. |
| C | RAW Source preservation | PARTIAL | EXTEND | Resolver holds content transiently and normalized text is stored; immutable bytes, headers, hashes, retention, and redaction lifecycle are absent. |
| D | Source provenance | IMPLEMENTED | REUSE | Ingestion trace, observations/revisions, excerpts, provenance index, fingerprints, and capability IDs form a closed chain. |
| E | Source genealogy/repost lineage | MISSING | NEW | Exact fingerprint/canonical URL revision dedupe does not model repost, quote, translation, or laundering lineage. |
| F | Media ingestion | MISSING | NEW | Binary/PDF/audio/video/OCR acquisition is explicitly unsupported. `VideoTranscript` is only a normalized document enum. |
| G | Transcript + frame alignment | MISSING | NEW | No timecode, segment, frame, shot, or alignment contract. |
| H | RAW Media verification | MISSING | NEW | No media hash/signature/metadata/manipulation verification workflow. |
| I | OSINT verification | MISSING | NEW | No geolocation, chronolocation, reverse-media, or method-result model. |
| J | Evidence verification | PARTIAL | EXTEND | Evidence links, contradictions, provenance closure, and verification signals exist; verification tasks/results do not. |
| K | Source reliability | PARTIAL | EXTEND | Primary/source diversity and dossier confidence exist; no versioned source reliability assessment or history. |
| L | EventDossier | IMPLEMENTED | REUSE | Strict aggregate, claims, evidence, contradictions, completeness, open questions, revisions, memory/SQLite ports exist. |
| M | Competing hypotheses | MISSING | NEW | No hypothesis aggregate or competing-set lifecycle. |
| N | Hypothesis strength | MISSING | DO NOT MERGE | Must not be collapsed into source reliability, dossier confidence, or epistemic type. |
| O | Supporting/contradicting evidence | IMPLEMENTED | REUSE | `EvidenceLink`, claim assessments, contradictions, context sections, and reserved selection already encode both. |
| P | Alternative explanation | PARTIAL | EXTEND | Explanation/Script kinds can present alternatives, but no evidence-bound alternative hypothesis object exists. |
| Q | Falsification condition | MISSING | NEW | Open questions/counter-signals are not hypothesis falsification criteria. |
| R | Revision history | PARTIAL | EXTEND | Documents, dossiers, Scripts/Sessions and replacements have revision/identity behavior; hypotheses/scenarios/alerts do not. |
| S | Analysis Depth Router | PARTIAL | EXTEND | Intent, ambiguity, evidence gaps, stage outcomes, and budgets exist; no explicit risk/depth routing policy. |
| T | Advisory Council | MISSING | NEW | No council aggregate or orchestration. |
| U | Agent roles | MISSING | NEW | No role contracts for analyst, skeptic, verifier, red team, or judge. |
| V | Context isolation | PARTIAL | EXTEND | Requests and evidence packages are closed and request-scoped; per-agent isolated views are absent. |
| W | Blind independent analysis | MISSING | NEW | No blind phase or output-sealing protocol. |
| X | Evidence partition | PARTIAL | EXTEND | Context allowlists can support partitions; no council partition plan or enforcement. |
| Y | Tool permission partition | MISSING | NEW | No agent-scoped tool capability policy or enforcement record. |
| Z | Cross examination | MISSING | NEW | No structured challenges/responses linked to claims and evidence. |
| AA | Agent revision | MISSING | NEW | No post-challenge council revision lifecycle. |
| AB | Red Team | MISSING | NEW | No bounded adversarial review stage or contract. |
| AC | Final Judge | MISSING | NEW | No judge decision schema, quorum policy, or dissent preservation. |
| AD | Multi-model provider abstraction | PARTIAL | EXTEND | `StructuredGenerationProvider` is provider-neutral with fake/OpenAI adapters; council routing, multiple live providers, and correlated-failure controls are absent. |
| AE | Independence Score | MISSING | NEW | Source diversity is not agent/model independence; no measurable score exists. |
| AF | CouncilStatement | MISSING | NEW | Dossier/Explanation statements are reusable inputs, but no council-specific claim/evidence/dissent/revision record. |
| AG | Council Live | MISSING | DO NOT MERGE | A future view may expose validated statements and dissent, never hidden chain-of-thought. |
| AH | Strategic Scenario Engine | MISSING | DO NOT MERGE | Sprint 16 scenarios are personal exposure branches, not system-level strategic scenarios. |
| AI | Base/Worse/Severe/Tail-risk | MISSING | NEW | No strategic scenario taxonomy or ordered severity invariant. |
| AJ | Leading indicators | MISSING | NEW | Verification signals exist as presentation intent only; no monitored indicator aggregate. |
| AK | Invalidation conditions | PARTIAL | EXTEND | Personal scenarios require counter-signals/conditions; strategic invalidation and evaluation history are absent. |
| AL | Scenario revision | MISSING | NEW | No strategic scenario snapshot/revision/change-set model. |
| AM | Early Warning Engine | MISSING | NEW | No rule evaluation, threshold, alert, acknowledgement, or escalation engine. |
| AN | User-relevant risk | PARTIAL | EXTEND | Personalized impact safely maps explicit exposure to conditional impact; strategic risk aggregation is absent. |
| AO | Preparedness | MISSING | DO NOT MERGE | Must be a non-transactional readiness model, separate from recommendations, allocations, and trades. |
| AP | Personalized Impact integration | IMPLEMENTED | REUSE | Sprint 16 request, analysis, Plan/Script, runtime, follow-up, and My Lens integration are complete and request-scoped. |
| AQ | War Room | MISSING | NEW | No strategic workspace; existing Web is a validated briefing renderer only. |
| AR | Continuous monitoring | PARTIAL | EXTEND | Observations/revisions and stale-run protection exist; no polling/subscription/change evaluation loop. |
| AS | Operational jobs/scheduling | PARTIAL | EXTEND | Ingestion job state and atomic persistence exist; no scheduler, lease, retry queue, rate-limit, or dead-letter service. |
| AT | Live provider readiness | PARTIAL | EXTEND | OpenAI adapter is disabled by default and SDK-tested; credentials, provider governance, live smoke tests, fallback, cost, and production telemetry are absent. |

Summary: **IMPLEMENTED 4 / PARTIAL 15 / MISSING 27 / CONFLICT 0**. No
requirement is intrinsically incompatible. Three unsafe interpretations are
rejected: Council Live as chain-of-thought exposure, strategic scenarios as a
rename of personal scenarios, and preparedness as transaction advice.

## Source, ingestion, and connector conclusions

The current core is extensible but not yet a universal connector platform.
Fetch is injected at the resolver boundary and normalization is separate from
acquisition; evidence interpretation happens later in dossier/context. Core
types are not tied to a named publisher. However, `InputResolver` is HTTP/text
oriented, acquisition metadata is too small for audit-grade raw preservation,
and adding RSS, authenticated APIs, media, or social platforms currently needs
more than an adapter registration.

Sprint 17.1 should define only the minimal contracts:

- `SourceConnector` and stable connector identity/version;
- `ConnectorCapability`;
- `SourceAcquisitionRequest` and bounded `SourceAcquisitionResult`;
- `CredentialRequirement` as descriptors only, never secret values;
- `SourceAccessPolicy` and a structured policy decision;
- `RawSourceArtifactRef` plus content hash/media type/size/retrieval metadata;
- an adapter seam from successful acquisition to existing `IngestionRequest`.

It must not implement Web/RSS/platform connectors, credentials, a raw store,
discovery, scheduling, genealogy, reliability scoring, media, database
migration, or provider work. Existing `IngestionRequest`, `SourceDocument`, URL
policy, trace, and persistent ingestion contracts remain authoritative.

## Evidence, hypotheses, and taxonomy

Evidence primitives are mature enough to reuse. Hypothesis work must add a
strict aggregate containing hypothesis statement, evidence bindings,
support/contradiction, alternatives, assumptions, falsification conditions,
strength assessment, revision, and status. It must reference evidence IDs and
preserve open dissent.

The taxonomy stays orthogonal:

- epistemic type: fact, attributed claim, interpretation, inference, forecast,
  unknown;
- hypothesis strength: support posture for a testable explanation;
- source reliability: assessment of a source/record over a versioned basis;
- value posture: normative stakeholder or objective framing;
- risk assessment: impact, likelihood posture, uncertainty, horizon, exposure;
- personal impact: caller-supplied exposure lineage.

Value and risk cannot share one score. Reliability cannot determine truth.
Political labels cannot enter evidence scoring as correctness proxies.

## Scenario, probability, and preparedness policy

Strategic scenarios require their own aggregate with base, worse, severe, and
tail-risk branches; premises; horizon; causal path; leading indicators;
invalidation conditions; evidence and hypothesis lineage; qualitative
likelihood posture; impact; uncertainty; revision history; and comparison.
Sprint 16 condition/horizon validation patterns may be extended, but its
personal aggregate must not be reused as the strategic aggregate.

Numeric probability remains prohibited until a calibrated method has approved
data provenance, reference class, scoring rule, backtest/evaluation, update
policy, and uncertainty disclosure. Labels must not disguise invented numeric
precision.

Preparedness may provide monitoring, information-gathering, contingency,
communication, and reversible readiness options with owner, trigger, cost
class, reversibility, dependency, and caveat. It may not contain buy/sell,
allocation, target weight, trade execution, or personalized financial action.

## Router, council, and provider compatibility

The router should reuse question intent, ambiguity, context coverage/gaps,
freshness, contradiction, runtime outcomes, and budgets. A minimal policy maps
ordinary briefing, evidence verification, hypothesis analysis, council review,
scenario analysis, and early-warning refresh without bypassing validators.

Council execution must be phased: isolated blind proposals, sealed outputs,
cross-examination, bounded revision, red team, final judge, and preserved
dissent. Evidence and tools are partitioned by explicit allowlists. An
Independence Score measures provider/model family diversity, prompt/role
diversity, evidence overlap, shared upstream dependence, and opinion
convergence; it is not a confidence score.

`CouncilStatement` exposes conclusion, epistemic type, evidence refs,
hypothesis/scenario refs, assumptions, uncertainty, challenges, response,
revision relation, dissent, provider/model class, and public rationale summary.
It excludes hidden chain-of-thought, prompts, credentials, and raw provider
payloads.

The existing generation port is the correct pattern, but multiple provider
adapters alone do not establish independence. Production council routing needs
provider policy, model-family metadata, timeouts/cancellation, quotas, cost
budgets, fallback semantics, data residency/use policy, audit retention, and
correlated-failure measurement.

## Revalidated Sprint 17–28 sequence

1. **Sprint 17 — Source Intelligence Foundation:** 17.1 connector contracts;
   17.2 raw artifact/access/security design; 17.3 Web, RSS, official-document,
   and user-submitted adapters; 17.4 genealogy and reliability foundation.
2. **Sprint 18 — Media & OSINT Intelligence:** media acquisition, transcript/
   frame alignment, raw-media and OSINT verification records.
3. **Sprint 19 — Evidence Verification & Competing Hypotheses:** verification
   workflow, hypotheses, alternatives, falsification, revision, taxonomy.
4. **Sprint 20 — Analysis Depth Router:** evidence/risk/cost-aware routing and
   deterministic stop/escalation policy.
5. **Sprint 21 — Advisory Council Foundation:** roles, isolated contexts,
   blind analysis, evidence/tool partitions, CouncilStatement.
6. **Sprint 22 — Council Deliberation:** cross-examination, agent revision,
   red team, final judge, dissent, Independence Score.
7. **Sprint 23 — Strategic Scenario Engine:** four branches, leading
   indicators, invalidation, revisions, qualitative probability policy.
8. **Sprint 24 — Early Warning Engine:** monitored indicators, evaluation,
   alerts, acknowledgement, escalation, scenario/dossier revisions.
9. **Sprint 25 — War Room / Council Live:** validated statement, dissent,
   evidence, scenario, and alert presentation without chain-of-thought.
10. **Sprint 26 — Multi-Model Council:** approved additional providers,
    correlated-failure controls, cost/latency/fallback operations.
11. **Sprint 27 — Explore / Global Intelligence UI:** discovery and navigation
    over validated strategic artifacts; UI remains non-authoritative.
12. **Sprint 28 — Operational Intelligence / Monitoring:** durable schedules,
    leases, retries, rate limits, dead letters, retention, telemetry, SLOs.

This preserves the original dependency order while splitting Sprint 17 so
production connectors cannot precede raw-data and security decisions.

## Connector implementation ordering

1. **User-submitted plain text/file metadata fixture** — exercises contracts
   without network or credentials.
2. **Public Web** — reuses current HTTP/text ingestion after DNS/access-policy
   hardening.
3. **RSS/Atom** — deterministic discovery/acquisition with explicit item/feed
   lineage.
4. **Official documents** — PDF/document handling and authoritative identity.
5. **YouTube** — transcript/media identity and time alignment.
6. **Reddit** — public thread/comment genealogy and deletion/edit semantics.
7. **X** — API credentials, rate limits, conversation/repost lineage.
8. **Telegram** — channel/message/media lineage and higher policy risk.

The contract-only fixture is first; among production connectors, Web remains
first. Credentialed social sources wait for genealogy, retention, and secret
isolation.

## Risk register

| Severity | Risk | Required mitigation | Target Sprint |
| --- | --- | --- | --- |
| Production ingestion gate | Raw collection without retention/redaction/access policy | approve raw artifact lifecycle before persistent raw bytes are introduced; this does not block Sprint 17.1 contracts | 17.2 |
| Live network connector gate | DNS rebinding and unsafe connector egress | resolver validation, connection pinning, redirect revalidation, and egress policy before any live public Web/HTTP connector | 17.2 |
| Future Council / War Room invariant | Council Live exposing chain-of-thought | never store or expose private chain-of-thought; expose only structured CouncilStatement thesis, evidence, challenge, uncertainty, and revision | 21–25 |
| High | Duplicate/repost evidence inflation and source laundering | genealogy graph and independence-aware dedupe | 17.4 |
| High | Connector credential leakage or policy breakage | secret references, scoped adapters, least privilege, audit | 17.2–17.3 |
| High | Prompt injection from source payloads | data-only envelopes, strict proposals, tool isolation | 17–22 |
| High | Provider-correlated hallucination and agent groupthink | blind phases, provider-family metadata, Independence Score, dissent | 21–26 |
| High | Unsupported scenario probability | schema prohibition until calibration approval | 23 |
| High | Stale evidence driving alerts | freshness policy, revisions, invalidation, acknowledgement | 23–24 |
| Medium | Council cost/latency explosion | depth router, budgets, cancellation, quorum, cache policy | 20–26 |
| Medium | Political confirmation bias | evidence-first partitions, counterevidence, falsification, audit samples | 19–22 |
| Medium | Media verification false confidence | method-specific result limits and human-review posture | 18 |
| Medium | Operational retry duplication | idempotency keys, leases, retry/dead-letter policy | 28 |
| Low | UI conflates personal and strategic scenarios | distinct labels, bindings, and presentation tests | 23/25/27 |
| Low | Taxonomy drift across modules | shared versioned enums and contract tests | 19 onward |

## Open decisions for CTO review

1. Raw artifact retention duration, deletion authority, encryption, and
   whether immutable means append-only metadata plus erasable encrypted bytes.
2. Whether public Web production acquisition waits for all of Sprint 17.2 or a
   narrower approved security gate.
3. Source reliability dimensions, review authority, and appeal/correction
   policy.
4. Human-review requirements for OSINT/media verification and severe alerts.
5. Council provider data residency, content-use, logging, and budget policies.
6. Whether base/worse/severe/tail-risk labels are fixed product vocabulary or
   configurable display labels over stable semantic kinds.

## Completion decision

Sprint 17.0 is complete as a reviewed, documentation-only compatibility audit.
Sprint 17.1 is ready for its exact contract-only implementation scope. The raw
lifecycle and DNS/egress decisions are later production gates, not blockers for
the offline Sprint 17.1 contracts. No Sprint 17 production implementation was
started from the Sprint 17.0 document baseline.
