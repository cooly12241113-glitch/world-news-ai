# Changelog

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
