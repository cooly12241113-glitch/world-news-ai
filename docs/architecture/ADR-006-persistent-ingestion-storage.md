# ADR-006: Persistent Ingestion Storage and Deduplication

- Status: Accepted
- Date: 2026-07-24
- Decision owners: ChatGPT (CTO), Codex (Developer)

## Context

Sprint 05 produces validated `SourceDocument` values but does not retain them.
Sprint 06 requires durable storage, exact fingerprint deduplication, canonical
URL revision history, observation history, job state, atomic writes, migration
management, and duplicate-race recovery.

The domain and ingestion core must remain independent of a database or ORM.

## Decision

Introduce persistence/application contracts under `src/persistence`:

- repository ports for documents, jobs, observations, and revisions;
- a synchronous Unit of Work transaction boundary;
- an In-Memory adapter for fast tests;
- a durable SQLite adapter using Node's built-in `node:sqlite`;
- `PersistentIngestionService` to orchestrate Sprint 05 and persistence.

No Sprint 00–05 public domain or ingestion type is modified.

## Durable storage choice

Use SQLite through `node:sqlite` and require Node.js 24 or newer.

Advantages:

- durable single-file storage;
- ACID transactions and `BEGIN IMMEDIATE`;
- unique constraints and indexes;
- parameterized statements;
- no ORM;
- no native addon installation or separate database server;
- good Windows and CI portability for the project's current Node 24 runtime;
- temporary and `:memory:` databases for isolated tests.

Trade-offs:

- raises the documented runtime baseline from Node 20 to Node 24;
- intended for a single-process/local backend rather than distributed writes;
- PostgreSQL or another adapter will be needed for multi-server deployment.

Alternatives:

- `better-sqlite3`: mature API, but adds a native addon and build/runtime
  compatibility burden.
- `sqlite3`: native dependency and callback-oriented API.
- ORM: unnecessary abstraction for four small tables and static queries.
- JSON files: cannot provide robust unique constraints or transactions.

## Transaction boundary

Pipeline execution occurs before persistence. The following operations are one
transaction:

1. fingerprint lookup and duplicate decision;
2. document insert when needed;
3. revision insert when needed;
4. observation insert;
5. job terminal-state update.

The job is created and moved to `running` before pipeline execution so pipeline
failures remain observable. If the persistence transaction rolls back, the
service records the job as `failed` in a separate operation.

## Deduplication and revisions

- Same fingerprint: reuse the stored document, add an observation, complete the
  job as `duplicate`.
- Same canonical URL with a different fingerprint: insert a document and the
  next revision, add an observation, complete the job as `succeeded`.
- Different canonical URL and fingerprint: insert revision 1.
- Missing canonical URL is not a persistence error by itself, but the existing
  Sprint 05 mapping requires a valid canonical URL before persistence.

The database has a unique fingerprint constraint. If another writer wins after
lookup, the adapter reports a duplicate constraint, the service reads the
winner, records its observation, and returns a duplicate result.

## Observation and privacy

Observation records are append-only audit facts. They store bounded summaries,
not raw HTML or full trace. Persisted canonical URLs and operational
requested/final URLs have credentials, query strings, and fragments removed.
The persistence fingerprint is recomputed from that sanitized canonical URL and
normalized title/body so transient tokens cannot split otherwise identical
records. Errors expose codes, stage, retryability, and sanitized context only.

## Migration policy

`schema_migrations` records applied integer versions. Migrations run
transactionally when the adapter opens, are safe to re-run, and reject database
versions newer than the application. Version 1 creates all Sprint 06 tables,
indexes, foreign keys, checks, and unique constraints.

## Consequences

- Persistence can be replaced without changing domain or ingestion code.
- Both adapters share repository contract tests.
- SQLite data survives process restarts.
- Deletes are not exposed in Sprint 06; foreign keys therefore default to
  restrictive behavior and preserve audit history.
