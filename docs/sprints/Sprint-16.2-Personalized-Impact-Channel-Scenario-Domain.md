# Sprint 16.2 — Personalized Impact Channel & Scenario Domain

## Status

**IMPLEMENTED / REVIEWED / COMPLETE**

Sprint 16.2 implements the standalone personalized-impact result domain and a
deterministic analysis boundary. It does not connect the new domain to
`BriefingRunService`, ExplanationPlan, BriefingScript, Session, receipt,
follow-up, or Web UI.

## Goal

Transform an already validated, explicitly consented personal context plus a
ready BriefingContract and EvidenceContextPackage into a validated,
deterministic `PersonalizedImpactAnalysis`:

```text
Evidence + Explicit User Exposure
  -> Impact Channel
  -> Impact Assessment
  -> Scenario / Counter-signal / Unknown
```

This is explanatory analysis. It is not a recommendation, probability engine,
ranking engine, profile store, or runtime integration.

## Baseline and inputs

- Sprint 16.2 baseline: `5010d0b`
- Required input: validated `PersonalImpactContext`
- Required input: ready `BriefingContract` with enabled personalization policy
- Required input: validated `EvidenceContextPackage`
- Mapping: injected deterministic `ImpactMappingPolicy`
- Output: structured result union containing a validated aggregate or a normal
  unavailable/unsupported outcome

The mapping policy is an injected domain port. The analyzer validates inputs,
applies early stop policy, invokes the mapping policy, constructs semantic
identity, and validates the result. It contains no fixture-specific mapping,
network call, LLM call, current time, or randomness.

The existing runtime request schema now imports the Sprint 16.1 context schema
from its direct validation module instead of the personalization barrel. This
is a compatibility-only import refinement: it prevents the standalone Sprint
16.2 domain exports from entering the existing Web module graph. It changes no
request behavior and does not connect `BriefingRunService` to impact analysis.

## Dual provenance

Every `ImpactChannel` carries two distinct allowlisted reference arrays:

- `evidenceContextItemIds`: external-world evidence from selected Context items
- `exposureIds`: explicit caller-provided exposures from PersonalImpactContext

The arrays are never merged into a generic reference list. Evidence does not
prove a personal exposure; an exposure does not prove an external fact. The
derived channel requires both. Validators reject unknown IDs from either side.

## ImpactChannel

An ImpactChannel contains:

- deterministic `channelId`;
- non-empty transmission `mechanism`;
- one or more evidence context item IDs;
- one or more exposure IDs;
- independent impact relation and epistemic posture;
- qualitative direction;
- explicit condition IDs when conditional or forecast;
- structured uncertainty.

This blocks the unsupported jump `Evidence + Exposure -> Conclusion` without
a stated mechanism. Mechanism text is bounded and cannot replace the required
reference lineage or conditions.

## Relation and epistemic posture

Impact relation is a separate taxonomy:

- `direct`
- `indirect`
- `conditional`
- `countervailing`
- `unknown`

The existing `EpistemicType` is reused and narrowed to `inference`, `forecast`,
or `unknown` for derived impact output. These dimensions are orthogonal. For
example, a channel may have relation `conditional` and epistemic type
`inference`. Unknown relation requires `unknown` posture and `uncertain`
direction. Impact output cannot be promoted to a confirmed fact.

## Direction and magnitude decision

Direction is qualitative only:

- `increases`
- `decreases`
- `mixed`
- `unchanged`
- `uncertain`

There is no numeric score.

Qualitative magnitude is deferred. The fixture has no calibrated magnitude
basis, so `low`, `moderate`, `high`, and `indeterminate` impact fields are not
introduced. Strict schemas reject `qualitativeMagnitude`. Sprint 16.2 does not
turn exposure presence or model confidence into impact size.

## ImpactAssessment

An assessment groups one or more validated channels for exactly one explicit
exposure. It contains deterministic identity, channel IDs, direction,
epistemic posture, conditions, uncertainty, and supporting context item IDs.
An assessment without a channel or supporting evidence is invalid.

Countervailing channels may be included in an assessment. There are no action,
recommendation, allocation, target-weight, hedge, trade, buy, or sell fields.

## Conditions and uncertainty

Conditions are deterministic, referenced domain objects with one of four
kinds:

- `premise`
- `trigger`
- `counter-signal`
- `limitation`

Uncertainty has a qualitative posture (`bounded`, `material`, or
`indeterminate`), an explicit statement, and bounded unknowns. Conditional and
forecast channels require conditions. Missing condition IDs are rejected.

## Scenario model

Scenario naming is neutral rather than automatically favorable/adverse:

- `baseline`
- `intensification`
- `easing`
- `counter-scenario`

Every scenario requires:

- a premise condition;
- structured positive horizon (`amount` plus day/week/month/year);
- at least one trigger condition;
- at least one counter-signal condition;
- affected exposure IDs;
- channel IDs;
- expected direction; and
- uncertainty.

Vague horizons and missing horizons are invalid. There is no probability field;
strict schemas reject fields such as `probability: 0.72`. Scenarios are
conditional branches, not calibrated likelihood forecasts.

## Unknown and unsupported impact

If evidence and exposure exist but only an unresolved transmission path can be
represented, a channel may use relation `unknown`, posture `unknown`, uncertain
direction, and indeterminate uncertainty. If the deterministic mapping policy
cannot support a channel at all, the analyzer returns
`unsupported-impact-path` instead of inventing a conclusion.

An insufficient/no-relevant EvidenceContextPackage returns
`insufficient-evidence`. These are normal structured outcomes, not exceptions.

## Consent and empty-context behavior

- disabled consent: `insufficient-context / personalization-disabled`
- enabled consent with zero exposures:
  `insufficient-context / no-exposures`
