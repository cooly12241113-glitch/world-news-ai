# Sprint 15.1 — Briefing Run Contracts & Thin Orchestrator

## Delivery status

**IMPLEMENTED / REVIEWED / COMPLETE**

## Baseline commit

`551820fd6565a18f2a666ba67070fe172838cb8b`

## Goal

Provide strict application-level contracts and a thin `BriefingRunService`
that composes the existing initial briefing pipeline. This Sprint does not add
domain rules, provider behavior, Web integration, operational receipts, or a
clock/ID framework.

## Reused APIs

- `BriefingQuestionSchema` and `BriefingContractCompiler`
- `EvidenceContextBuilder` and its existing `EvidenceCandidateProvider`
- `StructuredExplanationPlanCoordinator` and
  `StructuredGenerationProvider`
- `RuleBasedBriefingScriptCompiler`, `BriefingScriptSchema`, and existing
  Script fingerprint
- `BriefingSessionSchema`, Session semantic fingerprint, and an injected
  Session initializer

Intent, ambiguity, policy, retrieval planning/scoring, evidence selection,
proposal validation/repair, Script compilation rules, and Session transitions
remain owned by those APIs.

## New contracts

`CreateBriefingRequest` contains only:

- the existing `BriefingQuestion`;
- the existing `BriefingPresentationPreference`.

It has a strict Zod schema. Reading level, provider configuration, API keys,
renderer/map/React state, DB handles, and mutable context bags are excluded.

`BriefingRunSemanticLineage` contains only existing semantic fingerprints:

- Contract;
- Evidence Context Package;
- validated ExplanationPlan;
- validated BriefingScript;
- validated BriefingSession.

No runtime ID, timestamp, duration, or retry identity enters lineage.

## Runtime stages

The strict stage enum is:

1. `received`
2. `contract-building`
3. `context-building`
4. `plan-generating`
5. `script-compiling`
6. `session-creating`
7. `completed`

Stages are operational metadata and are not UI copy or fingerprint input.

## Outcome taxonomy

`BriefingRunOutcome` is a strict discriminated union keyed by `kind`:

- `completed`
- `clarification-required`
- `insufficient-evidence`
- `generation-unavailable`
- `policy-rejected`
- `cancelled`
- `failed`

All outcomes carry `finalStage` and technical posture. Only `completed` carries
a validated Script, validated Session, and semantic lineage. Public failures
contain sanitized categories/reason codes and no exception, stack, raw provider
response, or prompt.

## Service responsibilities

`BriefingRunService.execute(unknown)`:

1. validates the request;
2. invokes the existing Contract compiler;
3. maps Contract outcomes without conflating clarification/policy with failure;
4. invokes the existing Context builder only for ready Contracts;
5. invokes the existing structured generation coordinator only for usable
   Context;
6. invokes the existing Script compiler only for a validated plan;
7. invokes the injected Session initializer only for a validated Script;
8. rechecks Script/Session fingerprints and lineage;
9. returns `completed` only after every atomic invariant passes.

The service does not call a concrete provider, network, storage, renderer,
React, MapLibre, timer, clock, random generator, or Session reducer.

## Contract mapping

- Contract `ready` continues to Context.
- `clarification-required` maps to the same nontechnical run outcome and stops.
- `unsupported` maps to `policy-rejected` and stops.
- compiler errors map to sanitized technical `failed/contract-invalid`.

## Context sequencing

The injected `createContextRequest` assembly supplies the existing
`ContextBuildRequest`; the service does not invent retrieval policy or runtime
metadata. `EvidenceContextBuilder` continues to own RetrievalPlan creation,
candidate access, scoring, diversity, budgets, provenance, and validation.

`insufficient-evidence` and `no-relevant-context` stop as
`insufficient-evidence`. Ready or partial Context proceeds so the existing
generation preflight remains authoritative for blocking gaps.

## Plan and generation sequencing

The injected `createGenerationInput` assembly supplies existing policy,
provider selection, budget, request identity, and requested time. The existing
coordinator owns request construction, provider calls, strict proposal
validation, allowlists, hydration, bounded repair, and plan validation.

- validated plan continues;
- clarification, unsupported, and insufficient Context preserve their existing
  nontechnical meanings;
- provider refusal maps conservatively to `generation-unavailable` because the
  existing refusal contract does not classify it as product policy rejection;
- disabled, unconfigured, timeout, rate/quota/auth/permission, and transient
  provider errors map to `generation-unavailable`;
- provider abort maps to `cancelled` as supported by the existing coordinator;
- proposal/semantic failures map to sanitized technical failure.

Advanced cooperative cancellation belongs to Sprint 15.2.

## Script sequencing

Only a validated plan is compiled. The existing compiler and validator remain
authoritative. Valid, valid-with-warnings, and static-only Scripts may proceed;
no-script or insufficient-context results do not create a Session. The service
rechecks Script status, fingerprint, and Contract/Context/Plan lineage before
Session initialization.

## Session initialization

There is no existing generic initial Session factory. Sprint 15.1 therefore
defines only an injected `initializeSession` dependency receiving the validated
Question, Contract, Context, Plan, and Script. It must return an existing
`BriefingSession`; the service validates its schema, semantic fingerprint, and
lineage.

The application service does not generate Session IDs or timestamps. Tests use
fixed explicit metadata. A formal runtime clock/ID port and production
initializer assembly remain Sprint 15.2/15.3 work.

## Atomic invariants

`completed` requires all of the following:

- ready validated Contract and usable validated Context;
- validated ExplanationPlan;
- validated/static-only Script with a correct existing fingerprint;
- strict valid Session with a correct existing fingerprint;
- identical Contract, Context, Plan, and Script identities across Script and
  Session.

Any mismatch stops the pipeline and cannot expose a partial completed result.

## Tests

The focused suite covers:

- valid, malformed, and unknown-field request validation;
- invalid stage/outcome fields;
- Contract clarification and policy rejection with downstream isolation;
- real deterministic fixture traversal through all existing stages exactly
  once;
- exact semantic lineage;
- deterministic semantic replay;
- insufficient Context short-circuit;
- invalid Session/fingerprint rejection;
- unconfigured provider mapping to `generation-unavailable`.

No existing test or assertion is removed or weakened.

## Architecture boundaries

New application code has no reference to React, MapLibre, DOM/browser globals,
CSS, concrete fetch/XMLHttpRequest/OpenAI/SQLite adapters, timers, animation
APIs, `Date.now`, `Math.random`, or `crypto.randomUUID`. Web source is unchanged.

## Known limitations

- No full operational receipt.
- No formal runtime clock or ID generator.
- Cancellation is only mapped from the existing generation result.
- No stale Web acceptance gate.
- No generic production Session initializer assembly.
- No Web bootstrap migration.
- Provider refusal has no typed policy/availability category in the existing
  provider result and is therefore not promoted to policy rejection.

## Sprint 15.2 handoff

Sprint 15.2 should first introduce privacy-minimized runtime receipt and
explicit clock/run-ID dependencies, then cooperative cancellation and stale
acceptance identity. It must preserve these contracts and avoid adding Web
state or concrete providers.

## Out of scope

Web changes, live GPT/search/backend, persistence/migrations, auth, new
dependencies, reading-level semantics, full receipt, advanced cancellation,
stale Web acceptance, UI/renderer/map changes, true append, and Sprint 15.3
bootstrap work are excluded.
