# Sprint 16.3 — Personalized Impact Runtime & Briefing Integration

## Status

**IMPLEMENTED / REVIEWED / COMPLETE**

## Goal and baseline

Sprint 16.3 connects the request-scoped Sprint 16.1 context and Sprint 16.2
impact domain to the existing evidence-first Contract-to-Session runtime.

- Baseline: `8bdf219` (`feat: add personalized impact analysis domain`)
- Existing non-personalized semantic behavior remains unchanged.
- No Web personalized UI, live provider, persistence, backend, or new package is
  introduced.

## Activation policy

The application activates impact analysis only when the compiled Contract's
primary intent is `personalized-impact`.

- A normal intent never consumes an attached context implicitly.
- A personalized intent without context returns
  `personalization-context-required`.
- Disabled, enabled-without-exposures, insufficient-evidence, and unsupported
  mappings return `personalized-impact-unavailable` with distinct reasons.
- Policy-invalid analyzer output returns `policy-rejected`.
- No unavailable personalized request is relabeled as a completed generic
  briefing.

The request-to-Contract bridge projects only safe canonical exposure values
into the legacy Contract compiler input when required to establish typed
personalization intent. The original `PersonalImpactContext` remains a separate
application input and is not copied into the Contract.

## Coordinator and runtime stage

`PersonalizedImpactCoordinator` owns eligibility, consent/context-state checks,
analyzer invocation, analyzer-outcome mapping, safe planning projection, and
analysis lineage. It does not retrieve evidence, generate Plans, compile
Scripts, create Sessions, or implement UI behavior.

Personalized runs add `impact-analyzing` between `context-building` and
`plan-generating`. Ordinary runs skip it. Cooperative cancellation is checked
immediately before and after the awaited coordinator call, so late analysis
cannot reach Plan, Script, or Session creation.

The existing stateless `isCurrentBriefingRun` policy remains authoritative.
No service-global latest-run state was added.

## Planning projection and privacy

`PersonalizedImpactPlanningContext` contains only:

- personal-context, analysis, and evidence-context fingerprints;
- safe exposure descriptors (`exposureId`, `dimension`, `canonicalSubject`);
- validated conditions, channels, assessments, and scenarios.

It excludes consent metadata, caller scope, arbitrary notes, raw caller
metadata, and the original `PersonalImpactContext`. Only this projection is
eligible for the structured generation request.

Changing the personal-context semantic fingerprint is a full personalized
impact rebuild condition. A previous analysis is not reusable across that
change.

## ExplanationPlan integration

Plan steps may carry a separate `personalImpactBindings` object with exposure,
channel, assessment, and scenario IDs plus the analysis fingerprint. Evidence
bindings remain unchanged and are never overloaded with exposure IDs.

The Plan carries optional personal-context and analysis fingerprints only on a
personalized path. Its semantic fingerprint includes those lineage values and
the canonical personalized bindings.

Proposal and Plan validation reject:

- unknown or foreign exposure, channel, assessment, or scenario IDs;
- missing or stale impact-analysis lineage;
- scenario bindings without forecast posture and explicit assumptions;
- unknown channels presented with a non-unknown posture;
- exposure IDs used as evidence references;
- raw context and unknown recommendation/probability/ranking fields.

Channel conclusions reuse `inference`, scenarios reuse `forecast`, and unknown
impact reuses `unknown`; no parallel truth taxonomy was added.

## Structured generation

The existing request, allowlist, strict proposal, hydration, semantic
validation, and deterministic provider path are extended only when a validated
planning projection exists. Non-personalized request packages omit every new
field and keep their previous request and Plan fingerprints.

The deterministic fixture follows:

`PersonalizedImpactAnalysis -> structured proposal -> validation -> ExplanationPlan`

It does not return a ready-made Plan or Script.

## BriefingScript integration

Script scenes carry personalized bindings separately from evidence content
bindings. The Script also retains the validated safe planning projection, which
provides renderer-neutral scenario premise, horizon, triggers, counter-signals,
direction, and uncertainty without UI layout or styling instructions.

Channel-bound scenes use `impact-path`; scenario-bound scenes use `scenario`.
Existing citation and uncertainty cues remain present. Script validation rejects
forged bindings, foreign lineage, and evidence-context fingerprint mismatch.

The Script fingerprint includes the optional personalized lineage, projection,
and scene bindings. With no personalization, all optional values are omitted and
the previous fingerprint path is byte-for-byte unchanged.

## Runtime lineage and receipt privacy

Completed personalized lineage adds:

- `personalContextFingerprint`
- `personalizedImpactAnalysisFingerprint`

The analysis fingerprint appears only after analysis completes. Receipt fields
are limited to requested/used booleans, exposure count, and fingerprints. No
exposure subject, consent object, caller scope, or raw context is recorded.

## Session decision

Session schema and semantic identity are unchanged. The Script already owns the
personalized semantic projection and fingerprint, while Session owns the Script
ID and fingerprint. Adding duplicate personal lineage to Session would create a
second source of truth without improving traceability.

## Integration fixture and tests

The fictional KR/USD/semiconductor fixture executes the real application path
through Contract, Evidence Context, Impact, structured proposal, validated Plan,
validated Script, and valid Session.

Coverage includes completed E2E, safe provider projection, distinct missing,
disabled, empty, insufficient-evidence, unsupported, and policy-rejected
outcomes, late cancellation, stale-run acceptance, context-change rebuild,
non-personalized fingerprint/scene regression, strict unknown-field rejection,
foreign Plan lineage, exposure-as-evidence rejection, and forged Script
bindings. Sprint 16.1 and 16.2 tests remain unchanged.

## Sprint 16.4 handoff

Sprint 16.4 may render the existing Script semantics as a My Lens experience.
Its minimum boundary is presentation-only consumption of exposure/channel/
assessment/scenario bindings, explicit unavailable states, and current-run
acceptance. It must not infer exposures, introduce recommendations or calibrated
probabilities, bypass evidence citations, or make UI state a semantic source of
truth.

## Known limitations and out of scope

- No production `ImpactMappingPolicy` or live structured provider exists.
- No probability or magnitude calibration exists.
- No recommendation, allocation, ranking, trading, or optimization field exists.
- No React, MapLibre, DOM, browser storage, SQLite adapter, analytics, memory,
  profile service, backend, or network dependency is used by the integration.
- Follow-up classification/replanning and all personalized Web UI remain Sprint
  16.4 scope.
