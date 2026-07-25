# Milestone 02 — Pre-Renderer Integration & Completeness Audit

- Status: READY_WITH_NON_BLOCKING_DEBT
- Audit date: 2026-07-25
- Baseline: `3f9dff7abb4d6d00f0a16ca3e915e1d3c1727aa3`
- Scope: Sprint 00–12
- SQLite migration: 2

## Purpose and baseline

This audit verifies the complete offline path from source input to a validated,
renderer-neutral BriefingScript. It does not implement a renderer, motion
planner, UI, live provider call, or persistence migration.

The starting baseline passed strict TypeScript checking, 42 Vitest files and
405 tests, with zero npm audit vulnerabilities. Local `main` and `origin/main`
were synchronized and the worktree was clean.

## Executed checks

- Git history, branch, remote, tag, worktree, and Sprint 11/12 comparison
- Complete test inventory, disabled-test search, and Vitest discovery
- URL identity, canonicalization, logging, provenance, and dedup boundaries
- Contract, status, enum, fingerprint, provenance, and epistemic continuity
- Zod strictness, persistence read-back, errors, safe outcomes, and retries
- Generation no-live-call and closed-world structured proposal boundary
- BriefingScript scene budget, DAG, evidence, visual, layout, and accessibility
- Import boundaries, public exports, secrets, dependencies, and migrations
- Documentation against implementation

## Test inventory discrepancy

Sprint 11 contains 38 tracked test files. Git history from Sprint 11 to Sprint
12 adds exactly four test files:

- `src/integration/__tests__/briefing-script.test.ts`
- `src/script/__tests__/compiler.test.ts`
- `src/script/__tests__/schema-presentation.test.ts`
- `src/script/__tests__/validator-fingerprint.test.ts`

`src/script/__tests__/fixtures.ts` was the fifth generated support file but is
not a test file and is not discovered by Vitest. No test was deleted, renamed,
merged, skipped, disabled, or excluded. Therefore 38 + 4 = 42 was correct; the
reported “five generated test files” description was incorrect.

## URL identity audit

Identity-bearing query pairs are retained and sorted. Tracking and sensitive
parameters are removed from identity; sensitive values are redacted for
logging. Fragments and URL credentials are removed. Default ports and host
casing are normalized by the URL implementation, and repeated query pairs are
sorted deterministically.

The audit found that `candidateFromRecord` separately removed every query
parameter when creating Context provenance. This could merge `?id=1` and
`?id=2` after persistence. URL identity policy now has one domain-level
implementation used by persistence and context. Tests cover `id`, `page`,
`version`, tracking pairs, sensitive pairs, ordering, fragments, credentials,
default ports, and repeated parameters.

Removing credentials from identity can intentionally collide URLs that differ
only by credentials. This is a security tradeoff: credentials do not identify
public documents and must never be logged or propagated.

## Issue distribution

| Module | Blocker | High | Medium | Low | Documentation | Technical debt |
|---|---:|---:|---:|---:|---:|---:|
| domain/persistence/context | 0 | 1 | 0 | 0 | 0 | 0 |
| script | 0 | 2 | 1 | 0 | 0 | 0 |
| testing/docs | 0 | 0 | 0 | 0 | 1 | 0 |
| ingestion/security | 0 | 0 | 0 | 0 | 0 | 1 |
| persistence/knowledge store | 0 | 0 | 0 | 0 | 0 | 2 |
| **Total** | **0** | **3** | **1** | **0** | **1** | **3** |

### Findings and fixes

| ID | Severity | Stage | Root cause and impact | Resolution |
|---|---|---|---|---|
| M02-URL-01 | HIGH | SourceDocument → Context | Context removed all query pairs, losing document identity in provenance | Shared identity policy; candidate provenance regression |
| M02-SCRIPT-01 | HIGH | Compiler output | Successful build returned a draft instead of validator-produced script | Return `validation.script`; assert validated/static-only status |
| M02-SCRIPT-02 | HIGH | Plan → Script | One scene per section plus boundaries exceeded `maximumScenes` | Deterministically group adjacent sections and retain coverage |
| M02-SCRIPT-03 | MEDIUM | Script validation | Some cross-record relationships were only shape-checked | Validate plan, context, excerpt, provenance, citation, and visual allowlists |
| M02-DOC-01 | DOCUMENTATION | Sprint 12 report | Fixture support file was counted as a test file | Corrected in this milestone |

