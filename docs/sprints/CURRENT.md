# Current Project Status

## Product direction

The authoritative long-term product identity and decision principles are
defined in the
[Strategic Intelligence Product Charter](../product/Strategic-Intelligence-Product-Charter.md).
Sprint scope must remain consistent with that Charter.

## Current Milestone

Milestone 03 — Personalized Intelligence Baseline

**Status:** IMPLEMENTED / AUDIT COMPLETE / BROWSER ACCEPTED / FINAL COMPLETE

Sprint 16.0–16.4 explicit consent, request scope, exposure/evidence provenance,
impact/scenario semantics, deterministic identity, runtime integration, My
Lens presentation, and personalized follow-up replacement are audited and
accepted. The fixture-only baseline has 75 test files and 746 passing tests.
See [Milestone 03](../milestones/Milestone-03-Personalized-Intelligence-Baseline.md).

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

## Sprint 15 final delivery

**Status:** IMPLEMENTED / INTEGRATION VERIFIED / BROWSER ACCEPTED / FINAL COMPLETE

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

  **Status:** IMPLEMENTED / REVIEWED / COMPLETE

  Runtime ID and clock ports, strict result/receipt contracts, reached-lineage
  receipts, cooperative cancellation checkpoints, late-result rejection, and
  stateless acceptance identity are implemented and retained by the completed
  Web bootstrap integration. See
  [Sprint 15.2 delivery](Sprint-15.2-Runtime-Receipt-Cancellation-Identity.md).

- Sprint 15.3 — Deterministic Local Runtime & Web Bootstrap Integration.

  **Status:** IMPLEMENTED / BROWSER ACCEPTED / COMPLETE

  The Web bootstrap executes the deterministic local Contract-to-Session
  pipeline with cancellation, latest-run acceptance, and a single authoritative
  Session owner. See
  [Sprint 15.3 delivery](Sprint-15.3-Local-Runtime-Web-Bootstrap.md).

- Sprint 15.3A — Runtime Fixture Compatibility Repair.

  **Status:** IMPLEMENTED / BROWSER RE-ACCEPTED / COMPLETE

  The Sprint 15.3 browser regressions have been repaired without reverting the
  runtime-first bootstrap. The deterministic fixture retains the accepted
  seven-scene semantics and geographic intent through the complete pipeline.
  Follow-up compatibility and stable citation occurrence identity are restored.
  Sprint 15 is integration verified, browser accepted, and final complete. See
  [Sprint 15.3A repair](Sprint-15.3A-Runtime-Fixture-Compatibility-Repair.md).

## Known non-blocking debt

Production DNS-rebinding controls, complete knowledge-record persistence,
semantic retrieval, context-package persistence, and operational
retention/redaction policy remain future work.
Live GPT/search, true-append and browser-failure fixtures, and production
backend integration remain unavailable. The existing MapLibre bundle-size
warning remains accepted debt; dark vector maps and a 3D globe belong to a
future renderer Sprint.

## Sprint 16 design

- Sprint 16.0 — Personalized Impact Analysis Design & Compatibility Audit.

  **Status:** DESIGN COMPLETE

  The consented, caller-scoped explicit-context, exposure, impact-channel,
  scenario, provenance, identity, privacy, validation, pipeline, and follow-up
  boundaries are defined without implementation. Production source, tests,
  packages, dependencies, and migrations remain unchanged. The open design
  questions are resolved and Sprint 16.1 is **READY FOR IMPLEMENTATION**. See
  [Sprint 16.0 design](Sprint-16.0-Personalized-Impact-Analysis-Design.md).

## Sprint 16.1 implementation

- Sprint 16.1 — Explicit Personal Context & Exposure Contracts.

  **Status:** IMPLEMENTED / REVIEWED / COMPLETE

  Request-scoped consent, closed purpose/caller scope, seven strict explicit
  exposure variants, deterministic IDs and context fingerprints, validation,
  sensitive-attribute rejection, and optional `CreateBriefingRequest` transport
  are implemented. Legacy context remains compatible. Impact inference,
  Plan/Script/Session/Web behavior, persistence, and live providers remain out
  of scope. See [Sprint 16.1 delivery](Sprint-16.1-Explicit-Personal-Context-Exposure-Contracts.md).

## Sprint 16.2 implementation

- Sprint 16.2 — Personalized Impact Channel & Scenario Domain.

  **Status:** IMPLEMENTED / REVIEWED / COMPLETE

  Dual evidence/exposure provenance, impact relations and directions,
  assessments, structured conditions/scenarios, uncertainty and unknown-impact
  posture, deterministic IDs/fingerprints, strict validation, a standalone
  analyzer boundary, and a fictional deterministic fixture are implemented.
  Runtime, Plan, Script, Session, receipt, follow-up, and Web integration remain
  deferred to Sprint 16.3. See
  [Sprint 16.2 delivery](Sprint-16.2-Personalized-Impact-Channel-Scenario-Domain.md).

