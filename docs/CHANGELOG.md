# Changelog

## Unreleased

- Implemented Sprint 17.3B `LiveWebSourceConnector` as a zero-authority
  Web/HTML adapter over the existing safe runtime, with exact one-acquisition
  continuity through optional governed raw persistence and existing HTML
  ingestion.
- Added deterministic offline Web connector/vertical-slice regression tests
  and a privacy-minimized, persistence-off `LIVE_WEB_URL` manual acceptance
  path. No external acceptance is run by default.
- Closed the Sprint 17.3B manual-acceptance isolation finding: default Vitest
  structurally excludes the dedicated acceptance specification, its exact-path
  config cannot fall back to ordinary discovery, and missing/blank
  `LIVE_WEB_URL` now exits non-zero instead of producing a false PASS.
- Added privacy-safe bounded acceptance diagnostics: failures expose only a
  closed stage and existing bounded reason code, successes expose only approved
  categorical/yes-no metadata, and all raw child output remains suppressed.
- Closed the diagnostic re-review findings by replacing uppercase-shape reason
  validation with finite stage-specific allowlists and rejecting zero,
  multiple, duplicated, oversized, malformed, or ambiguous markers.
- Replaced the acceptance runner's undifferentiated protocol fallback with a
  finite protocol-reason set for missing/ambiguous/malformed/oversized markers,
  child exit/spawn failure, and invalid success metadata. Valid bounded domain
  failures retain precedence over child exit status; raw child output remains
  suppressed.
- Corrected acceptance child-process classification so structured `ENOBUFS`
  becomes diagnostic oversized without parsing truncated stdout, while only a
  narrow process-creation error set becomes child-spawn-failed. Success markers
  now require the exact approved ten-key schema with no additional properties.
- Fixed passing acceptance marker capture by disabling console interception
  only in the dedicated live-Web Vitest config. An injected no-network harness
  regression proves status 0 produces exactly one marker and a bounded PASS;
  the parent continues discarding all non-marker child output.
- Completed the authorized real-world IANA rerun through the production safe
  Web path: 2xx, canonical `text/html`, connector `web`, content hash,
  acquisition identity, and `SourceDocument` all passed with persistence off
  and no refetch or redecode. Sprint 17.3B is final complete; RSS/Atom
  remains pending Sprint 17.3C.
- Implemented Sprint 17.3A contract/composition gating without adding a live
  connector: `rss` may use the strict Web locator, safe-runtime connector
  capability is configurable, terminal HTTP success is 2xx-only, and the
  production orchestrator accepts a trusted detailed-safe connector while
  retaining fixture/runtime compatibility.
- Added bounded 401/403/404/410/other non-2xx mapping and tests proving rejected
  response bodies never reach decoding, raw persistence, or ingestion.
- Patched the Milestone 04 production network bypass: ingestion is now
  materialized-content-only, URL-only pipeline requests fail closed, and the
  supported URL path composes the existing safe acquisition runtime, connector
  bridge, and pipeline exactly once without global-fetch fallback or refetch.
- Added the Milestone 04 production acquisition orchestrator, preserving one
  bounded acquisition across optional governed raw persistence and ingestion,
  plus an AST-based per-module network-capability allowlist with alias and
  imported-client self-tests.
- Narrowed non-I/O `node:net` architecture exceptions from file/module scope to
  exact named `isIP` imports; namespace, default, mixed, require, dynamic, and
  socket-capable imports now fail closed outside the two safe transports.
- Completed the independent Milestone 04 Q5 audit with no remaining BLOCKER,
  HIGH, MEDIUM, or LOW findings; Sprint 17.3 remains not started.

- Implemented Sprint 17.2C durable raw artifact persistence with SQLite schema
  v3, immutable decoded-byte blobs, independent source/acquisition/governance
  lineage, byte-verified deduplication, atomic audit, and restart durability.
- Added governance-before-persist/read/delete, deterministic expiry discovery,
  legal-hold-safe idempotent tombstoning, privacy-minimized audit, hash/size
  validation, crash rollback, and SourceDocument lifecycle independence.
- Kept unsupported encryption and content redaction fail-closed; added no
  dependency, live connector, external network, scheduler, evidence, LLM, or
  Web/Globe behavior.
- Patched the independent review's acquisition-lineage finding by moving the
  globally unique acquisition identity from the RawArtifact row into a 1:N
  occurrence relation with atomic replay, conflict, restart, and delete/FK
  semantics.
- Completed the final independent Q4 re-review with the acquisition-lineage
  repair verified and all targeted, full-suite, typecheck, build, and audit
  gates passing.

- Completed Sprint 15 runtime orchestration from `CreateBriefingRequest` through
  Contract, Context, structured generation, ExplanationPlan, Script, Session,
  and the existing Web presentation and follow-up UI.
- Added injected execution identity and clock, privacy-minimized receipts,
  cooperative cancellation, late-result rejection, stale-run acceptance, and
  atomic Script/Session bootstrap application.
