# Sprint 17.2A — Raw Artifact Governance & Credential Boundaries

## Status

**IMPLEMENTED / REVIEWED / COMPLETE**

## Goal and baseline

Define the governance and credential-reference contracts required before raw
source persistence or authenticated acquisition can exist. This Sprint does
not access a network, resolve a secret, encrypt or persist bytes, or implement
Sprint 17.2B/17.2C/17.3 behavior.

- Baseline: `15ca9b4782443b2f4cc0a8fc5fc11327d6fb23eb`
  (`feat: add universal source connector contracts`).
- Sprint 17.1: IMPLEMENTED / REVIEWED / COMPLETE.
- Existing SQLite schema remains v2 and stores only normalized SourceDocument,
  observation, revision, job, and dossier records.

## Threat model boundary

The contracts address accidental indefinite retention, deletion ambiguity,
unencrypted persistence policy, inappropriate raw access, secret material
entering core objects, missing source-account consent, forged governance
identity, audit leakage, and prompt injection being treated as instructions.

They do not defend a network transport. DNS rebinding, IP filtering, egress
pinning, redirects, robots/platform enforcement, OAuth, secret storage, actual
encryption, durable raw storage, and media processing remain outside this
Sprint.

## Bounded context

`src/source-governance` is separate from `src/source-connector`. Acquisition
describes how content was obtained; governance describes whether and how a raw
artifact may be retained, accessed, redacted, or deleted. Governance references
the Sprint 17.1 `RawArtifactReference` and does not modify or duplicate it.

## Raw lifecycle policy

`RawArtifactLifecyclePolicy` is a semantic definition containing retention,
deletion, redaction, encryption requirement, access class, policy version, and
the fixed `UNTRUSTED_DATA` instruction posture. It has a deterministic policy
ID and SHA-256 semantic fingerprint.

Policy definition is not persistence state. It contains no stored-at location,
access time, deletion execution time, audit ID, runtime run ID, or repository
status.

## Retention

Retention is a strict union:

- `ephemeral`
- `bounded` with a positive typed duration
- `retained-for-evidence` with a positive typed duration
- `legal-hold` with an explicit active opaque authority reference

Duration is a positive integer plus `day`, `week`, `month`, or `year`. Bounded
and evidence retention also require a scheduled-expiry trigger. No core default
duration or vague string is provided. Public-source access does not select
indefinite retention.

## Deletion

Deletion policy contains only these triggers: scheduled expiry, explicit
request, and policy deletion. It separately records whether legal hold prevents
deletion and whether normalized data requires review.

Legal-hold retention must prevent deletion and must carry an active opaque
authority reference. Other retention kinds cannot set the legal-hold deletion
protection flag. The evaluator denies raw deletion under legal hold and denies
durable persistence under ephemeral retention. No delete API, propagation
engine, or persistence mutation is implemented.

## Redaction

The policy posture is `none`, `metadata-only`, `sensitive-fields`, or
`discard-after-normalization`. This is a requirement descriptor, not a
redaction algorithm. Discard-after-normalization requires a `not-persisted`
encryption/persistence posture.

## Encryption requirement

The descriptor is `required-at-rest`, `platform-managed`, or `not-persisted`.
Persistent retention cannot use `not-persisted`. No cipher, key, KDF, secret
file, cloud KMS, or encryption adapter is included.

## Access classes

Raw artifacts are classified as `public-source`, `consented-private-source`,
or `restricted-operational`. Public access and retention are orthogonal.
Private or restricted artifacts require an opaque credential reference before
the evaluator can allow an operation.

## CredentialReference and scope

`CredentialReference` contains an opaque reference ID, connector ID,
credential requirement kind, and a scope fixed to source acquisition. Scope is
connector-specific and either needs no consent or explicit source-access
consent. Reference connector and scope connector must match.

It cannot contain API keys, tokens, access/refresh tokens, passwords, cookies,
authorization headers, secret values, credential objects, or arbitrary
metadata. It is not a UserProfile and contains no account data.

## Consent boundary

`SourceAccountAccessConsent` has the exact purpose `source-account-access` and
scope `this-acquisition`. It is deliberately separate from Sprint 16 Personal
Impact consent. An authenticated source without granted source-account consent
returns `explicit-consent-required` before credential availability is checked.

## Credential resolver port decision

Only `CredentialReferenceAvailabilityResolver` is defined. It may report that
an opaque reference is available, unavailable, or denied. The evaluator
requires this availability-only result whenever a credential reference is
supplied and fails closed for missing, unavailable, or denied availability. It
does not return secret material and has no implementation in Sprint 17.2A.
Future transport adapters must bind secret material privately outside core
contracts after separate approval.

## Access policy versus access decision

Sprint 17.1 `SourceAccessPolicy` remains a caller/runtime declaration. The new
`SourceAccessDecision` is the evaluator result: allowed, denied,
credential-required, explicit-consent-required, or prohibited. Declaration and
decision taxonomies are not merged.

## Governance attachment

`RawArtifactGovernanceRecord` links artifact/source identity to one policy ID
and fingerprint. It does not copy retention, deletion, encryption, or access
objects into the Sprint 17.1 reference. This supports a future single durable
policy source of truth without a database implementation today.

## Policy semantic identity

The semantic fingerprint includes policy version, canonicalized retention and
deletion semantics, redaction, encryption, access class, and instruction
posture. Set-like deletion triggers are sorted. Accessed time, audit time,
retrieval run, audit ID, and deletion execution timestamp are absent.

## Access audit event

