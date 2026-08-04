# Sprint 16.1 — Explicit Personal Context & Exposure Contracts

## Status

**IMPLEMENTED / REVIEWED / COMPLETE**

Sprint 16.1 implements request-scoped personalization input contracts only.
It does not calculate personal impact, generate scenarios, change a briefing
plan or Script, render UI, persist a profile, or connect a live provider.

## Goal

Represent only context a caller explicitly supplies for the current request
and run, under explicit consent and a closed purpose. Provide strict exposure
schemas, deterministic semantic identity, and safe transport through
`CreateBriefingRequest` without changing existing briefing behavior.

## Baseline

- Sprint 16.0 baseline: `358d17b` (`docs: define personalized impact analysis`)
- Branch: `main`
- Baseline tests: 71 files / 677 tests
- SQLite migration: v2
- Package and lockfile: unchanged
- Sprint 16.0: DESIGN COMPLETE

## Implemented boundary

The new bounded context is `src/personalization`:

- `models.ts`: consent, caller scope, strict exposure unions, context, result
- `fingerprint.ts`: normalization, exposure ID, semantic fingerprints
- `validation.ts`: strict Zod schemas, construction, consistency validation
- `index.ts`: public exports

The application request adds optional `personalImpactContext`. No other stage
consumes it in this Sprint.

## Consent and purpose

`PersonalizationConsent` contains only:

```ts
{
  enabled: boolean;
  purpose: "personalized-impact-analysis";
}
```

Purpose is a closed literal rather than arbitrary text. There is no timestamp,
account-wide grant, global consent state, UI checkbox, or persistence.

Consistency policy:

- disabled plus non-empty exposures: strict invalid;
- disabled plus empty exposures: valid `disabled` state;
- enabled plus valid exposures: valid `enabled` state;
- enabled plus empty exposures: valid `enabled-no-exposures` state, which makes
  the absence explicit without inventing an impact outcome.

`enabled-no-exposures` means personalization was requested but no usable
personal exposure exists. It must never be interpreted as “personalized result
generated”; Sprint 16.2 returns a structured unavailable result for this state.

## Caller scope

```ts
{
  lifetime: "request-run";
  propagation: "explicit-only";
}
```

Request nesting and this semantic marker define caller scope. No user ID,
account ID, PII, random scope ID, global mutable state, or cross-run carryover
is introduced.

## Exposure model

`UserExposure` is a strict discriminated union. Every validated exposure has a
deterministic `exposureId`, `source: "user-provided-explicit"`, one dimension,
and dimension-specific fields.

| Dimension | Strict value fields |
| --- | --- |
| `geography` | two-letter `countryCode` |
| `currency` | three-letter `currencyCode` |
| `industry` | normalized bounded `industry` |
| `asset-class` | closed asset-class enum |
| `employment-business` | normalized `industry` and closed relationship |
| `consumption` | closed consumption category |
| `supply-chain` | normalized `industry` and closed relationship |

There is no arbitrary metadata, custom dimension, inferred attribute,
confidence probability, impact magnitude, recommendation, portfolio target,
or free-form personal note. `qualitativeMagnitude` is intentionally absent;
impact magnitude belongs to Sprint 16.2 result design.

## Context aggregate

`PersonalImpactContext` contains:

- `contextVersion: "1"`;
- consent and purpose;
- minimal caller scope;
- validated explicit exposures; and
- `semanticFingerprint`.

Factories construct deterministic exposure IDs and context fingerprints. The
strict public schema rejects forged IDs, fingerprints, unknown fields, and
invalid consent/context combinations.

## Sensitive attribute boundary

Only the seven supported dimensions can parse. Health, race/ethnicity,
religion, political affiliation, sexual orientation, criminal history, and
custom dimensions are rejected. Reserved sensitive values cannot be disguised
as textual industry values. There is no schema field capable of holding a
general personal note or sensitive-profile payload.

The primary defense is the strict dimension/value allowlist and strict schema.
The small reserved-value check is defense in depth for the few bounded textual
industry fields; it is not, and must not evolve into, a general sensitive-text
classifier or a claim that all sensitive prose can be detected.

## Duplicate policy

Semantic duplicates are rejected, not silently deduplicated. For example,
`usd` and `USD` are the same currency exposure after canonicalization and
cannot both occur. Explicit rejection prevents caller mistakes from being
hidden and preserves one-to-one exposure references for Sprint 16.2.

## Semantic identity

Exposure IDs use the existing project SHA-256 semantic fingerprint utility and
are derived from normalized dimension-specific fields. No UUID or randomness
is used.

Context fingerprint input is limited to:

- context version;
- enabled state and closed purpose;
- caller-scope semantics; and
- canonical exposure semantic values in stable order.

String values use NFC, trimming, and whitespace collapse. Country/currency
codes are uppercased. Object property order and exposure array order do not
change identity. Runtime ID, correlation ID, timestamp, UI state, consent
interaction time, and exposure input order are excluded. A USD-to-EUR semantic
change changes the fingerprint.

## Legacy compatibility

