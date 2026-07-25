# Structured LLM Generation Architecture

## Modules

- `generation/models`: provider, request, proposal, result, and audit contracts.
- `request-builder`: bounded contract/context projection and allowlist.
- `prompt`: versioned immutable instruction template and hash.
- `proposal`: strict parsing and exact closed-world reference validation.
- `hydrator`: deterministic local-key to domain-ID conversion.
- `coordinator`: preflight, provider call, retry, repair, validation, audit.
- `adapters`: deterministic fake and OpenAI Responses implementations.

The `explanation` module does not import generation or provider code.

## Request and data boundary

The request contains normalized question text, generation-relevant contract
policies, selected excerpts, source/reference metadata, budgets, required
sections, visual modes, prohibited behaviors, prompt metadata, and a semantic
fingerprint. It does not contain full documents, raw HTML, database records, or
credentials.

Every excerpt is:

```json
{
  "recordType": "UNTRUSTED_EVIDENCE",
  "instructionPolicy": "DATA_ONLY"
}
```

Embedded prompt-injection text is preserved as evidence and never promoted to
instructions.

## Proposal and hydration

The proposal uses `localKey` only for sections, steps, bindings, and visuals.
Unknown properties—including final-answer, narration, renderer, or reasoning
fields—fail strict validation. All external IDs require exact allowlist
membership. Duplicate or broken local references fail before hydration.

Hydrated IDs derive from request fingerprint plus local key. Generated time and
provider response ID do not affect them. Semantic section order remains
meaningful; set-like evidence references are canonicalized by existing plan
fingerprinting.

## OpenAI Responses adapter

The adapter is disabled by default. When explicitly configured it creates a
non-streaming Responses request with:

- injected model ID;
- developer and user input;
- strict `text.format` JSON Schema;
- bounded output tokens and timeout;
- `store: false`;
- request identifiers in metadata.

It maps structured JSON, explicit refusal, response ID, finish status, token
usage, abort, timeout, authentication, permission, rate limit, quota, invalid
request, and transient server errors into provider-neutral outcomes. Tests
inject an SDK-shaped client and never use the network.

## Fingerprints and audit

The request fingerprint includes normalized question semantics,
contract/context fingerprints, provider/model, prompt ID/version/hash, schema
and policy versions, budget, allowlist, and visual policy. Request ID, time,
retry count, response ID, key, and warnings are excluded.

Proposal output hash, hydrated draft fingerprint, and validated plan
fingerprint are tracked separately. Audit contains IDs, versions, attempts,
usage, refusal, result fingerprints, repair count, and concise warnings only.

## Extension boundaries

Future visual presentation modes still compile from Sprint 10 visual intent;
the model cannot emit camera, animation, map SDK, or chart specifications.
Future `ForecastSnapshot` records may enter only as context items whose supplied
values cannot be altered. Audit/replay persistence and live smoke tests require
separate operational decisions.
