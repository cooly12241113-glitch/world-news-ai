# Sprint 16.0 — Personalized Impact Analysis Design & Compatibility Audit

## Status

**DESIGN COMPLETE**

Sprint 16.0 is a documentation-only compatibility audit and implementation
contract. It changes no production source, tests, package metadata,
dependencies, database migrations, fixtures, or provider connections. Sprint
16.1 implementation has not started.

## Goal and roadmap requirement

Sprint 16 adds consented, caller-scoped exposure and scenario analysis. Given
validated evidence and only context explicitly supplied for the current
request, the system may explain how an event could affect those exposures.
It must not infer a hidden profile, persist a user profile, infer sensitive
attributes, recommend trades, optimize a portfolio, or execute an action.

```text
Evidence + Explicit User Context + Exposure Mapping + Scenario Analysis
  = Personalized Impact Analysis
```

Personalization is an analysis scope, not permission to create unsupported
facts. With personalization disabled or no consented exposure available, the
pipeline follows the ordinary briefing path and makes no personal claim.

## Motivation

The current system can recognize a personalized-impact question and carry a
small `UserProvidedContext`, but it cannot yet represent the key distinction
between an evidence-backed external fact, a caller-supplied exposure, and the
inference that connects them. It also lacks request-purpose consent, typed
exposure identity, impact-relation posture, and an explicit scenario contract.

The required output is explanatory. Examples include the possible KRW value
effect of a USD/KRW move on an explicitly declared USD exposure, or the
possible input-cost path from a policy change to an explicitly declared
semiconductor-import business exposure. “Buy”, “sell”, allocation,
optimization, and order language remain outside the product boundary.

## Documents and source audited

The audit covered the roadmap, `CURRENT.md`, Sprint 08–15 delivery documents,
the architecture baseline, end-to-end flow, ADR-008 through ADR-013, and the
question, evidence-context, ExplanationPlan, BriefingScript, Session,
follow-up/replan, structured-generation, runtime-orchestration, and receipt
contracts.

| Boundary | Existing source | Compatibility finding |
| --- | --- | --- |
| Question and intent | `src/briefing/models.ts`, `analyzer.ts`, `compiler.ts`, `validation.ts` | Already has `personalized-impact`, `UserProvidedContext`, `personalizationRequested`, and `personalizationPolicy`; context is too coarse for Sprint 16 consent and exposure lineage. |
| Runtime request | `src/application/briefing-run/types.ts`, `schemas.ts` | `CreateBriefingRequest` is strict and request-scoped; it is the correct outer lifetime boundary, but currently contains only question and presentation preference. |
| Evidence | `src/context/models.ts`, `builder.ts`, `validation.ts` | `EvidenceContextPackage` has closed evidence/provenance references and a semantic fingerprint. It must remain external-world evidence, not absorb personal context. |
| Explanation | `src/explanation/models.ts`, `assembler.ts`, `validator.ts`, `fingerprint.ts` | Already supports `personalize-impact`, `trace-impact-channel`, `impact-link`, scenarios, counter-factors, inference, forecast, unknown, false-precision and trade-command prohibitions. Exposure/channel bindings are missing. |
| Script | `src/script/models.ts`, `compiler.ts`, `validator.ts`, `fingerprint.ts` | Existing impact-path, scenario, counter-factor, uncertainty, narration, citation, and renderer-neutral bindings are reusable. Personal-impact references are missing. |
| Session/follow-up | `src/session/*`, `src/follow-up/*`, `src/replan/*` | Immutable captured context, allowlists, semantic preconditions, replacement validation, rollback, and `rebuild-entire-briefing` already exist. Personal-context identity is not captured. |
| Runtime/receipt | `src/application/briefing-run/briefing-run-service.ts`, `types.ts`, `schemas.ts` | The service is intentionally thin and receipts contain lineage/counts only. A future impact stage must be injected and receipts must never contain raw context. |

## Existing API decisions

