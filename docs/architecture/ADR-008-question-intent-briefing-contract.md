# ADR-008: Contract Before Briefing Generation

- Status: Accepted
- Date: 2026-07-24

## Context

Causal, verification, comparison, forecast, and personalized questions need
different scope and evidence constraints. Letting a future LLM choose those
implicitly would make behavior difficult to validate and audit.

## Decision

Validate the question, analyze it through a replaceable
`QuestionIntentAnalyzer`, evaluate ambiguity explicitly, and compile a strict
`BriefingContract` before retrieval or generation.

Sprint 08 provides a deterministic Korean/English baseline without named-event,
country, or publisher hardcoding. Missing essential context yields a structured
clarification outcome; reasonable forecast defaults are recorded.

The standard policy requires statement-level evidence references, primary and
independent sources when available, contradicting evidence, explicit
uncertainty, fact/inference separation, bounded explanations, and stop
conditions. Visuals are optional and justified. Personalization uses only
caller-provided context and never creates buy/sell advice.

Semantic fingerprints include normalized question semantics, policy version,
intent, scopes, and policies, while excluding IDs and timestamps.

## Consequences

- Future retrieval, `ExplanationPlan`, and rendering receive auditable input.
- Future AI analyzers must pass the same runtime schema.
- Rule classification may request clarification.
- Persistence remains a port; no migration is added.
