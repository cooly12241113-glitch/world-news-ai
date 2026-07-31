# Sprint 15.2 — Runtime Receipt, Cancellation & Execution Identity

## Delivery status

**IMPLEMENTED / REVIEWED / COMPLETE**

## Baseline commit

`1adf018ab36953fb51fe9e734976111c92619482`

## Goal

Extend the Sprint 15.1 thin orchestrator with operational run identity, an
injectable clock, privacy-minimized receipts, cooperative cancellation, exact
terminal-stage tracking, and a stateless stale-result acceptance contract.
Web bootstrap and persistence remain unchanged.

## Runtime versus semantic identity

Runtime identity consists of `runId`, `startedAt`, `completedAt`, terminal
stage, and outcome. These values describe one execution and never enter a
semantic fingerprint.

Semantic identity continues to use only the existing Contract, Context,
ExplanationPlan, Script, and Session fingerprints. Sprint 15.2 creates no
BriefingRun semantic fingerprint. Identical semantic fixture inputs may produce
different run IDs and times while retaining identical semantic lineage.

## RuntimeIdGenerator

`RuntimeIdGenerator.nextRunId()` is a minimal framework-neutral injected port.
The application module does not import Node/browser crypto or generate random
values. Tests use fixed and sequence generators. A concrete production adapter
is deferred until an assembly boundary requires it.

## RuntimeClock

`RuntimeClock.now()` returns the project’s ISO timestamp convention. The run
service uses it once for start and once for terminal completion. No `Date.now`
or scattered `new Date` call was added to application code. Test clocks are
fixed or sequenced; time remains operational only.

## Result envelope

The public operation is:

```ts
execute(
  request: unknown,
  context?: BriefingRunExecutionContext,
): Promise<BriefingRunResult>
```

`BriefingRunResult` is the single runtime envelope:

```text
runId
outcome  (the existing Sprint 15.1 BriefingRunOutcome)
receipt
```

This avoids repeating runtime fields across every outcome and gives the future
Web acceptance gate one explicit run identity. The strict result schema
requires result/receipt run IDs and outcome/final-stage values to match.

## BriefingRunReceipt

Every terminal result contains:

- `runId`, `startedAt`, `completedAt`;
- `finalStage`, `outcomeKind`;
- optional reached Contract, Context, Plan, Script, and Session fingerprints;
- optional evidence and scene counts when those stages are reached;
- an optional safe operational failure category.

A completed receipt requires full lineage and `finalStage: completed`.
Non-completed outcomes cannot claim the completed stage. Fingerprints for
unreached stages are omitted rather than fabricated.

Examples:

- clarification contains the Contract fingerprint but no Context/Plan/Script/
  Session fingerprints;
- generation unavailable contains Contract and Context fingerprints but no
  Plan/Script/Session fingerprints;
- a late cancelled generation may contain the validated Plan fingerprint but
  is stopped before Script compilation;
- completed contains full lineage, evidence count, and scene count.

## Receipt privacy policy

Receipt schemas deliberately have no arbitrary metadata map. They reject raw
question text, prompts, model responses, SourceDocument content, evidence
excerpts, user profiles, exception messages/stacks, API keys, credentials, and
provider payloads. Only safe categories, counts, timestamps, IDs, and existing
fingerprints are retained. Receipts are returned in memory only and are not
logged, transmitted, or persisted.

## Stage progression

The Sprint 15.1 taxonomy remains unchanged:

```text
received
contract-building
context-building
plan-generating
script-compiling
session-creating
completed
```

The service updates one local execution-state stage immediately before each
owned boundary. The outcome and receipt are validated to share the same actual
terminal stage. No UI event bus or parallel state machine was introduced.

## Cancellation contract

`BriefingRunCancellation.isCancellationRequested()` is a minimal behavioral
port carried by optional `BriefingRunExecutionContext`. It does not expose
`AbortSignal`, DOM, browser, or provider types. Cancellation is a nontechnical
`cancelled` outcome with a receipt and no failure category.

A future Web adapter may translate `AbortSignal` into this port. The existing
generation input may still receive its already-supported signal through its
assembly function; Sprint 15.2 does not duplicate or alter provider
cancellation behavior.

## Cancellation checkpoints

Cancellation is checked:

- after request validation;
- before and after Contract compilation;
- before and after Context building;
- before and after generation;
- before and after Script compilation;
- before and after Session initialization.