1. Do not add a ninth question intent. Reuse `personalized-impact` when it is
   the primary answer goal. A general impact question remains
   `impact-analysis`; explicit personal scope is a modifier that activates the
   existing `personalizationPolicy`.
2. Do not add `UserProfile`, a global user-context service, or persistence.
3. Keep `UserProvidedContext` as a legacy compatibility input during a bounded
   migration. New Sprint 16 behavior uses a typed request-level contract; it
   must not silently treat a legacy holdings string as consent.
4. Reuse the existing `EpistemicType`. Impact relation and epistemic posture
   are orthogonal: for example, `inference` plus `conditional-impact`.
5. Reuse ExplanationPlan and Script validators as stage authorities. Add a
   focused personal-impact validator and compose it; do not copy evidence,
   forecast, or lineage rules.

## Explicit context and consent model

The Sprint 16.1 target is request-scoped and closed rather than an arbitrary
key/value bag. Names may be aligned during implementation; semantics are fixed.

```ts
interface PersonalImpactRequest {
  enabled: boolean;
  purpose: "personal-impact-analysis";
  consent: PersonalImpactConsent;
  context?: PersonalImpactContext;
}

interface PersonalImpactConsent {
  granted: boolean;
  scope: "this-briefing";
  revocable: true;
}

interface PersonalImpactContext {
  contextVersion: "1";
  exposures: UserExposure[];
  scenarioAssumptions: ImpactScenarioAssumption[];
}
```

`PersonalImpactRequest` becomes an optional field on strict
`CreateBriefingRequest`. The question remains the semantic question; the outer
request owns consent and lifetime. Contract compilation receives only a
normalized summary needed for `personalizationPolicy`; full context proceeds
through a separate impact boundary and is never copied into
`EvidenceContextPackage`.

Activation requires `enabled`, granted `this-briefing` consent, exact purpose,
at least one valid non-sensitive exposure, and a Contract that permits exposure
or scenario analysis. Otherwise the safe result is ordinary analysis. The
system must not label an answer personal, guess an exposure, or block a general
briefing because personal context is absent. `enabled: false` always wins over
populated context.

Consent is explicit, purpose-bound, minimal, and valid for one run. It grants
no account, storage, retrieval, or trading permission. Before dispatch,
removing/disabling the request revokes it. During a run, the caller uses the
existing cooperative cancellation boundary and starts a non-personal run.
There is no separate deletion workflow because there is no profile persistence.

## Caller scope and lifetime

Personal context flows only through immutable `CreateBriefingRequest` and its
`BriefingRun`. A follow-up may capture normalized reference IDs and semantic
fingerprints, never raw holdings or amounts. Context must not enter a global
singleton, module static, browser storage, hidden cache, analytics event,
Session repository, or profile table.

The initial implementation remains offline and in-memory. A validated result
may retain exposure IDs and safe labels needed for explanation, but not a full
holdings list, salary, street address, account ID, or unnecessary source input.

## Exposure model

```ts
type ExposureDimension =
  | "geography"
  | "currency"
  | "industry"
  | "asset-class"
  | "employment-business"
  | "consumption"
  | "supply-chain";

interface UserExposure {
  exposureId: string;
  dimension: ExposureDimension;
  relation:
    | "resident-in" | "holds" | "works-in" | "operates-in"
    | "imports" | "exports" | "spends-on" | "depends-on";
  subject: string;
  suppliedBy: "caller";
}
```

`subject` is a value in a closed schema, not a dynamic key. Validators use NFC,
trim/collapse whitespace, length/count limits, semantic duplicate detection,
and reject sensitive/unsupported fields. Exact salary, full address, account
identifier, trade size, allocation, and arbitrary metadata are not accepted.
`qualitativeMagnitude` is not part of Sprint 16.1. Exposure is caller input;
impact magnitude is a derived Sprint 16.2 concern and must not be smuggled into
the input contract as `low`, `medium`, or `high` impact.

## Evidence and user-context separation