## Sprint 16.3 implementation

- Sprint 16.3 — Personalized Impact Runtime & Briefing Integration.

  **Status:** IMPLEMENTED / REVIEWED / COMPLETE

  Explicit intent activation, an optional `impact-analyzing` stage, a thin
  coordinator, safe planning projection, structured-generation allowlists,
  separate Plan/Script personal bindings, privacy-minimized reached lineage,
  cancellation and stale-result compatibility, and deterministic personalized
  Contract-to-Session integration are implemented. Non-personalized semantic
  fingerprints remain unchanged. Session and Web UI remain unchanged. See
  [Sprint 16.3 delivery](Sprint-16.3-Personalized-Impact-Runtime-Briefing-Integration.md).

## Sprint 16.4 implementation

- Sprint 16.4 — My Lens Personalized Impact Presentation & Follow-up.

  **Status:** IMPLEMENTED / REVIEWED / BROWSER ACCEPTED / COMPLETE

  The existing AnalysisPanel conditionally presents safe Script-carried
  exposure, impact-path, scenario, and uncertainty semantics as My Lens.
  Ordinary briefings expose no personalization UI. Lens state remains
  presentation-only, and bound scenes use the existing Composer and atomic
  follow-up replacement path. No persistence, profile inference, live provider,
  recommendation, ranking, or probability feature is introduced. See
  [Sprint 16.4 delivery](Sprint-16.4-My-Lens-Presentation-Follow-up.md).

## Sprint 16 final status

**Status:** IMPLEMENTED / REVIEWED / BROWSER ACCEPTED / FINAL COMPLETE

Sprint 16.0–16.4 preserve explicit consent, caller/request scope, separated
evidence and exposure provenance, deterministic identity, cancellation/stale
protection, raw-context minimization, ordinary briefing compatibility, and
presentation-only My Lens state. No persistent UserProfile, sensitive
attribute inference, direct transaction recommendation, invented probability,
or hidden personalization was introduced.

## Sprint 17.0 compatibility audit

**Status:** AUDIT COMPLETE / DESIGN COMPLETE / REVIEWED / COMPLETE

The documentation-only Strategic Intelligence compatibility audit is complete.
It records the A–AT requirement matrix, target layer map, reuse and
anti-reimplementation decisions, security prerequisites, risk register,
revalidated Sprint 17–28 sequence, and the exact Sprint 17.1 minimum scope.

Sprint 17.1 — Universal Source Connector Contracts was **READY FOR
IMPLEMENTATION** at this audit checkpoint and is subsequently complete below.
Sprint 17.0 itself introduced no connector, production source, test, dependency,
provider, package, migration, scheduler, or UI change.

## Sprint 17.1 implementation

**Status:** IMPLEMENTED / REVIEWED / COMPLETE

The provider/platform-neutral Source Connector contracts, strict schemas,
semantic locator identity, opaque raw artifact reference, privacy-minimized
success/failure outcomes, framework-neutral cancellation seam, deterministic
offline fixture connector, and thin projection into the existing adaptive
ingestion pipeline are implemented.

No live connector, network call, credential, raw persistence, media processing,
evidence/reliability logic, genealogy, package/dependency change, migration,
or Web change is included. Automated validation passes with 77 test files / 791
tests, typecheck, Web production build, and 0 production vulnerabilities. The
existing development-toolchain moderate 5 audit findings remain. Sprint 17.2
has not started.

## Sprint 17.2A implementation

**Status:** IMPLEMENTED / REVIEWED / COMPLETE

Raw artifact lifecycle, retention, deletion, redaction, encryption requirement,
access classification, governance attachment, credential reference/scope,
source-account consent, availability-only resolver port, access decision,
operational audit, tombstone, semantic identity, prompt-injection posture, and
fail-closed policy evaluation contracts are implemented.

No network runtime, live connector, credential value, secret store, encryption
implementation, raw blob persistence, migration, direct dependency, evidence
logic, or Web change is included. Automated validation passes with 79 test files
/ 845 tests, typecheck, Web production build, and zero vulnerabilities in both
full and production audits. The approved lockfile-only remediation resolves
PostCSS `8.5.26` and nanoid `3.3.18` through the existing Vite dependency graph;
`package.json` is unchanged. At that checkpoint, Sprint 17.2B, 17.2C, and 17.3
had not started.
The independent Q4 security review is complete.

