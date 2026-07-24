# Changelog

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