| Layer | Example | Required posture/provenance |
| --- | --- | --- |
| External fact | Oil prices increased. | Existing evidence binding and `confirmed-fact` or `attributed-claim`. |
| User exposure | Caller states fuel spending is high. | `exposureId`, `suppliedBy: caller`; never an evidence ID. |
| Impact inference | Continued price pressure could increase that expense. | `inference`, impact relation, evidence refs, exposure ref, mechanism, uncertainty, condition. |
| Forecast | If prices rise further over three months, burden could increase. | `forecast`, premise/horizon, assumptions, counter-signals, unknowns. |

An exposure cannot prove an external fact, and evidence cannot prove a private
exposure. Each channel has both evidence and exposure references; neither may
substitute for the other.

## Impact channel, posture, and result

```ts
type ImpactRelation =
  | "direct-impact" | "indirect-impact" | "conditional-impact"
  | "countervailing-impact" | "unknown-impact";

type ImpactDirection = "increase" | "decrease" | "mixed" | "unchanged" | "unknown";

interface ImpactChannel {
  channelId: string;
  evidenceRefs: string[];
  exposureId: string;
  macroVariable: string;
  transmissionMechanism: string;
  direction: ImpactDirection;
  relation: ImpactRelation;
  epistemicType: EpistemicType;
  uncertainty: {
    level: "low" | "medium" | "high" | "unknown";
    reasons: string[];
    unknowns: string[];
  };
  scenarioConditionIds: string[];
  countervailingFactors: string[];
}

interface PersonalizedImpactAnalysis {
  analysisId: string;
  contractFingerprint: string;
  evidenceContextFingerprint: string;
  personalContextFingerprint: string;
  channels: ImpactChannel[];
  scenarios: ImpactScenario[];
  unknowns: string[];
  warnings: string[];
  policyVersion: string;
  semanticFingerprint: string;
}
```

Each channel needs evidence, exposure, direction, mechanism, uncertainty, and
an explicit condition for a conditional relation or forecast. Impact relation
does not replace epistemic posture: a direct path may still be an `inference`;
a conditional result is not automatically a `forecast`; `unknown-impact`
remains `unknown` without new evidence and rebuild.

## Scenario model

```ts
type ImpactScenarioKind = "base" | "upside" | "downside" | "counter";

interface ImpactScenarioAssumption {
  assumptionId: string;
  premise: string;
  horizon: string;
}

interface ImpactScenario {
  scenarioId: string;
  kind: ImpactScenarioKind;
  premise: string;
  horizon: string;
  triggers: string[];
  counterSignals: string[];
  affectedExposureIds: string[];
  expectedDirection: ImpactDirection;
  uncertainty: "low" | "medium" | "high" | "unknown";
  conditionIds: string[];
}
```

Horizon, at least one trigger, and one counter-signal are mandatory. Scenarios
are conditional branches, not facts. Numeric probability is forbidden unless
a future approved quantitative source and calibrated method supplies it;
invented “70% likely” values are validation errors.

## Importance and ranking

Personalization does not authorize “your top risk”. Ranking is disabled by
default. It may be enabled only by explicit question/Contract intent and
visible criteria such as caller-supplied qualitative magnitude, causal
proximity, evidence strength, and uncertainty. No ranking may be inferred from
holdings order, private wealth guesses, or model confidence alone. Sprint 16.1
uses a small optional policy modifier, not a new intent or universal score;
Sprint 16.2 returns stable unranked order when absent.

## BriefingContract integration

The existing eight intents remain. Current `personalizationPolicy` is the
compatibility bridge: `enabled` reflects the complete activation rule;
`targetType` remains a coarse hint; allowed fields become closed dimensions;
`recommendationMode` remains information/exposure/scenario analysis; privacy
warnings prohibit inference.

“How does this affect Korea’s economy?” is general `impact-analysis`. “How does
this affect my declared USD exposure?” is `personalized-impact` with an active
request. Personal wording without consent/exposure falls back to a general
answer instead of manufacturing context.

## Pipeline and application boundary