- insufficient evidence: `insufficient-evidence`
- no supported mapping: `unsupported-impact-path`
- valid proposal: `completed`
- invalid input/proposal/policy output: `policy-rejected`

No personalized aggregate is generated for disabled or
`enabled-no-exposures` contexts, and there is no automatic conversion to a
generic world-impact result.

## No inferred exposure

Every channel, assessment, and scenario exposure reference must exist in the
exact `PersonalImpactContext.exposures` allowlist. Evidence mentioning Korea
cannot create a Korea exposure when the caller supplied only USD exposure.
Unknown or constructed exposure references are validation errors.

## Recommendation and ranking boundaries

The domain has no recommendation, action, trade, allocation, target weight,
buy, sell, hedge instruction, rank, priority, importance score, probability,
or magnitude fields. Strict objects reject them.

This structural boundary is primary. Sprint 16.2 does not add a general
natural-language investment-safety classifier. Later ExplanationPlan/Script
integration must also apply their existing `direct-buy-sell-command` and
false-precision prohibitions before presentation.

## PersonalizedImpactAnalysis aggregate

The aggregate contains:

- deterministic analysis ID and semantic fingerprint;
- question, Contract, and EvidenceContextPackage IDs;
- Contract fingerprint;
- personal-context fingerprint;
- evidence-context fingerprint;
- conditions, channels, assessments, and scenarios;
- unknowns and limitations; and
- mapping policy version.

It does not copy raw PersonalImpactContext or evidence excerpts. It stores only
semantic lineage and validated result objects.

## Semantic identity

The existing SHA-256 semantic fingerprint utility is reused. Deterministic IDs
are derived for conditions, channels, assessments, scenarios, and the aggregate.
Fingerprints normalize text with NFC/whitespace rules and canonicalize all
set-like references and aggregate arrays.

Identity includes Contract, personal-context, evidence-context, policy,
conditions, channels, assessments, scenarios, unknowns, and limitations. It
excludes run ID, timestamp, UUID, UI state, receipt, and logging metadata.
Changing USD exposure to EUR changes analysis identity; array reordering and
NFC-equivalent text do not.

## Validation

The validator rejects:

- invalid input and non-ready/disabled Contract policy;
- question, Contract, personal-context, or evidence-context lineage mismatch;
- unknown evidence, exposure, condition, or channel references;
- empty evidence/exposure/mechanism/channel requirements;
- semantic duplicates and forged deterministic IDs;
- conditional/forecast channels without conditions;
- invalid unknown-impact posture;
- scenarios without premise, horizon, trigger, counter-signal, exposure, or
  channel lineage;
- forged aggregate fingerprints; and
- all unknown probability, recommendation, ranking, allocation, and magnitude
  fields through strict schemas.

Array and text bounds prevent unbounded domain payloads. The validator composes
the existing Contract, Context, and PersonalImpactContext schemas rather than
reimplementing them.

## Deterministic fixture

The test fixture is fictional and contains:

- explicit geography exposure `KR`;
- explicit currency exposure `USD`;
- explicit industry exposure `semiconductor`;
- a synthetic semiconductor-policy document;
- a synthetic USD/KRW translation document;
- a conditional supply/FX mechanism;
- a countervailing easing channel; and
- a three-month baseline scenario with trigger and counter-signal.

The fixture contains no sensitive data, account ID, amount, target allocation,
probability, or real user profile. It uses the real deterministic Contract and
EvidenceContext builders and a test-only mapping policy.

## Tests and verification

New Sprint 16.2 tests cover valid dual provenance, unknown evidence/exposure/
condition/channel references, ordering and NFC determinism, USD-to-EUR context
change, disabled and empty context, insufficient evidence, valid structured
scenario, missing horizon, probability/recommendation/ranking/magnitude field
rejection, countervailing and unknown channels, duplicate identity, empty
mechanism, empty assessment channel, unsupported mapping, and stale lineage.

- New test file: 1
- New tests: 22
- Final suite: 73 files / 717 tests
- skipped/only/todo: 0
- typecheck: PASS
- Web build: PASS with the existing large-chunk warning
- Web bundle output remains on the pre-Sprint-16.2 runtime path after the direct
  schema import refinement
- full npm audit: existing dev-toolchain moderate 5, fix unavailable
- production audit: 0 vulnerabilities
- package/lock/dependency changes: none
- migration: none; SQLite remains v2

## Integration handoff

Sprint 16.3 may inject `PersonalizedImpactAnalyzer` after EvidenceContextBuilder
and before ExplanationPlan generation. The runtime must skip it when context is
absent/disabled, carry personal/evidence/analysis fingerprints in reached
lineage only, and keep raw context out of receipt and Session. Plan and Script
bindings must reference validated channel/exposure/scenario IDs separately.

Sprint 16.3 must preserve existing cancellation, stale-result, receipt privacy,
and ordinary non-personal briefing behavior. This Sprint does not authorize or
begin that integration.

## Known limitations

- Mapping policy is a port; only a deterministic test fixture exists.
- Contract compilation does not yet consume the Sprint 16.1 typed context.
- ISO country/currency registry membership remains low-priority debt.
- No calibrated probability or magnitude method exists.
- No Plan/Script/runtime/Session/receipt/follow-up/Web binding exists.
- Text safety is bounded structurally, not a universal content classifier.

## Architecture boundaries and out of scope

No React, MapLibre, DOM, browser storage, fetch, OpenAI/search client, backend,
SQLite, analytics, profile service, `Date.now`, `Math.random`, or random UUID is
used. No profile persistence, recommendation, optimization, ranking, live
provider, ExplanationPlan change, BriefingRunService change, Session/receipt
change, follow-up, or Web UI is included.