- Replaced the Web prebuilt-Script bootstrap with a deterministic local runtime
  while retaining one authoritative Session owner and the Sprint 14 follow-up
  flow.
- Repaired canonical seven-scene semantics, renderer-neutral map-flow intent,
  runtime follow-up evidence compatibility, and stable citation occurrence IDs.
- Browser-accepted Opening, Global Overview, Impact Path, route/markers,
  current-context, revision, clarification, keep-current, full rebuild,
  drag/zoom, camera restoration, and replay with zero React console errors.
- Added no live OpenAI/search/backend/telemetry integration, dependency,
  database migration, tag, or Sprint 16 implementation. MapLibre network and
  the existing bundle-size warning remain accepted behavior/debt.
- Audited the Sprint 10–14 Interactive Briefing pipeline across identity,
  provenance, epistemic policy, Session, replan, atomic Web application, and
  renderer boundaries.
- Corrected Core fixture current-scene revision semantics and fingerprint-based
  changed/preserved scene accounting.
- Added NFC normalization to common semantic fingerprint canonicalization and a
  deterministic seven-scenario integration suite.
- Finalized the Interactive Briefing Milestone 02 with user-operated Chrome
  acceptance covering Console, Network, navigation, map continuity, atomic
  replacement, accessibility focus, and favicon delivery.
- Recorded the Codex Chrome kernel-asset path failure as a tooling issue
  separate from the accepted product baseline.
- Corrected the focused MapLibre canvas ARIA ancestor and added a branded SVG
  favicon without dependency, package, backend, or migration changes.
- Implemented Sprint 14.3B fixture-only Composer, BriefingSession, classifier,
  outcome orchestrator, atomic replacement, and AnalysisPanel integration.
- Added six safe outcome presentations, injected browser runtime identity,
  stale-operation defense, deterministic fixture resolution, and same-scene
  map overlay refresh without camera replay.
- Added no dependency, network, LLM, backend, database, or migration change;
  final browser acceptance is complete.
- Finalized Sprint 14.3B with semantic same-scene change accounting,
  counterevidence fixture binding, atomic Impact Path route/marker refresh,
  manual viewport preservation, and user-accepted browser behavior.
- Retained fixture-only limitations: no live GPT/search, true-append fixture,
  browser failure fixture, or backend. The existing MapLibre bundle-size
  warning remains accepted renderer debt.
- Implemented Sprint 14.3A application-level follow-up outcome orchestration
  with six strict outcomes and renderer-neutral UI action projections.
- Added `REPLAN_RESOLVED` for normal current-context, clarification, and
  unsupported completion; `REPLAN_FAILED` now remains technical-failure-only.
- Added append scene budget enforcement, stale-result isolation, exact
  resume-state preservation, replacement revalidation, and outcome fingerprints.
- Added no React, network, LLM, backend, dependency, or migration change.
- Implemented Sprint 14.2 strict follow-up request/context contracts,
  deterministic Korean/English classification, and seven replan scopes.
- Added allowlisted answer plans, strict replan results, injected synthetic
  fixture scenarios, Script replacement validation, evidence continuity, and
  scene mapping.
- Integrated fixture results through the existing session reducer with stale
  operation/fingerprint rejection and privacy-minimized audit metadata.
- Added no UI, network, live LLM, backend, dependency, or migration.
- Implemented Sprint 14.1 `BriefingSession` aggregate, ten lifecycle states,
  nineteen strict commands, and a deterministic effect-free reducer.
- Added semantic fingerprints, stale fingerprint/operation rejection, validated
  scene replacement mapping, and privacy-minimized audit records.
- Added a repository port and validation-enforcing in-memory adapter with
  optimistic concurrency and mutation isolation.
- Added offline session schema, reducer, repository, and integration tests.
- Kept React, MapLibre, network, LLM, SQLite schema, migrations, dependencies,
  and package lock unchanged.
- Designed Sprint 14 BriefingSession states, deterministic commands/events,
  invalid-transition behavior, viewport preservation, and rollback invariants.
- Defined follow-up classification, replanning/replacement contracts, exact
  evidence allowlists, stale-result rejection, and privacy-minimized audit data.
- Added the Sprint 14 implementation scope, risk matrix, acceptance criteria,
  and fixture-only implementation sequence.
- Marked Sprint 14 as **DESIGNED / NOT IMPLEMENTED**; no source, package,
  dependency, database schema, or migration change is included.

## Sprint 13 — Interactive Briefing Renderer Prototype

- Added a strict React/Vite web boundary and browser-safe Script contracts.
- Added Presentation Adapter, player reducer, scene dispatcher, and accessible
  Bottom Composer/playback/analysis/citation/uncertainty UI.
- Added MapLibre and fake map adapters, fixture geometry catalog, overlays,
  safe viewport calculation, and deterministic Motion Planner v0.
- Added chart, document, evidence-board, and static fallback surfaces.
- Added four validated fixture modes and offline Web unit/integration tests.
- Added no backend, API call, secret, persistence, or migration.

## Milestone 02 — Pre-Renderer Readiness Audit

