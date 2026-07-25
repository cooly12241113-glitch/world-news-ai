# Explanation Plan Architecture

## Boundary

```text
BriefingContract + EvidenceContextPackage
→ ExplanationPlanGenerator
→ ExplanationPlanDraft
→ ExplanationPlanValidator
→ ValidatedExplanationPlan
```

The plan is an auditable generation blueprint, not the final briefing.

## Aggregate and evidence

The root carries identity/fingerprints, versions, generator metadata, strategy,
objective, status, sections, uncertainties, visuals, coverage, decision rules,
stop reason, and fingerprint. Sections and steps preserve explicit semantic
order. Steps define output, epistemic, evidence, dependency, confidence,
uncertainty, subject, location, time, and prohibited-behavior requirements.

Bindings reference `ContextItem`, `SourceExcerpt`, `ProvenanceRecord`,
`SourceDocument`, `Claim`, `EvidenceLink`, `DataPoint`, and `Entity` IDs.
Missing references or broken provenance fail validation. Evidence text is not
copied into the plan.

## Epistemic and decision policy

- Confirmed facts require evidence.
- Attributed claims require attribution.
- Interpretations remain distinct from evidence.
- Inferences require premises and cannot become facts automatically.
- Forecasts require assumptions, horizon, and verification requirements.
- Unknowns expose gaps.

Decision rules list only allowed future verdict/scenario categories and the
conditions for using or downgrading them. Sprint 10 decides no verdict.

## Visual intent

Visual intent declares mode, purpose, requiredness, related evidence IDs,
justification, and fallback. It contains no coordinates, file paths, CSS,
animation, chart specification, 3D scene, or layout instruction.

## Validation and fingerprint

Validation covers references/fingerprints, duplicate IDs, section and step
order, required contract sections, dependency cycles, evidence roles,
provenance, epistemics, uncertainty, visuals, personalization, and budgets.
It is pure and performs no HTTP or database work.

Section/step order is semantic; set-like references are canonicalized.
Generated IDs, timestamps, warning order, paths, and runtime duration are
excluded. Contract/context, evidence, policy, and generator changes alter the
fingerprint.

## Extensions

`ExplanationPlanGenerator` is the future structured LLM boundary.
`ExplanationPlanRepository` is a future persistence boundary. Neither has an
infrastructure adapter in Sprint 10.
