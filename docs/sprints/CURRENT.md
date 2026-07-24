# Current Project Status

## Project

World News AI

## Current Sprint

Sprint-06 — Persistent Ingestion and Deduplication

**Status:** Implementation complete, pending review

## Completed

- Sprint 00–05 domain, validation, and adaptive ingestion
- persistence models with runtime validation
- repository ports and Unit of Work
- In-Memory persistence adapter
- durable Node SQLite adapter
- transactional migration version 1
- SourceDocument persistence and read validation
- fingerprint uniqueness and duplicate race recovery
- canonical URL revision history
- append-only observations
- ingestion job state machine
- PersistentIngestionService
- sanitized operational URL and error handling
- shared adapter contract and integration tests
- ADR-006 and persistence architecture documentation

## Compatibility

- Sprint 00–05 domain and ingestion contracts are unchanged.
- Persistence metadata is kept outside domain models.
- Existing 174 tests remain part of the full suite.
- Runtime baseline is now Node.js 24 because the durable adapter uses
  `node:sqlite`.

## Not implemented

- source discovery, crawling, feeds, queues, workers, or scheduling
- distributed locks and multi-server deployment
- PostgreSQL/cloud/vector databases
- search indexing or AI extraction
- retention/deletion automation
- PDF/OCR/video/browser rendering

## Required validation

```bash
npm run validate
git diff --check
```