```text
CreateBriefingRequest
  -> BriefingContractCompiler
  -> EvidenceContextBuilder
  -> PersonalImpactAnalyzer (only when activated)
  -> existing ExplanationPlan generation/validation
  -> existing BriefingScript compilation/validation
  -> existing BriefingSession initialization
```

`PersonalImpactAnalyzer` is an injected port with a deterministic offline
implementation. `BriefingRunService` may invoke it as one stage but must not
implement mapping, scenario, or validation rules. When personalization is off,
the stage is skipped and existing semantics/fingerprints remain unchanged.
The analyzer references the built evidence package and performs no retrieval
or LLM call. No applicable exposure and insufficient support are structured
normal outcomes.

## ExplanationPlan integration

Reuse `personalize-impact`, `trace-impact-channel`, `define-scenario`,
`identify-counter-factor`, `expose-uncertainty`, `impact-link`, existing
`EpistemicType`, and existing prohibited behaviors. The minimal extension is a
renderer-neutral step binding with `analysisFingerprint`, `channelIds`,
`exposureIds`, and `scenarioIds`. Existing evidence bindings stay unchanged.
No new section kind is initially required.

Plan fingerprint includes the analysis fingerprint and sorted binding refs.
The existing validator stays authoritative for evidence/epistemic policy and
composes the focused validator for exposure/channel/scenario lineage.

## BriefingScript implications

No renderer/UI is implemented in Sprint 16.0–16.3. Existing `impact-path`,
`scenario`, `counter-factor`, and `uncertainty` scene kinds suffice. Add only a
renderer-neutral binding carrying analysis/channel/exposure/scenario refs; do
not add React names, CSS, tabs, or layout-specific widgets to domain contracts.

A renderer may later project evidence baseline, exposure, transmission path,
conditional impact, counter-force/unknowns, and scenario premise/horizon.
Citation cues cite evidence; exposure labels are attributed to the caller and
are not citations.

## Follow-up implications

Captured follow-up context adds only personalization-used boolean,
personal-context fingerprint, impact-analysis fingerprint, and a closed
exposure/channel/scenario allowlist. Raw context is excluded.

Exposure or scenario-assumption changes alter semantic identity and require
`rebuild-entire-briefing`; presentation-only requests may revise the scene;
allowlisted questions may use current context.

| Follow-up | Required scope |
| --- | --- |
| “What if the exchange rate reverses?” | Current context only if an existing counter scenario covers it; otherwise rebuild. |
| “Show the opposite scenario.” | Revise only if already bound; otherwise rebuild. |
| “Assume I do not hold USD.” | Full rebuild; context fingerprint changes. |
| “Explain without my personal information.” | Full rebuild with personalization disabled. |

Existing operation tokens, Session/Script/context preconditions, stale-result
isolation, atomic replacement, mapping, and rollback remain. The classifier
needs an explicit personal-context-change rule before Web integration.

## Fingerprint and identity

`PersonalImpactContext` fingerprint includes purpose/policy, NFC and whitespace
normalized exposure fields sorted by semantic tuple, and normalized assumptions
in stable order. It excludes consent timestamp, run/correlation ID, UI state,
random IDs, arrival time, and audit metadata. Disabled requests produce no
personal-context fingerprint.

Analysis fingerprint includes Contract, evidence-context, personal-context
fingerprints, normalized channel/scenario semantics, unknowns, and policy.
Random analysis/channel/scenario IDs are excluded; refs are sorted/deduplicated.
Same inputs produce the same fingerprint; adding/removing USD exposure changes
the result fingerprint.

## Privacy model

Receipts/logs/Session and replan audit may contain only:

```ts
{
  personalizationUsed: boolean;
  exposureCount?: number;
  personalContextFingerprint?: string;
  impactAnalysisFingerprint?: string;
}
```

They exclude raw context, holdings lists, salary, spending, address, private
profile, and caller scenario prose. A fingerprint is not permission to persist
its preimage.

## Validation

A pure `PersonalizedImpactValidator` receives request/context, Contract,
EvidenceContextPackage, and candidate analysis. It rejects:

- activation without request-level consent and purpose;
- hidden, inferred, unsupported, sensitive, or non-allowlisted exposures;
- facts without evidence or impact claims without exposure references;
- evidence used as exposure provenance or exposure used as evidence;
- unsupported causal jumps and fact promotion;
- conditional impact without condition and uncertainty;
- scenario without premise, horizon, trigger, counter-signal, exposure,
  direction, and uncertainty;
- forecast without assumptions/conditions and material unknowns;
- invented probability precision;
- buy/sell, allocation, leverage, order, optimization language;
- ranking without Contract intent and declared criteria; and
- broken fingerprints, references, or duplicate semantic IDs.

When disabled, validators prove no personal binding/claim appears. Missing
exposure yields general analysis or a structured no-applicable-exposure result.

## Investment and sensitive-attribute boundaries

Allowed output explains a conditional mechanism, direction, counter-force,
uncertainty, and scenario. Forbidden output includes buying semiconductor
stocks, selling 30%, selecting leverage, setting a 65% allocation, rebalancing,
optimizing, or ordering. Contract mode and validators both enforce this.

The schema contains no health, race/ethnicity, religion, political affiliation,
sexual orientation, criminal history, or other sensitive fields. Free text is
not mined for them. Only schema-valid caller exposures are used.

## Deterministic fixture plan

Sprint 16.3 adds one synthetic, non-user fixture: Korea residency, USD
currency/asset exposure, and semiconductor industry/supply-chain exposure. It
combines with existing deterministic evidence and fixed adapters. It contains
no sensitive data, precise holdings, account ID, salary, or address and proves
Contract → Evidence → Impact → Plan → Script → Session without network,
OpenAI, search, persistence, or browser storage.

## Test plan (later implementation sprints)

No tests are added in 16.0.

| Case | Expected behavior |
| --- | --- |
| Personalization disabled | Existing general semantic path remains unchanged. |
| Explicit exposure | Result references exact caller exposure ID. |
| Missing exposure | No personal claim; safe general/structured fallback. |
| Sensitive inference | Rejected/ignored before analysis; never stored. |
| Scenario | Premise, horizon, trigger, counter-signal, exposure, direction, uncertainty present. |
| Action recommendation | Validator rejects buy/sell/allocation language. |
| Determinism | Same inputs yield same impact fingerprint. |
| Context change | Adding/removing USD exposure changes result/fingerprint. |
| Follow-up | “Assume I do not hold USD” selects full rebuild. |
| Privacy | Receipts/log/audit contain no raw context. |
| Provenance separation | Evidence/exposure references cannot be interchanged. |
| False precision | Unsupported probability is rejected. |

Existing Contract, Context, Plan, Script, Session, replan, runtime, and
integration suites remain regression gates.

## Architecture boundaries

Sprint 16 core/application code must not depend directly on React, DOM,
MapLibre, browser storage, OpenAI/search concrete clients, SQLite adapters,
analytics, authentication, user memory, or hidden profile storage. No profile
DB/migration is introduced. Domain owns typed semantics/fingerprints/validation;
application composes ports; renderers only project validated semantics.

## Sub-sprint plan

### Sprint 16.1 — Explicit Context and Exposure Contracts

- Add request consent/purpose/context/exposure, normalization, validation, and
  fingerprint contracts.
- Evolve `CreateBriefingRequest` and Contract compatibility bridge.
- Preserve disabled path and legacy behavior without upgrading it to consent.
- Add unit tests; no engine, UI, provider, persistence, or migration.
- Status after this design approval: **READY FOR IMPLEMENTATION**.

### Sprint 16.2 — Impact Channel and Scenario Engine

- Add channel, scenario, result, deterministic mapping, fingerprint, validator.
- Compose existing evidence/epistemic/forecast prohibitions.
- Implement deterministic offline engine and tests only.

### Sprint 16.3 — Pipeline and Deterministic Fixture Integration

- Inject optional stage into thin runtime service.
- Extend Plan/Script bindings, validators, fingerprints, Session lineage, and
  privacy-safe receipt metadata.