- Reconciled the Sprint 12 test-file count: four test files plus one fixture.
- Preserved identity-bearing URL query parameters through Context provenance.
- Centralized URL identity policy across domain, persistence, and context.
- Returned validator-produced scripts instead of successful draft scripts.
- Enforced the complete scene budget while preserving plan coverage.
- Closed plan/context/excerpt/provenance/citation/visual reference validation.
- Added URL, assumptions, immutability, scene-budget, and renderer-boundary
  regressions without dependencies or migrations.

## Sprint 12 — Briefing Script Domain & Compiler

- Added strict presentation preferences and renderer-neutral BriefingScript
  aggregates, scenes, evidence bindings, and visual intent contracts.
- Added deterministic rule-based compilation, semantic fingerprints, plan and
  evidence coverage, scene dependency DAG validation, and structured outcomes.
- Added bottom-composer, safe-viewport, playback, interaction, accessibility,
  static, and reduced-motion policies.
- Added map, chart, document, overlay, camera, narration, caption, citation,
  and uncertainty intents without renderer commands or final prose.
- Added offline unit and integration coverage and architecture documentation.
- SQLite migration version remains 2.

## Sprint 11 — Structured LLM Adapter

- Added a provider-independent structured generation port and coordinator.
- Added deterministic fake and official OpenAI Responses adapters.
- Added bounded requests, DATA_ONLY evidence, exact allowlists, strict proposal
  schemas, and deterministic hydration.
- Added transport retry, maximum-one repair, refusal handling, redacted audit,
  and request/output fingerprints.
- Added safe server-only configuration and offline tests.
- Corrected forecast `Assumptions` mapping for uncertainty validation.
- Added only the official `openai` SDK; SQLite migration remains 2.

## Sprint 10 — ExplanationPlan Domain & Validator

- Added strict plan aggregate, sections, steps, evidence bindings, epistemic
  policies, visual intents, coverage, and decision rules.
- Added deterministic contract/context/provenance/policy validation and DAG
  cycle detection.
- Added semantic fingerprints, generator/repository ports, and a rule-based
  skeleton assembler.
- Added structured insufficiency and clarification outcomes without answer
  generation or external calls.
- Added offline unit/integration tests and architecture documentation.
- SQLite migration version remains 2.

## Milestone 01 — Intelligence Foundation Baseline

- Audited Sprint 00–09 architecture, contracts, determinism, provenance,
  failure modes, security/privacy, dependencies, and runtime boundaries.
- Added four offline end-to-end integration scenarios from raw content to
  EvidenceContextPackage.
- Restricted SourceDocument excerpts to summary/body source text.
- Added cross-reference validation for ContextItem, excerpt, and provenance.
- Preserved fact-verification claim origin within bounded diversity selection.
- Canonicalized caller/geographic scope lists in BriefingContract fingerprints.
- Added selected source fingerprint and revision to context package fingerprints.
- Added milestone, architecture baseline, data-flow, and next-phase documents.
- SQLite migration version remains 2.

## Sprint 09 — Evidence Retrieval & Context Builder

- Added contract-driven retrieval plans and candidate provider ports.
- Added deterministic scoring, deduplication, diversity, and excerpt extraction.
- Added context budgets, coverage, evidence gaps, provenance, and fingerprints.
- Added structured context outcomes without a database migration.

## Sprint 08 — Question Intent & Briefing Contract

- Added strict question, intent analysis, ambiguity, and briefing contracts.
- Added deterministic Korean/English analysis and standard policy compilation.
- Added evidence, uncertainty, visual, personalization, and stop policies.
- Added semantic fingerprints and analyzer/session extension ports.

## Sprint 07 — Evidence-First Event Dossier Core

- Added typed Event dossiers, statements, confidence, and completeness.
- Added deterministic contradictions, semantic revisions, and change sets.
- Added dossier persistence adapters and migration version 2.
- Corrected URL identity handling for identity-bearing query parameters.

## Sprint 06 — Persistent Ingestion and Deduplication

- Added persistence repository ports and Unit of Work.
- Added In-Memory and durable SQLite adapters.
- Added schema migration version 1 and runtime read validation.
- Added fingerprint deduplication, revision history, observations, and job state.
- Added persistent ingestion orchestration and duplicate-race recovery.
- Added shared repository contract, integration, concurrency, and migration tests.

## Sprint 05 — Adaptive Source Ingestion Core

- Added URL and raw-content ingestion requests.
- Added safe, injectable URL resolution with bounded retries and redirects.
- Added content probing and deterministic capability selection.
- Added generic HTML and plain-text extraction.
- Added normalization, classification, fingerprinting, SourceDocument mapping,
  structured errors, and trace.
- Added fixture-driven ingestion tests and ADR-005.

## 2026-07-24 — Sprint-02 Complete

- Implemented the core TypeScript domain types.
- Added strict TypeScript configuration.
- Added `package.json` and `package-lock.json`.
- Added `node_modules/` to `.gitignore`.
- Confirmed that type checking passes.
- Implementation commit: `b2f75ba`.
