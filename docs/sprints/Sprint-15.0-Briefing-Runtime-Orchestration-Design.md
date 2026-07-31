# Sprint 15.0 — Briefing Runtime Orchestration Design

## Status

**DESIGN COMPLETE**

This document is a compatibility audit and implementation contract. Sprint
15.0 changes no production source, tests, package metadata, or migrations.

## Motivation

Sprint 08–14 provide the validated stages from a question through an
interactive `BriefingSession`, but no application service currently owns the
initial end-to-end run. The Web app instead starts from a prebuilt demo Script.
Sprint 15 introduces a thin orchestration boundary that composes existing
stages without reimplementing their domain rules or replacing the accepted
Session, presentation, player, map, or follow-up architecture.

## Documents and compatibility baseline

The audit used the README, CURRENT, CHANGELOG, roadmap, Milestone 01 and 02,
Sprint 08–14.3B documents, ADR-008 through ADR-013, and the relevant question,
context, explanation, generation, Script, Session, follow-up, and Web
architecture documents. The repository contains no separately named Project
Constitution, PRD, Database, or TODO document; this design does not invent
replacements for them.

The governing implementation facts are:

- the core pipeline is deterministic where rule/fixture implementations are
  selected, with random operational IDs and timestamps excluded from semantic
  fingerprints;
- public inputs and cross-boundary outputs are runtime validated;
- insufficient evidence, clarification, unsupported requests, provider
  refusal/unavailability, and invariant failures are distinct;
- providers are untrusted proposers, never domain authorities;
- the browser currently consumes a runtime-validated prebuilt fixture Script;
- follow-up orchestration already demonstrates operation identity, optimistic
  fingerprint preconditions, stale-result isolation, structured outcomes, and
  atomic Script/Session replacement.

## Current architecture

The implemented initial-generation components exist, but are not composed by a
single application service:

```text
BriefingQuestion
  -> BriefingContractCompiler (validation, intent, ambiguity, policy, Contract)
  -> EvidenceContextBuilder (RetrievalPlan, provider candidates, selection, Context)
  -> RuleBasedExplanationPlanAssembler OR StructuredExplanationPlanCoordinator
  -> RuleBasedBriefingScriptCompiler
  -> BriefingScriptValidator
  -> no general initial BriefingSession factory
```

The structured-generation route uses the existing request builder, provider
port, proposal validation, hydrator, `ExplanationPlanValidator`, bounded retry,
and generation audit. The rule-based assembler is a separate existing path and
must not be silently mixed into the structured-provider path.

### Current Web bootstrap

```text
App
  -> demoCatalog
  -> buildDemoScript (constructs, fingerprints, and Zod-validates fixture Script)
  -> useFollowUpSessionController
  -> createDemoBriefingSession
  -> adaptBriefingScript
  -> existing player, SceneDispatcher, MapSurface, and AnalysisPanel
```

`App.tsx` therefore does not execute question, retrieval, context, generation,
or Script compilation. It directly owns the fixture selection and the player,
while the follow-up controller owns active Script, Session, presentation, and
atomic replacement.

## Current API inventory

“Validation” means runtime validation at the public boundary. “Fingerprint”
means an existing semantic fingerprint, not an operational run identifier.

