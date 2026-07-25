# ADR-010: Evidence-Grounded ExplanationPlan

- Status: Accepted
- Date: 2026-07-25

## Context

The foundation produces an evidence package but does not define how future
generators must organize an explanation. Generator-specific structure would
break contract alignment, epistemic separation, and auditability.

## Decision

Add `ExplanationPlan` as a provider- and renderer-neutral aggregate between
context selection and future generation. Drafts reference exact contract and
context fingerprints, contain ordered sections and steps, bind requirements to
context/provenance IDs, and declare epistemic, output, decision, and visual
policies.

Drafts are untrusted. A deterministic validator checks identity, required
sections, ordering, dependency DAGs, evidence/provenance, epistemic and
uncertainty requirements, visual/personalization policy, and stop conditions.
Only successful validation exposes `ValidatedExplanationPlan`.

Fingerprints include contract/context fingerprints, ordered semantic
structure, bindings, dependencies, policies, decision rules, and generator
metadata. Generated IDs, timestamps, warnings, and set-like reference order are
excluded.

The rule-based assembler creates requirements and bindings only. It creates no
answer text, new facts, causality, forecast, verdict, or recommendation.

## Consequences

- Future rule, LLM, and human generators share one schema and validator.
- Missing evidence remains a structured stop.
- Visual intent contains no renderer implementation.
- No LLM, UI, HTTP, or DB dependency enters the explanation domain.
- Persistence remains a port and migration version 2 is unchanged.