`BriefingQuestion.userProvidedContext` and existing compiler behavior remain
unchanged. No `@deprecated` marker or warning is added. The new model exists in
parallel.

No automatic adapter is implemented because the legacy shape has no explicit
Sprint 16 purpose/consent and contains free-form arrays. Automatically mapping
it would silently upgrade old data into consented exposure context. A future
adapter is allowed only for lossless caller-authorized mappings; removal is not
considered before the Sprint 16.3 compatibility audit.

## CreateBriefingRequest integration

`CreateBriefingRequest` now accepts optional `personalImpactContext` and its
strict schema validates it. Existing callers that omit the field are unchanged.
Enabled context additionally requires
`question.personalizationRequested === true`. This allows intent analysis to
occur later while still requiring an explicit request signal; question wording
alone cannot activate context.

Sprint 16.1 transports and validates the context only. The Contract compiler,
Evidence builder, generation coordinator, Script compiler, and Session factory
do not use it yet. Therefore adding the field cannot create personalized
inference in this Sprint.

## Run lineage decision

`BriefingRunSemanticLineage` is unchanged. Although
`personalContextFingerprint` is now available, adding it before any run stage
consumes the context would imply lineage that the current pipeline has not
actually reached. Sprint 16.3 should add the optional fingerprint when the
personalization stage is integrated. Existing semantic fingerprints are not
reused or overloaded.

## Session decision

`BriefingSession` is unchanged. Raw context is forbidden. A future optional
`personalContextFingerprint` reference is deferred to Sprint 16.3, when the
complete Contract → Context → Impact → Plan → Script → Session lineage can be
validated without a premature Session migration.

## Privacy and receipt decision

`BriefingRunReceipt`, logs, audit records, errors, and console output are
unchanged and receive no raw context. Receipt fields such as
`personalizationUsed`, `exposureCount`, and `personalContextFingerprint` are
deferred until a stage actually uses personalization. This avoids claiming use
when Sprint 16.1 only transports an optional request field.

## Tests

New tests cover:

- valid explicit context and all seven dimensions;
- disabled/exposure rejection and enabled-empty structured state;
- sensitive/custom dimension and disguised sensitive value rejection;
- deterministic exposure IDs and duplicate rejection;
- stable ordering and NFC normalization;
- semantic USD/EUR identity change;
- unknown metadata, magnitude, runtime field, timestamp, forged ID and
  fingerprint rejection;
- optional request transport and explicit-request consistency; and
- legacy `UserProvidedContext` compatibility.

Existing suites remain the regression gate. No tests use live network, OpenAI,
search, persistence, time, randomness, or browser state.

## Verification results

- `npm.cmd run typecheck`: PASS
- `npm.cmd test`: PASS, 72 files / 695 tests
- New tests: 1 file / 18 tests (15 personalization contract tests and 3
  request/legacy integration tests)
- `npm.cmd run build:web`: PASS; existing large-chunk warning remains
- `npm.cmd audit`: 5 moderate findings in the existing Vite/PostCSS development
  toolchain; npm reports no fix available
- `npm.cmd audit --omit=dev`: 0 production vulnerabilities
- Package/lock/dependency changes: none
- Database migration: none; SQLite remains v2
- Live API/search/backend/persistence calls: none

The audit findings are not introduced by Sprint 16.1 and cannot be remediated
inside the dependency-change prohibition. They remain review-visible debt.

## Architecture boundaries

The personalization bounded context has no dependency on React, MapLibre,
window, document, local/browser storage, fetch, OpenAI/search clients, SQLite,
analytics, memory/profile services, `Date.now`, `Math.random`, or
`crypto.randomUUID`. It reuses only the existing deterministic fingerprint
utility and Zod runtime validation.

## Known limitations

- New context is not yet converted into Contract policy or impact output.
- No impact channel, assessment, magnitude, forecast, scenario, ranking, or
  recommendation exists.
- No compatibility adapter maps legacy context.
- Run/Session/receipt lineage does not yet carry the context fingerprint.
- Textual industry values are bounded and screened for reserved sensitive
  labels, but no external taxonomy service is introduced.
- ISO country/currency shape is validated; registry membership is not added.

## Sprint 16.2 handoff

Sprint 16.2 must first define a focused impact-analysis input that accepts only
a validated `PersonalImpactContext`, a ready Contract, and a validated
`EvidenceContextPackage`. It must then implement separate evidence refs and
exposure refs, ImpactChannel/ImpactAssessment posture, uncertainty/condition
requirements, and result fingerprints. It must not mutate Sprint 16.1 input
contracts to store derived magnitude and must not begin UI, persistence, live
provider, or recommendation work.

## Out of scope

- impact calculation, inference, ranking, magnitude, forecast, or scenario;
- ExplanationPlan/BriefingScript personalized sections or scenes;
- Session/follow-up/Web integration;
- profile/account persistence, browser storage, DB migration;
- live OpenAI, search, retrieval, backend, authentication, analytics;
- recommendations, portfolio targets, allocation, or execution.
