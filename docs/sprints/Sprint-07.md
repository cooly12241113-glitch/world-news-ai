# Sprint-07 — Evidence-First Event Dossier Core

## Goal

Build a deterministic, evidence-linked, revision-aware Event Dossier without
LLM extraction or prose generation.

## Delivered

- EventDossier and strict typed sections
- Statement classification and confidence validation
- Claim evidence assessment and explicit-rule contradictions
- baseline completeness and open questions
- semantic fingerprint, unchanged outcome, revisions, and change sets
- dossier repository ports, In-Memory/SQLite adapters, and persistence service
- SQLite migration version 2
- URL logging/identity/canonical responsibility separation

Identity-bearing query parameters are retained, tracking parameters are removed
by policy, and sensitive values are redacted in logs and excluded from identity.

Out of scope: LLM output, automatic extraction, natural-language contradiction
detection, discovery/crawling/workers, UI/PWA/3D, PDF/OCR/video, and semantic
search.