- Add synthetic fixture and offline integration tests; no Web UI.

### Sprint 16.4 — Web Presentation and Follow-up Integration

16.4 is required rather than merged into 16.3. The Web player and classifier
do not know impact refs/context-change semantics. Add renderer projection, safe
caller attribution, privacy review, context-change rebuild rule, atomic
replacement, and browser acceptance. Do not add account/profile persistence.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Hidden profiling | Explicit activation/allowlists; missing values fall back to general analysis. |
| Context treated as evidence | Separate models, IDs, provenance, bindings, errors. |
| Unsupported certainty | Existing epistemic policy plus mechanism, uncertainty, condition, evidence. |
| Advice drift | Closed modes and prohibitions at result/Plan/Script boundaries. |
| Runtime god object | Inject one analyzer; domain rules stay outside orchestration. |
| Validator duplication | Compose focused checks into existing stage validators. |
| Fingerprint leak/instability | Hash canonical minimal semantics; exclude raw/operational data. |
| Stale follow-up exposure | Capture fingerprints/allowlists; rebuild on changes. |
| Future provider bypass | Provider remains untrusted; validation stays authoritative. |

## Technical debt

- Legacy `UserProvidedContext` string arrays need a compatibility/deprecation
  policy.
- Existing personalization coverage does not establish exposure provenance.
- Text intent analysis cannot prove consent or safely extract exposures.
- Follow-up classifier lacks a personal-context-change rule.
- Session/runtime lineage lacks personal-context/impact fingerprints.
- Receipt evolution needs a privacy regression test.

## Out of scope

- live OpenAI/GPT, search, or news retrieval;
- accounts, profile/backend persistence, browser storage, auth, OAuth, billing,
  telemetry, or analytics;
- optimization, recommendations, buy/sell, allocation, leverage, orders;
- sensitive inference/schema, arbitrary profiles, user memory;
- migrations, dependencies, Web UI in 16.0–16.3;
- dark map, 3D globe, Strategic Foresight Engine, complete AnswerPolicy.

## Self-audit

1. No hidden/persistent profile is introduced.
2. Context remains separate from evidence.
3. Impact relation does not replace epistemic posture.
4. Unsupplied/sensitive exposures cannot enter the allowlist.
5. Trade/optimization output is rejectable.
6. Importance is opt-in and criteria-bound.
7. Scenarios require conditions/horizon and cannot invent probability.
8. Runtime only coordinates an injected stage.
9. Existing validators are composed, not cloned.
10. Future live providers cannot bypass consent/provenance/privacy validation.

## Acceptance criteria

Sprint 16.0 is complete when the API audit; explicit context, consent, caller
scope, exposure, channel, scenario, identity, privacy and validation contracts;
Contract/Plan/Script/Session/follow-up/runtime/receipt implications; fixture and
test plans; and 16.1–16.4 scopes are documented. Production source, tests,
packages, dependencies, and migrations remain unchanged; `git diff --check`
passes; no commit, push, or tag is made.

## Final decisions for Sprint 16.1

1. Legacy `UserProvidedContext` is not removed or immediately marked
   deprecated. The typed explicit-context model is added in parallel. A thin
   compatibility adapter is permitted only where mapping is lossless and does
   not infer exposure or consent. Deprecation/removal is reconsidered no
   earlier than the Sprint 16.3 compatibility audit.
2. `qualitativeMagnitude` is excluded from Sprint 16.1. UserExposure describes
   explicit exposure only; impact magnitude belongs to Sprint 16.2 result
   modeling.
3. Raw personal context is forbidden in Session. Sprint 16.1 establishes
   `personalContextFingerprint` as the minimum semantic identity available to
   later run/Session lineage. `impactAnalysisFingerprint` is deferred until an
   impact analysis exists in Sprint 16.2 or later. If run lineage is sufficient
   for 16.1 transport, Session schema evolution is deferred to Sprint 16.3.

Sprint 16.0 is final and Sprint 16.1 is ready for implementation under these
decisions.
