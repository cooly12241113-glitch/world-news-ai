# Current Project Status

## Current Sprint

Sprint-07 — Evidence-First Event Dossier Core

**Status:** Implementation complete, pending review

## Completed

- Sprint 00–06 domain, ingestion, and persistence
- URL logging/identity/canonical responsibility separation
- EventDossier aggregate and strict typed sections
- Statement and confidence validation
- deterministic evidence assessment, contradiction baseline, and completeness
- semantic fingerprint, unchanged results, revisions, and change sets
- dossier repository ports and In-Memory/SQLite adapters
- SQLite migration version 2
- domain, builder, persistence, migration, conflict, and URL regression tests

## Compatibility

Sprint 00–06 public domain and ingestion contracts remain unchanged. Existing
records are referenced by ID. Sprint 06 rows whose identity-bearing query values
were removed may require a data audit.

## Not implemented

LLM generation, automatic extraction, natural-language contradiction detection,
discovery/workers, UI/PWA/3D, PDF/OCR/video, and semantic search.