No blocker remains. Every reproducible code issue has a regression test.

## Contract compatibility and provenance closure

The compatibility matrix is recorded in
[Contract Compatibility Matrix](../architecture/Contract-Compatibility-Matrix.md).
IDs, fingerprints, status gates, references, and policy enums remain compatible.
Invalid, clarification, unsupported, insufficient, refusal, and invalid-script
states cannot be promoted to a renderer-ready value.

```text
BriefingScene → SceneContentBinding → ExplanationStep/EvidenceBinding
→ ContextItem → SourceExcerpt + ProvenanceRecord
→ SourceDocument/Claim/EvidenceLink/DataPoint
→ canonical identity + fingerprint + revision + capability
```

Script validation now checks these relationships, not only string shapes.
Document visuals require bound documents and excerpts; charts require bound
DataPoints; map locations must be evidence-bound; citation cues cannot exceed
their scene bindings.

## Epistemic and determinism results

Confirmed facts, attributed claims, interpretations, inferences, forecasts, and
unknowns retain their validation policies. Forecast assumptions are mapped to
the `uncertainty` section, use `unknown`, require uncertainty disclosure, and
are not reclassified as scenarios. No probabilities or verdict prose are
generated.

Semantic fingerprints exclude generated IDs and timestamps while retaining
content, revisions, policy/model/template/compiler versions, evidence identity,
and semantic sequence. Unordered reference sets are canonicalized. Tests cover
time/ID invariance and semantic mutations across contract, context, generation,
plan, and script boundaries.

## Runtime, generation, and security results

External inputs, provider proposals, domain aggregates, and SQLite JSON
read-back use strict runtime validation. Unknown keys are rejected at public
schemas. Provider refusal, transport failure, semantic failure, clarification,
and insufficient context remain distinct.

Generation is disabled and unconfigured by default. The OpenAI SDK is isolated
to its adapter. Tests inject clients, clocks, and sleepers; no live provider or
network call occurs. Requests mark evidence `DATA_ONLY`, use exact allowlists,
store hashes/IDs rather than raw prompts or provider bodies, and permit only
bounded retry and repair.

No tracked secret or `.env` file was found. `.env.example` contains empty
placeholders. No UI or map dependency exists. Sensitive URL values, source
bodies, stack traces, hidden reasoning, and personal attribute inference are
excluded from user-facing results and audits.

## BriefingScript renderer readiness

The compiler now returns only validator-produced scripts, honors the full scene
budget including opening and closing, preserves all required plan coverage, and
creates a deterministic dependency DAG. Bottom composer, playback controls,
safe viewport, manual interaction, captions, keyboard navigation, screen-reader
labels, color-independent semantics, static fallback, and reduced-motion
policies are present.

Camera values remain semantic intents only: no coordinates, zoom, bearing,
pitch, duration, easing, or SDK command is present.

## Remaining non-blocking debt

- Production DNS-resolution and rebinding defense before unrestricted ingestion.
- Complete independent persistence for Claim, EvidenceLink, DataPoint, and Entity.
- Context, generation-audit, and BriefingScript persistence adapters.
- Semantic retrieval and operational retention/redaction policy.
- Package-root facade; module public indexes are sufficient for Sprint 13.
- Renderer-specific performance profiling remains a Sprint 13 responsibility.

## Final decision

**READY_WITH_NON_BLOCKING_DEBT.** There are no Sprint 13 blockers. Renderer work
may consume `src/script` through its public index, but must preserve validation,
evidence scope, accessibility, and no-motion fallbacks.