| Stage | Module | Public API | Input -> output | Mode | Validation / fingerprint | Outcome and side effects | Current caller | Sprint 15 reuse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Question | `src/briefing/models.ts`, `validation.ts` | `BriefingQuestion`, `BriefingQuestionSchema` | unknown -> validated question | sync, deterministic for fixed input | Zod / no question fingerprint today | parse error; none | Contract compiler | Construct minimal question, then use schema through compiler |
| Intent and ambiguity | `src/briefing/analyzer.ts` | `RuleBasedQuestionIntentAnalyzer.analyze` | question -> `QuestionIntentAnalysis` | sync; deterministic with injected clock | result schema in compiler / carried into Contract | ambiguity status; clock only | Contract compiler | Reuse unchanged |
| Contract | `src/briefing/compiler.ts` | `BriefingContractCompiler.compile` | unknown -> `CompileBriefingResult` | sync; deterministic with injected ID/clock | question, analysis, Contract schemas / Contract fingerprint | ready, clarification, unsupported, or structured error; ID/clock | tests/integration | Reuse; translate result only |
| Retrieval plan | `src/context/planner.ts` | `RetrievalPlanner.createPlan` | `ContextBuildRequest` -> `RetrievalPlan` | sync; deterministic with injected ID | schema checked by builder / plan fingerprint exists | may throw before builder translation; ID only | Context builder | Let builder call it; do not call twice |
| Candidate retrieval | `src/context/models.ts`, `provider.ts` | `EvidenceCandidateProvider.findCandidates`; in-memory/repository adapters | plan + request -> candidates | sync; deterministic depends on adapter | candidate use validated by builder/package / provenance | repository adapter may read storage | Context builder | Inject existing provider port |
| Context | `src/context/builder.ts` | `EvidenceContextBuilder.build` | unknown -> `ContextBuildResult` | sync; deterministic with fixed provider/ID/clock | request, plan, package schemas / context fingerprint | ready/partial/insufficient statuses or structured error | tests/integration | Reuse and translate status |
| Rule plan | `src/explanation/assembler.ts` | `RuleBasedExplanationPlanAssembler.generate` | question + Contract + Context -> `ExplanationPlanBuildResult` | sync; deterministic with injected ID/clock | validator / plan fingerprint | ready, partial, insufficient, clarification, unsupported, no-plan, or error | tests/integration | Optional local policy-selected route; never duplicate rules |
| Structured request | `src/generation/request-builder.ts` | `ExplanationPlanLlmRequestBuilder.build` | generation input -> bounded request package | sync, deterministic | strict package schema / request fingerprint | throws on invalid lineage; no external side effect | generation coordinator | Coordinator-owned; do not invoke separately |
| Generation port | `src/generation/models.ts` | `StructuredGenerationProvider.generate` | request package + optional `AbortSignal` -> provider response | async; provider-dependent | response validated downstream / output hash | provider call is external for live adapter; fake is offline | generation coordinator | Inject existing port; fixture and future live share it |
| Structured plan | `src/generation/coordinator.ts` | `StructuredExplanationPlanCoordinator.generate` | generation input -> `StructuredGenerationResult` | async; deterministic with fixture and injected clock | proposal allowlist, hydration, plan validation / request and plan fingerprints | validated plan, expected non-plan outcomes, or typed generation error; provider/audit/time | tests/integration | Reuse as the async generation stage |
| Proposal validation | `src/generation/proposal.ts`, `hydrator.ts`; `src/explanation/validator.ts` | `validateProposal`, `ExplanationPlanProposalHydrator.hydrate`, `ExplanationPlanValidator.validate` | untrusted proposal -> validated plan | sync, deterministic | strict allowlist and semantic validation / plan fingerprint | structured validation result; none | generation coordinator | Coordinator-owned; never duplicate |
| Script compile | `src/script/compiler.ts` | `RuleBasedBriefingScriptCompiler.compile` | validated plan + Contract + Context + preference -> `BriefingScriptBuildResult` | sync; deterministic with injected clock | compiler invokes Script validator / Script fingerprint | validated/static/partial, no-script statuses, or structured error | tests/integration | Reuse; accept only validated/static success for Session |
| Script validation | `src/script/validator.ts` | `BriefingScriptValidator.validate` | draft + plan + Contract + Context -> validation result | sync, deterministic | comprehensive runtime/lineage validation / verifies content | typed issues; none | Script compiler | Compiler-owned; acceptance may recheck branded status/fingerprint |
| Session | `src/session/*` | `BriefingSessionSchema`, `withBriefingSessionFingerprint`, `reduceBriefingSession` | Session data/command -> validated transition | sync, deterministic with supplied transition context | Zod and invariant checks / Session fingerprint | accepted/rejected transition; no external effect | Web demo factory and follow-up controller | Add one thin initial factory in Sprint 15; reuse schema/fingerprint/reducer |
| Web presentation | `apps/web/src/renderer/presentation-adapter.ts` | `adaptBriefingScript` | Script draft -> `RendererResult<RenderableBriefing>` | sync, deterministic | requires validated/static status / carries Script fingerprint | structured renderer failure; none | follow-up controller/tests | Reuse unchanged after completed outcome |
| Follow-up request | `src/follow-up/*` | `parseFollowUpRequest`, `classifyFollowUp` | unknown/context/policy -> request/decision | sync, deterministic | Zod / request and decision fingerprints | typed classifier decision; none | follow-up orchestrator | Pattern reference only; no initial-run coupling |
| Follow-up orchestration | `src/application/follow-up/*` | `executeFollowUp` | Session + execution request + adapter -> `FollowUpExecutionOutcome` | sync with current fixture adapter | strict schemas and preconditions / outcome fingerprint | six structured outcomes; adapter-dependent | Web controller | Reuse stale/outcome philosophy, not implementation |
| Replan | `src/replan/*` | `ReplanAdapter.prepare`, `FixtureReplanAdapter`, `applyReplanResultToSession` | replan request -> result/Session | sync in fixture | strict result/replacement validation / result fingerprints | replacement/current/clarification/unsupported/failure | follow-up orchestrator | Existing follow-up-only boundary; do not merge into initial run |