`RawArtifactAccessAuditEvent` is an operational fact containing artifact and
governance IDs, operation, purpose, actor class/optional opaque actor reference,
allowed/denied result, safe reason code, policy lineage, and timestamp. It
cannot contain raw content, a full profile, credentials, or arbitrary debug
metadata.

The minimal operation taxonomy is read, persist, normalize, redact, and delete.
Purposes are ingestion normalization, retention management, security review,
and deletion request.

## Policy evaluator and fail-closed behavior

`RawArtifactPolicyEvaluator` is pure and deterministic. It validates all input,
semantic policy identity, artifact/governance/policy lineage, access
declaration, consent, credential scope, retention, redaction, and encryption
posture.

It fails closed for unknown/invalid governance, forged policy/artifact/
governance identities, broken references, prohibited access, missing consent,
missing or unavailable credentials, connector-scope mismatch, legal-hold
deletion, ephemeral persistence, and persistence when policy says not
persisted. Network/DNS state is not an evaluator input.

## Raw versus normalized lifecycle

Raw deletion never automatically deletes a validated normalized
`SourceDocument`. Each deletion policy explicitly says `none` or
`review-required` for normalized data. Future legal/user requirements may add a
reviewed propagation policy, but no propagation engine exists here.

## Provenance tombstone

`RawArtifactTombstone` can retain permitted minimal provenance after future raw
deletion: artifact/source identity, content hash, policy lineage, deletion
reason, normalized-document review posture, and deletion time. It contains no
raw content and is not persisted in this Sprint.

## Prompt injection invariant

Every lifecycle policy fixes `instructionPolicy` to `UNTRUSTED_DATA`. Text such
as “ignore previous instructions”, “send credentials”, or “run this command”
inside acquired content remains source data, never a system/tool instruction.
No LLM sanitizer is implemented.

## Strict validation and privacy

Strict Zod schemas cover lifecycle policy, typed duration, deletion, redaction,
encryption requirement, access class, governance attachment, credential
reference/scope, consent, credential availability, evaluation input/decision,
audit event, and tombstone. Unknown properties are rejected.

Tests apply every prohibited secret field to multiple public schemas. The
primary defense is schema closure, not an unreliable general string scanner.

## Tests

- New test files: 2
- New tests: 54
- Final suite: 79 test files / 845 tests
- skipped/only/todo: 0
- Typecheck and Web production build: PASS
- Full audit: 0 vulnerabilities
- Production audit: 0 vulnerabilities
- Sprint 17.1 tests remain unchanged
- Package manifest changes: none
- Lockfile-only development-toolchain remediation: PostCSS `8.5.22` to
  `8.5.26`; nanoid `3.3.16` to `3.3.18`
- Migration changes: none; SQLite remains v2

## Independent final review

The Q4 review found and repaired fail-closed gaps before delivery: credential
availability was not consumed by the evaluator; legal hold lacked an explicit
authority contract; deterministic artifact/governance identities were not
revalidated; ephemeral persistence and non-expiring bounded retention could be
expressed; and deletion protection could be asserted outside legal hold.
Regression tests cover each repair. No BLOCKER or HIGH implementation finding
remains.

The approved security remediation updated only the vulnerable transitive
development-toolchain packages already admitted by the existing dependency
ranges: Vite `8.1.5` resolves PostCSS `8.5.26`, which resolves nanoid `3.3.18`;
Vitest continues to use the same Vite line. `package.json` is unchanged, no
duplicate vulnerable copy remains, and both full and production npm audits
report zero vulnerabilities.

The review attributed GHSA-fxqj-rqcc-2cmp and GHSA-2v37-7h3g-55p8 to the
pre-existing committed dependency graph rather than Sprint 17.2A: before the
approved remediation, `package.json` and `package-lock.json` matched baseline
`15ca9b4782443b2f4cc0a8fc5fc11327d6fb23eb`. Because compatible patched
transitive releases existed, no temporary security exception was accepted.
The lockfile-only update changed PostCSS `8.5.22` to `8.5.26` and nanoid
`3.3.16` to `3.3.18` without changing Vite, Vitest, direct dependencies, or the
package manifest.

## Sprint 17.2B handoff

After review, Sprint 17.2B may implement a Safe Network Acquisition Runtime
behind the Sprint 17.1 connector port with:

1. resolver-aware DNS resolution and validation of every resolved address;
2. connection pinning, redirect destination revalidation, and explicit egress
   allow/deny policy;
3. bounded timeout, response size, redirect, retry, concurrency, and rate-limit
   behavior;
4. private credential-reference binding after policy/consent decisions, with no
   secret entering core results or logs;
5. cancellation and privacy-minimized network attempt audit; and
6. deterministic injected transport tests with zero live network dependency.

Sprint 17.2B must not add durable raw storage; that remains Sprint 17.2C.
Sprint 17.2B is not started here.

## Known limitations

- Policies, governance records, audit events, and tombstones are in-memory
  values only.
- No enforcement is wired into connector or persistence orchestration.
- The availability resolver has no implementation and returns no secret by
  design.
- No deletion propagation decision beyond none/review-required exists.
- Actor identity is an opaque optional reference and has no identity service.
- Legal interpretation and retention durations require product/legal approval.

## Out of scope

Fetch, HTTP, DNS runtime, sockets, IP filtering, redirects, egress, live Web or
RSS, platform APIs, OAuth, real credentials, secret storage, encryption code,
raw binary persistence, SQLite migration, filesystem/cloud storage, media,
evidence/reliability scoring, UI, Sprint 17.2B, Sprint 17.2C, Sprint 17.3,
and release tag creation are excluded.