## Sprint 17.2B implementation

**Sprint 17.2B overall:** IMPLEMENTED / REVIEWED / COMPLETE

**Sprint 17.2B-1:** IMPLEMENTED / REVIEWED / COMPLETE

Sprint 17.2B-1 adds shared pre-acquisition credential/consent authorization,
strict HTTP(S) default-port target validation, deterministic global-unicast IP
classification, fail-closed full-set DNS validation, immutable
`ApprovedEgressTarget`, and a Node pinned-transport feasibility proof. The
approved address is injected through custom lookup and verified against the
actual socket peer; HTTPS retains original-host SNI, certificate validation,
and hostname validation, while `agent:false` prevents connection reuse.

No external network test, redirect/retry/rate/concurrency runtime, full response
runtime, persistence, migration, dependency, live connector, Web, or LLM change
is included. See
[Sprint 17.2B delivery](Sprint-17.2B-Safe-Network-Acquisition-Runtime.md).

The independent review's credential-kind mismatch precedence finding is
patched: authoritative prohibited-source policy is now evaluated before all
consent and credential semantics. Reviewer adversarial coverage and the final
Q4 validation pass.

**Sprint 17.2B-2:** IMPLEMENTED / REVIEWED / COMPLETE

Sprint 17.2B-2 adds a safe request lifecycle around that approved-target proof:
every redirect and retry performs fresh authorization, full-set DNS/IP
validation, target approval, and pinned connection. Manual bounded redirects,
cancellation, finite overall/attempt deadlines, bounded retry, separate
connector/origin rate and concurrency gates, response-head-only processing,
and explicit Sprint 17.1 failure mapping are implemented. The independent Q4
findings are patched: DNS is lifecycle-detached on cancellation/deadline,
rate admission precedes DNS, active rate-bucket state has fail-closed capacity,
and Node parsing enforces an absolute 16-KiB response-header ceiling.
Combined-only admission compatibility conservatively retains one lease from
pre-DNS admission through response-head completion so transport is never
unprotected. Full-body streaming,
decompression safeguards, privacy-minimized attempt audit, connector runtime
integration, persistence, migrations, dependencies, live connectors, Web, and
LLM behavior remain outside this increment.

**Sprint 17.2B-3:** IMPLEMENTED / REVIEWED / COMPLETE

The safe runtime now performs bounded response-body streaming with independent
encoded/decoded byte ceilings, identity/gzip/deflate/Brotli handling,
compression-bomb defense, explicit textual MIME and UTF-8 policy, body-idle and
absolute overall deadline enforcement, cancellation-safe pipeline cleanup, and
incremental decoded-byte SHA-256 hashing. Split and combined admission leases
remain active through complete body validation. Privacy-minimized bounded
attempt events and a deterministic runtime connector adapter integrate through
the existing SourceAcquisitionResult and ingestion bridge contracts.
The independent audit-privacy finding is patched: canonical MIME is recorded
only after successful validation, while failure/retry events omit raw
Content-Type and all other unvalidated response-header values.

Durable raw persistence was outside Sprint 17.2B and is addressed separately
below. Encryption implementation, secrets/OAuth, live connectors, real
retrieval, evidence/LLM logic, and Web/Globe work remain out of scope. Sprint
17.2B is implemented, independently reviewed, and complete.

## Sprint 17.2C implementation

**Status:** IMPLEMENTED / REVIEWED / COMPLETE

Durable raw artifact persistence now reuses SQLite and the existing migration
runner at schema v3. Immutable decoded-body bytes, separate source identity and
1:N acquisition-occurrence lineage, governance identity, deterministic
retention, legal-hold-safe
deletion, minimal tombstones, governed reads, physical deduplication with byte
comparison, transaction rollback, restart durability, and privacy-minimized
persistence audit are implemented. Ephemeral, not-persisted,
discard-after-normalization, unsupported sensitive-field redaction, and
unproven encryption requirements fail closed.

`RawArtifact` remains distinct from `SourceDocument`; deleting either does not
implicitly delete the other. No live connector, external request, scheduler,
secret/OAuth store, evidence/reliability/genealogy, LLM, or Web/Globe feature is
included. The independent review's acquisition-lineage finding is patched:
same-source/same-content observations reuse one RawArtifact while distinct
globally unique acquisition IDs are preserved transactionally. See
[Sprint 17.2C delivery](Sprint-17.2C-Durable-Raw-Artifact-Persistence.md).
The final independent Q4 re-review passed with 32 targeted test files / 476
tests and 96 full-suite test files / 1,116 tests. Typecheck, Web production
build, full audit, and production audit all pass.
Sprint 17.3 has not started.