## Compatibility findings and duplication risks

1. Contract compilation already owns input validation, intent, ambiguity, and
   policy. A runtime service must not split or reproduce those rules.
2. `EvidenceContextBuilder` already owns planning, provider access, scoring,
   diversity, budgets, gaps, provenance, and package validation.
3. The generation coordinator already owns request construction, allowlists,
   proposal validation, bounded retry/repair, hydration, semantic validation,
   cancellation forwarding, and audit records.
4. Script compilation already validates its result. A second Script schema or
   compiler is prohibited.
5. Session transition and fingerprint rules are already complete. Sprint 15
   needs only initial construction and atomic acceptance, not another reducer.
6. `GenerationAuditRecord` is generation-specific and is not a substitute for
   the end-to-end run receipt.
7. Web follow-up state and player state must remain intact. A parallel runtime
   state machine would create conflicting owners.
8. Existing source uses `AbortSignal` in the generation port and concrete
   provider boundary. Sprint 15 must wrap this compatibility fact rather than
   invent a second provider or expose browser objects in new domain contracts.

## Runtime boundary

The recommended name is `BriefingRunService`, consistent with existing
application-service naming. Its single public operation is conceptually:

```ts
execute(request: CreateBriefingRequest): Promise<BriefingRunOutcome>
```

It may sequence existing services, update a local stage variable, check
cancellation between stages, translate existing results, create runtime
identity and a privacy-minimized receipt, construct and validate an initial
Session, and return Script plus Session atomically on success.

It must not parse intent, score evidence, select evidence, define Explanation
Plan rules, validate provider proposals, compile Script content, reduce Session
commands, manage React/MapLibre, perform SQL/fetch, or know a concrete OpenAI or
search implementation. Stage-specific helpers remain their existing owners;
the service is a coordinator, not a god object.

## Request contract

The minimum recommended `CreateBriefingRequest` is:

```ts
interface CreateBriefingRequest {
  requestId: string;
  question: BriefingQuestion;
  presentationPreference: BriefingPresentationPreference;
  runtimePolicy: BriefingRuntimePolicy;
  cancellation?: BriefingRunCancellation;
  correlationId?: string;
}
```

`BriefingQuestion` already carries `language`, explicit user context,
references, conversation context, and personalization intent; duplicating
locale, reading level, or arbitrary context at the run level would create two
sources of truth. Reading level is not an existing Contract field and is
therefore excluded from Sprint 15.1. If it becomes a real product requirement,
it must be designed later at the BriefingContract/AnswerPolicy domain level.
`runtimePolicy` selects only
existing assembly choices and limits; it cannot contain API keys, concrete
provider configuration, DB connections, renderer coordinates, React state, or
mutable bags.

`requestId` is caller-provided operational correlation, not semantic identity.
Question text participates indirectly in existing downstream semantic
fingerprints. No new top-level “run fingerprint” is justified until a consumer
requires one.

## Stage taxonomy

Use the following compact, deterministic set:

```text
received
contract-building
context-building
plan-generating
script-compiling
session-creating
completed
```

`finalStage` records where execution stopped. Internal “ready” boundaries are
already expressed by typed stage outcomes and fingerprints, so duplicating
them as stages adds noise. Retrieval planning/retrieving remain observable
inside context audit data; proposal/validation remain observable in generation
audit data. UI loading copy is projected from stages and is not the stage
contract. Stage never contributes to a semantic fingerprint.

## Outcome taxonomy

Every terminal result includes a receipt. Only `completed` includes both a
validated Script and a matching validated Session.

| Outcome | Meaning / source | Retry | User-safe message | Script / Session | Technical failure |
| --- | --- | --- | --- | --- | --- |
| `completed` | All invariants passed | no | optional | yes / yes | no |
| `clarification-required` | Contract cannot resolve the question safely | after clarification | yes | no / no | no |
| `insufficient-evidence` | Context or plan cannot meet evidence policy | after evidence changes | yes | no / no | no |
| `generation-unavailable` | Provider disabled, unavailable, or refused under policy | policy-dependent | yes | no / no | recoverable operational outcome, not internal failure |
| `policy-rejected` | Contract is unsupported or generation is refused for a policy reason | only with changed request/policy | yes | no / no | no |
| `cancelled` | Cooperative cancellation observed | yes | yes | no / no | no |
| `failed` | Recoverable technical failure or invariant violation translated at application boundary | from category | sanitized only | no / no | yes |

`failed` carries a categorized, sanitized failure; unexpected exceptions are
caught once at the application boundary. The service must not leak provider
responses, prompts, stack traces, or raw evidence to UI messages.

## Receipt

```ts
interface BriefingRunReceipt {
  runId: string;
  requestId: string;
  correlationId?: string;
  finalStage: BriefingRunStage;
  outcomeKind: BriefingRunOutcome["outcome"];
  questionId: string;
  contractFingerprint?: string;
  retrievalPlanFingerprint?: string;
  contextFingerprint?: string;
  explanationPlanFingerprint?: string;
  scriptFingerprint?: string;
  sessionFingerprint?: string;
  providerKind?: "fixture" | "live";
  evidenceCount?: number;
  sceneCount?: number;
  startedAt: string;
  completedAt: string;
  failureCategory?: BriefingRunFailureCategory;
}
```

The receipt is operational lineage, not a semantic aggregate. It stores no raw
question text, prompt, provider response, evidence excerpt, API key, or private
user context. `runId`, correlation IDs, timestamps, duration, attempts, and
random metadata never enter Contract, Context, Plan, Script, or Session
semantic fingerprints.

## Identity model

- **Runtime identity:** unique `runId` and optional correlation ID distinguish
  executions and enforce acceptance ordering.
- **Semantic identity:** existing Contract, RetrievalPlan, Context, Plan,
  Script, and Session fingerprints represent validated content/lineage.
- **Acceptance identity:** Web stores the latest started `runId`; it accepts a
  completed outcome only when the outcome run ID is still current and the
  Script/Session fingerprints and IDs agree.
- **NFC:** all new string canonicalization, if eventually required, must use the
  existing `createSemanticFingerprint` NFC policy. Sprint 15 adds no run
  semantic fingerprint.

## Ports and adapters

Reuse `EvidenceCandidateProvider` and `StructuredGenerationProvider`. Do not
rename or wrap them merely for symmetry. Add only these application utilities
if implementation proves necessary:

- `RuntimeClock`: `now(): string`, to isolate operational timestamps;
- `RuntimeIdGenerator`: `createRunId(): string`, for runtime identity;
- `BriefingRunCancellation`: framework-neutral `isCancellationRequested()`
  plus an optional adapter method for the existing generation `AbortSignal`.

The deterministic local assembly injects the existing in-memory/repository
candidate provider and `DeterministicFakeStructuredProvider`. A future live
assembly injects adapters implementing the same existing ports. The run service
never imports concrete OpenAI, search, React, MapLibre, or SQLite adapters.

## Cancellation

