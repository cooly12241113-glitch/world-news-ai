# ADR-011: LLMs Are Untrusted Structured Proposers

- Status: Accepted
- Date: 2026-07-25

## Decision

Add a provider-independent `generation` module. It serializes only bounded
contract/context data, marks evidence as untrusted data, supplies an exact
reference allowlist, and accepts only a strict `ExplanationPlanProposal`.
Proposal-local keys are converted to deterministic domain IDs before the
existing ExplanationPlan schema and semantic validator run.

Provider-specific code stays under `generation/adapters`. The OpenAI adapter
uses the official JavaScript SDK and Responses API `text.format` strict JSON
Schema path. Because this repository uses Zod 4, JSON Schema is generated with
Zod's native `toJSONSchema` rather than a version-sensitive SDK Zod helper.
Model IDs and credentials are injected configuration, never core constants.

No output is trusted merely because provider-native structured output accepted
it. Closed-world reference, provenance, evidence-role, epistemic, contract,
visual, stop-condition, and dependency validation remain mandatory.

## Consequences

- Provider output cannot create new evidence or domain IDs.
- Deterministic request/hydration/validation is separated from nondeterministic
  provider runs.
- Transport retry and semantic repair have distinct budgets.
- Refusal and insufficiency remain structured outcomes.
- Audit is useful without storing sensitive inputs or hidden reasoning.
- Live use is explicit opt-in; CI and tests remain offline.
- The official `openai` package is the only provider SDK dependency.
- No persistence migration is introduced.
