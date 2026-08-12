# Sprint 17.2C — Durable Raw Artifact Persistence

## Status

**IMPLEMENTED / REVIEWED / COMPLETE**

Sprint 17.2B remains complete. Sprint 17.3 has not started.

The final independent Q4 re-review closed the acquisition-lineage finding.
Targeted validation passed with 32 test files / 476 tests, and full validation
passed with 96 test files / 1,116 tests, typecheck, Web production build, and
zero vulnerabilities in both full and production audits.

## Boundary and identity

This increment persists only the already bounded, validated decoded body bytes
returned by Sprint 17.2B. `RawArtifactId`, decoded-byte SHA-256 `ContentHash`,
privacy-minimized `SourceIdentity`, acquisition identity, and governance-record
identity remain separate. `RawArtifact` is immutable evidence input and is not
a `SourceDocument`; normalization remains a downstream boundary.

## Storage and transaction model

SQLite schema v3 adds a content-addressed BLOB table, logical artifact rows, a
1:N acquisition-occurrence relation, minimal tombstones, and bounded
persistence-audit events. The existing
migration runner and its `BEGIN IMMEDIATE` semantics are reused. Blob,
artifact metadata, acquisition occurrence, governance attachment, retention data,
and success audit commit in one transaction. Any injected pre-commit failure
rolls all of them back.

Physical deduplication requires matching hash, byte length, and actual bounded
bytes. A `RawArtifact` is identified by source and content hash; globally unique
acquisition IDs identify separate observations and cannot rebind to another
artifact. Replaying one acquisition ID is idempotent, while a new ID adds a new
occurrence to the same artifact. Logical artifact rows retain independent
source, policy, and legal-hold state. Deleting one logical artifact removes its
occurrence rows through an enforced FK cascade and removes the physical
blob only after its final active reference is gone. The service verifies the
16 MiB ceiling, declared length, SHA-256, and deterministic artifact identity
before entering the transaction. Identical retries are idempotent; identity,
content, acquisition binding, or policy conflicts never overwrite committed data.

## Governance lifecycle

Every persist and public read/delete service call runs through the Sprint 17.2A
policy evaluator. Ephemeral, `not-persisted`, and
`discard-after-normalization` policies never enter durable storage. Because no
content redactor exists, `sensitive-fields` also fails closed instead of
claiming redaction. `metadata-only` stores no raw locator/header metadata.

`required-at-rest` always fails closed because this repository implements no
cryptography. `platform-managed` succeeds only when the caller supplies an
explicit provider that proves the platform boundary; local SQLite is not
assumed to be encrypted.

Bounded and evidence retention derive a deterministic `expiresAt` from the
injected creation clock. Expiry is exposed as an explicit lifecycle query;
there is no scheduler and reads after expiry are denied. Deletion requires a
policy-listed trigger and is idempotent. Active legal hold dominates expiry,
explicit request, and policy deletion, and no release mechanism is invented.
Successful deletion removes raw reachability and leaves only artifact/source/
hash/policy identity, reason, normalized-document action, and timestamp.
Deleting raw bytes never deletes a normalized `SourceDocument`.

## Privacy and integration

The typed acquisition bridge reuses the successful Sprint 17.2B body and hash
without refetching or re-running network security. Durable metadata stores no
raw URL, query, fragment, credential, response header, body copy in audit, SQL,
database path, native SQLite error, stack, or arbitrary debug field. Public
storage failures are bounded reason codes. Audit cardinality is database-backed
and records only identity, policy, operation, outcome, reason, and time.

No live connector, external request, evidence/reliability/genealogy logic,
LLM behavior, Web/Globe work, dependency, secret/OAuth implementation, or
background deletion scheduler is included.