Cancellation is cooperative and checked before and after every stage and before
Session construction. A cancelled run returns `cancelled`; it does not create a
Session and does not become `failed`. The Web adapter may translate an
`AbortSignal` into `BriefingRunCancellation` and pass the same signal only to
the existing generation input compatibility boundary. Browser-specific
`AbortController` must not appear in new application/domain contracts.

A provider result arriving after cancellation is discarded before compilation
or Session creation. No timer-based fake cancellation is permitted. Cancellation
changes runtime outcome only, never semantic fingerprints.

## Stale execution

The run service creates and returns run identity but does not decide which Web
run is latest. The Web bootstrap controller owns an acceptance gate:

1. record `latestStartedRunId` when starting A or B;
2. receive an immutable outcome;
3. ignore it if its run ID is not the latest started ID;
4. for `completed`, validate the Script/Session identity pair;
5. atomically replace the bootstrap Script, Session, and presentation.

This follows Sprint 14’s operation-ID and fingerprint-precondition philosophy
without coupling initial-run outcomes to follow-up Session commands. A stale
result is an ignored application result, not a domain failure and not a Session
mutation.

## Error taxonomy

| Condition | Classification | Boundary behavior |
| --- | --- | --- |
| Question validation failure | expected application outcome | compiler error -> sanitized `failed` with validation category; no later stage |
| Contract clarification | expected domain outcome | `clarification-required` |
| Unsupported/policy Contract | expected domain outcome | `policy-rejected` |
| Retrieval unavailable | recoverable technical failure | `failed/retrieval-unavailable`; retry policy belongs outside domain |
| Zero usable evidence / blocking gaps | expected domain outcome | `insufficient-evidence` |
| Evidence integrity/lineage failure | invariant violation | `failed/evidence-integrity`; never generate |
| Generation disabled/unconfigured | expected operational outcome | `generation-unavailable` |
| Provider refusal | expected provider/policy outcome | policy refusal -> `policy-rejected`; availability refusal -> `generation-unavailable` |
| Invalid proposal / repair exhausted | recoverable technical failure | `failed/invalid-generation`; bounded retries remain coordinator-owned |
| Plan validation failure | invariant violation after repair boundary | `failed/plan-invalid` |
| Script compilation/validation failure | invariant violation | `failed/script-invalid` |
| Session initialization mismatch | invariant violation | `failed/session-invalid`; reject Script/Session pair atomically |
| Cancellation | expected application outcome | `cancelled` |
| Stale result | expected controller decision | ignore and minimally audit; no Session mutation |
| Unexpected exception | technical failure | catch at run-service boundary; sanitized `failed/unexpected` |

Existing services retain their own catches and structured results. The run
service translates them once; it must not catch and reinterpret invariant
failures as evidence insufficiency.

## Deterministic fixture end-to-end design

Sprint 15.3 should assemble, not fake, the pipeline:

```text
CreateBriefingRequest
  -> BriefingRunService
  -> BriefingContractCompiler
  -> EvidenceContextBuilder(existing fixture/local EvidenceCandidateProvider)
  -> StructuredExplanationPlanCoordinator(DeterministicFakeStructuredProvider)
  -> RuleBasedBriefingScriptCompiler
  -> initial Session factory using existing schema/fingerprint
  -> completed
```

The local assembly may adapt existing fixtures into candidate/provider inputs,
but must not create alternate intent, retrieval, plan, proposal-validation,
Script, or Session implementations. Identical semantic request, evidence, and
fixture provider yield identical downstream semantic fingerprints; run IDs and
timestamps may differ.

## Web bootstrap migration

Target flow:

```text
Web bootstrap controller
  -> LocalBriefingRuntimeAdapter
  -> BriefingRunService.execute
  -> completed { script, session, receipt }
  -> adaptBriefingScript
  -> atomically initialize existing follow-up controller/player/presentation
```

`LocalBriefingRuntimeAdapter` is a thin dependency assembly and Web request
adapter, not another orchestrator. Existing renderer, map, player, follow-up,
replacement, and AnalysisPanel behavior remains unchanged. The smallest Web
state is the current result envelope (`idle | running | ready | clarification |
unavailable | failed`), only where existing state cannot express pre-Session
bootstrap. It must not duplicate `BriefingSession.status` after readiness.
There is no live network call, large loading/error UI, automatic scene advance,
or visual redesign.

