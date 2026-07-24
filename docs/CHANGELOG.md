# Changelog

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