Once observed, downstream stages stop. A run cancelled before Contract calls
no compiler. A run cancelled after Contract calls no Context builder. A run
cancelled after Script compilation initializes no Session.

## Late-result rejection

Generation cancellation is rechecked after the awaited coordinator result.
Even when a provider ignores cancellation and returns a late successful Plan,
the application service returns `cancelled` and does not compile a Script or
initialize a Session. The reached Plan fingerprint may remain in the receipt as
accurate operational lineage; it is never applied.

## Stale responsibility boundary

The service generates run identity but owns no global “latest run” state.
`isCurrentBriefingRun(expectedRunId, result)` is a pure helper for the future
controller acceptance gate:

- Run A result with expected Run B ID is rejected;
- Run B result with expected Run B ID is accepted.

This follows Sprint 14 operation-identity philosophy without introducing a
mutable singleton or coupling initial runtime outcomes to Session commands.
Actual Web acceptance and atomic UI application remain Sprint 15.3 work.

## Failure taxonomy

Receipt categories are intentionally small and reflect only distinctions the
existing code can support:

- `invalid-request`
- `contract-invalid`
- `context-unavailable`
- `generation-unavailable`
- `invalid-proposal`
- `script-invalid`
- `session-invalid`
- `invariant-violation`
- `unexpected`

Clarification, insufficient evidence, policy rejection, and cancellation have
no failure category. `generation-unavailable` is a user-safe structured outcome
that may carry its matching operational category. Unexpected exceptions become
sanitized `failed/unexpected`; raw messages and stacks are discarded.

## Provider refusal limitation

The upstream `provider-refusal` result still lacks a typed distinction between
policy refusal and availability refusal. Sprint 15.2 preserves Sprint 15.1’s
conservative `generation-unavailable` mapping and the same safe receipt
category. No false policy precision or upstream generation redesign was added.

## Determinism

Tests execute the same semantic fixture twice with sequence run IDs and clock
values. Runtime receipts differ as expected while Contract, Context, Plan,
Script, and Session fingerprints remain identical. Runtime fields are absent
from `BriefingRunSemanticLineage`.

## Tests

The new runtime suite covers:

- completed, clarification, generation-unavailable, and unexpected-failure
  receipts;
- exact evidence/scene counts and reached lineage;
- strict privacy/unknown-field rejection;
- sequence run IDs and fixed/sequence clock behavior;
- cancellation before Contract, after Contract, after late generation, and
  before Session initialization;
- cancelled receipt posture;
- stateless stale run acceptance/rejection.

Existing Sprint 15.1 tests were adapted to assert through the new result
envelope without removing or weakening their Contract, Context, generation,
Script, Session, atomicity, and determinism assertions.

## Architecture boundaries

New application production code imports no React, MapLibre, DOM globals,
localStorage, CSS, concrete fetch/XMLHttpRequest/OpenAI/SQLite adapter, timer,
animation API, `Date.now`, `Math.random`, `crypto.randomUUID`, or telemetry SDK.
Clock and ID behavior exists only behind injected interfaces. Web, package
metadata, and migrations are unchanged.

## Known limitations

- No concrete runtime ID/clock adapter is selected yet.
- Cancellation is cooperative; the application cannot forcibly stop a provider
  that ignores its own transport signal, but it rejects the late result.
- Provider refusal remains conservatively categorized.
- Receipt persistence, retention, telemetry, and cost/provider comparison are
  not implemented.
- The helper defines stale acceptance identity only; no Web controller uses it
  yet.

## Sprint 15.3 handoff

Sprint 15.3 needs only a minimal local runtime assembly and Web bootstrap
controller that:

1. supplies concrete local/fixed runtime ID and clock adapters;
2. translates optional browser cancellation into the application port;
3. starts a run and remembers its `runId` as the expected identity;
4. accepts only a matching result through `isCurrentBriefingRun`;
5. on `completed`, atomically supplies the returned Script and Session to the
   existing presentation/player/follow-up architecture.

No renderer, map, player, Session reducer, or follow-up reimplementation is
required.

## Out of scope

Web bootstrap changes, real OpenAI/search/backend calls, API keys, DB receipt
persistence, telemetry, auth/OAuth, billing, true append, AnswerPolicy, dark
maps, 3D globe, UI redesign, and Strategic Foresight are excluded.