## Integration test plan

| Scenario | Layer | Required assertion |
| --- | --- | --- |
| Happy path | application integration | existing stages called in order; validated Script and matching Session returned |
| Deterministic replay | application integration | run IDs differ; Contract/Context/Plan/Script fingerprints match |
| Insufficient evidence | application integration | structured outcome; no generation, Script, or Session |
| Generation unavailable | application integration | distinct from internal failure; no Script/Session |
| Invalid proposal and repair exhaustion | generation unit + application integration | bounded existing repair; no Session |
| Invalid evidence ID | generation unit + application integration | allowlist rejection; no compile/Session |
| Cancellation | run-service unit + application integration | checks between stages; late result discarded; no Session |
| Stale run A after B | Web integration | A cannot replace B; no Session mutation from A |
| Script/Session mismatch | run-service unit + Web integration | atomic acceptance rejected |
| Web bootstrap | Web integration | completed runtime result initializes existing presentation/player/session without behavior regression |

Tests must use existing fakes and fixtures where possible and may not weaken
current assertions.

## Architecture boundaries

New Core/Application runtime modules must not import `react`, `maplibre`, DOM
globals, `window`, `document`, `localStorage`, CSS, concrete `fetch`/
`XMLHttpRequest`, a concrete OpenAI client, or animation/timer APIs. Existing
generation retry uses an injected sleeper whose default uses `setTimeout`; the
run service must not add a second timer. Existing repository-backed context and
SQLite persistence remain legal behind current ports, but the run service
cannot import their concrete implementations or execute SQL.

Boundary verification should inspect new imports and dependency direction, not
introduce indiscriminate repository-wide grep failures against accepted legacy
adapter code.

## Sub-sprint plan

### Sprint 15.1 — Run contracts and thin orchestrator

- **Goal:** define request, compact stage/outcome contracts, dependencies, and
  sequential orchestration through Contract and Context with typed translation.
- **Likely new area/files:** `src/application/briefing-run/` contracts,
  service, index, focused unit tests.
- **Likely modifications:** root exports/TypeScript aliases only if required.
- **Tests:** request/outcome validation, Contract translations, Context
  translations, stage stop behavior, dependency call order.
- **Acceptance:** no duplicated stage rules; no Web/provider concrete imports;
  strict types and runtime validation.
- **Prohibited:** Web changes, live adapters, persistence, new domain logic.
- **Dependencies:** all Sprint 08–12 public APIs; this design approval.

The first minimum unit is the runtime contract module plus strict runtime
schemas and a service skeleton that completes only Contract result translation.
Then add Context sequencing without crossing into Sprint 15.2 concerns.

### Sprint 15.2 — Receipt, cancellation, and acceptance identities

- **Goal:** add privacy-minimized receipt, clock/ID injection, cooperative
  cancellation, failure categorization, and framework-neutral stale acceptance
  contracts.
- **Likely new files:** receipt, cancellation, failure taxonomy, acceptance
  identity helpers and focused tests in the same application area.
- **Likely modifications:** run service and public exports.
- **Tests:** every terminal receipt, cancellation between stages/late provider,
  runtime-versus-semantic identity, stale identity and mismatch rejection.
- **Acceptance:** cancelled/stale runs create no Session; receipt has no raw
  prompt/question/evidence; fingerprints remain stable.
- **Prohibited:** browser `AbortController` in core, timers, React state, raw
  provider logging.
- **Dependencies:** Sprint 15.1 and existing generation cancellation boundary.

### Sprint 15.3 — Deterministic fixture E2E and Web bootstrap

- **Goal:** complete the existing fixture stages through Script and initial
  Session, then replace only the Web bootstrap source.
- **Likely new files:** local runtime assembly, initial Session factory,
  application and Web integration tests; a minimal Web bootstrap adapter.
- **Likely modifications:** run service, Web composition/controller, exports.
- **Tests:** all scenarios in the integration plan plus current Sprint 14 and
  renderer regression suites and browser acceptance.
- **Acceptance:** completed fixture pipeline, live network zero, identical
  visible baseline, atomic identities, follow-up/map/player unchanged.
- **Prohibited:** live GPT/search/backend, UI redesign, true append, new
  renderer behavior.
- **Dependencies:** Sprint 15.1–15.2 and accepted fixture data that can satisfy
  existing Context and generation contracts.

No Sprint 15.4 is currently justified. Split 15.3 only if fixture adaptation
reveals an actual contract incompatibility; report it rather than creating an
alternate domain pipeline.

## Resolved decisions, risks, and open questions

- **DECIDED:** Sprint 15.1 adds no reading-level field. Existing presentation
  preference is the only reusable presentation input; future reading-level
  semantics require a separate BriefingContract/AnswerPolicy decision.
- **DECIDED:** run ID, runtime Session ID, timestamps, duration, and retry
  attempts are runtime identity and do not enter semantic fingerprints.
  Sprint 15.1 may use only an explicit injectable Session initializer/factory
  dependency with fixed test metadata. A formal clock/ID port belongs to
  Sprint 15.2; application/domain code must not directly call `Date.now()`,
  `Math.random()`, or `crypto.randomUUID()`.
- The absence of a general initial Session factory is an implementation gap,
  not an unresolved identity policy. Sprint 15.1 may add the smallest generic
  initializer compatible with the existing Session schema/fingerprint.
- The context provider is synchronous while generation is asynchronous; the
  orchestration contract can be async without changing the existing provider.
- Existing generation types expose `AbortSignal`. New runtime contracts should
  remain framework-neutral while adapting to that accepted compatibility edge.
- Provider refusal reason mapping must use typed reason/category data where
  available, not string guessing. If current types cannot distinguish policy
  refusal from availability, preserve an explicit open mapping until 15.2.
- Web currently creates Session inside the follow-up hook. Moving bootstrap
  ownership risks double initialization unless the hook accepts an initial
  atomic Script/Session pair.
- Generation audit and runtime receipt overlap operationally but have distinct
  scopes; linking by request/run identity must not merge their schemas.

## Technical debt preserved

- fixture-only initial and follow-up runtime;
- actual GPT/search/backend disconnected;
- no true append fixture and no browser failure fixture;
- no durable Session/runtime receipt persistence or retention policy;
- production DNS-rebinding and broader ingestion hardening remain future work;
- accepted MapLibre bundle-size warning;
- dark vector map and 3D globe deferred to renderer work;
- AnswerPolicy remains a future Sprint 20 concern.

## Out of scope

OpenAI calls, API-key handling, live search (Google/Bing/news), live HTTP
ingestion, backend server, auth/OAuth, Session persistence, subscriptions or
billing, dark vector maps, 3D globe, UI redesign, Strategic Foresight Engine,
completed AnswerPolicy, and true append are explicitly excluded.

## Design quality check

- Existing Contract, Context, generation, validation, Script, Session, and
  follow-up rules are reused, not duplicated.
- The run service sequences and translates only; stage owners remain separate.
- Runtime and semantic identity remain separate.
- Expected outcomes, recoverable technical failures, and invariants remain
  distinct.
- Pre-Session Web bootstrap state ends at atomic Session acceptance and does
  not duplicate Session state.
- Concrete OpenAI/search adapters cannot enter the orchestrator or Web.
- Cancellation is application-level despite the existing generation
  `AbortSignal` compatibility edge.
- Stale handling follows Sprint 14 identity/precondition principles.
- Receipts contain no raw prompt, response, evidence, or private context.
- Fixture and future live assemblies use the same existing ports and pipeline.
- Sprint 15 does not claim Sprint 16–20 responsibilities.

## Acceptance criteria

- Current public APIs and Web bootstrap are documented from source.
- Request, stage, outcome, receipt, identity, cancellation, stale, error, port,
  fixture, Web, and test boundaries are explicit.
- Open questions remain open rather than being guessed into contracts.
- Sprint 15.1–15.3 have bounded scope and dependencies.
- Production source, tests, package metadata, dependencies, and migrations are
  unchanged.
- No commit, push, or tag is performed for Sprint 15.0.
