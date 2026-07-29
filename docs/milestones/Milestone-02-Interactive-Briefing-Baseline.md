# Milestone 02 — Interactive Briefing Baseline

## Status

**IMPLEMENTED / AUDIT COMPLETE / BROWSER ACCEPTED / FINAL COMPLETE**

The code, deterministic fixture integration, architecture boundaries, and
manual browser acceptance are complete. This establishes the fixture-only
Interactive Briefing baseline across Sprint 10–14.

## Audit scope and baseline

- Branch: `main`
- Baseline commit: `58eee8de657ee4ce6e05404363468a04bd4583c6`
- Baseline tests: 66 files, 642 tests
- SQLite migration version: 2
- Package and lock changes at baseline: none
- Local/origin ahead-behind at baseline: 0/0
- Scope: Sprint 10 through Sprint 14.3B, including the fixture-only Web
  integration
- Excluded: live GPT/search, backend, authentication, persistence expansion,
  dark vector maps, 3D globe, and broad UI redesign

This audit is distinct from the earlier
[Pre-Renderer Readiness Audit](Milestone-02-Pre-Renderer-Readiness-Audit.md).

## Integrated pipeline

| Stage | Input identity | Output identity | Semantic fingerprint | Runtime gate | Provenance requirement | Failure outcome | Next-stage fields | Persistence | Test location |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BriefingQuestion | question ID | question ID | contract compiler input | strict question schema | referenced event/entity IDs | invalid input | text, scopes, caller context | no | `src/briefing/__tests__` |
| BriefingContract | question ID | contract ID | contract fingerprint | contract schema/compiler | evidence and uncertainty policies | clarification/unsupported/error | question ID, policies, scopes | no | `src/briefing/__tests__` |
| RetrievalPlan | contract ID/fingerprint | plan fingerprint | retrieval-plan fingerprint | context schemas | contract evidence policy | invalid request | queries, budgets, provider requirements | no | `src/context/__tests__/planner.test.ts` |
| EvidenceContextPackage | contract and retrieval identities | context package ID/fingerprint | package fingerprint | package schema and cross-reference checks | excerpts and provenance index must close | insufficient/no context/error | selected items, excerpts, provenance, gaps | no | `src/context/__tests__` |
| ExplanationPlan | contract/context fingerprints | plan ID/fingerprint | plan fingerprint | plan schema and semantic validator | every binding is context-allowlisted | clarification/unsupported/no-plan/invalid | sections, steps, bindings, epistemic policy | port only | `src/explanation/__tests__` |
| Structured proposal | generation request fingerprint | proposal/output hash | request and output hashes | strict proposal schema and exact allowlist | proposal may only reuse catalog IDs | refusal/failure/repair exhausted | bounded proposal fields | no | `src/generation/__tests__` |
| Validated ExplanationPlan | proposal plus contract/context | validated plan fingerprint | plan fingerprint | hydrator plus ExplanationPlan validator | closed-world reference closure | insufficient/invalid | validated sections and policies | port only | `src/integration/__tests__/structured-generation.test.ts` |
| BriefingScript | validated plan/contract/context | Script ID/fingerprint | Script fingerprint | compiler, schema, Script validator | bindings/citations/visuals close to plan and context | no-script/insufficient/invalid | scenes, policies, semantic visual intents | no | `src/script/__tests__` |
| Web presentation | Script ID/fingerprint | presentation Script ID/fingerprint | Script fingerprint preserved | presentation adapter | bindings and cues are copied, not rewritten | renderer failure | renderable scenes and policies | no | `apps/web/src/renderer` |
| BriefingSession | contract/context/plan/Script fingerprints | session ID/fingerprint | session fingerprint | strict schema and reducer | identity lineage remains attached | structured transition rejection | cursor, operation, viewport, Composer state | in-memory port only | `src/session/__tests__` |
| FollowUpRequest | session/scene/Script/context identities | follow-up ID/content hash | normalized follow-up fingerprint | strict schema and normalization | visible evidence is allowlisted | invalid request | immutable captured context | no | `src/follow-up/__tests__` |
| ReplanDecision | follow-up fingerprint/context | decision fingerprint | decision fingerprint | deterministic classifier schema | scope cannot expand evidence | clarification/unsupported | scope and mapping policy | no | `src/follow-up/__tests__` |
| ReplanResult | operation/start fingerprint/decision | result fingerprint | result fingerprint | strict result schema, replacement validator | continuity and replacement allowlists close | failed/stale/clarification/unsupported | replacement, mapping, continuity, scene sets | no | `src/replan/__tests__` |
| FollowUpExecutionOutcome | Session/request/result identities | outcome and next-session fingerprints | outcome fingerprint | outcome orchestrator and schemas | answer/replacement remains closed-world | failed/stale-ignored | next Session, UI action, replacement summary | no | `src/application/follow-up/__tests__` |
| Web atomic application | old Script + validated outcome | Session/Script/presentation/cursor identity | replacement fingerprint must agree | atomic application identity checks | presentation uses validated replacement | reject without partial swap | Player, dispatcher, panel and overlay source | no | `apps/web/src/features/follow-up`, `apps/web/src/renderer` |

## Identity-chain audit

The following chain is present and validated:

```text
question ID
→ contract ID/fingerprint
→ context package ID/fingerprint
→ plan ID/fingerprint
→ Script ID/fingerprint
→ session ID/fingerprint
→ follow-up ID/content fingerprint
→ operation ID
→ decision fingerprint
→ replan result fingerprint
→ replacement Script fingerprint
```

- Generated IDs and timestamps are excluded from semantic plan, Script,
  follow-up-content, and Session fingerprints where required.
- Portable SHA-256 matches the standard vector in tests.
- Common semantic canonicalization now normalizes strings to NFC.
- Stale operation and starting-session fingerprints cannot commit.
- Current-context outcomes retain Script identity.
- Full rebuild outcomes change Script identity and restart at opening.
- Replacement Session and Web presentation fingerprints must match before
  application; mismatch rejects the application rather than partially applying.

## Provenance closure

- ExplanationPlan bindings must reference selected Context items, excerpts, and
  provenance records.
- BriefingScript bindings are subsets of validated plan bindings and Context
  records; citations and document intents must close over scene bindings.
- Structured proposals can only reuse exact IDs from the request catalog.
- Current-context answers can only use visible IDs within the captured
  allowlist.
- Replacement Scripts pass Script validation plus the replacement evidence
  allowlist and continuity gate.
- Unknown evidence IDs reject replacement and preserve the prior Session,
  Script, and cursor.
- Excerpt/document and provenance/item relationships are cross-checked.

No unsupported evidence is synthesized by the deterministic fixtures.

## Epistemic-policy audit

The plan and Script contracts carry:

- `confirmed-fact`
- `attributed-claim`
- `interpretation`
- `inference`
- `forecast`
- `unknown`

The validator requires attribution for attributed claims, assumptions for
forecasts, evidence for confirmed facts, explicit unknown/uncertainty posture,
and a prohibition on unsupported fact promotion. The Web current-context
fixture exposes attributed posture and uncertainty. Final verdicts and
unsupported importance rankings are not generated.

Future live GPT integration still needs a production AnswerPolicy and remains
technical debt; it is not implemented by this milestone.

## ExplanationPlan and BriefingScript audit

- ExplanationPlan dependency graphs, step/section limits, epistemic policies,
  and evidence closure are validated.
- BriefingScript compilation is deterministic for the same validated inputs.
- Opening and closing requirements and the complete scene budget are enforced.
- Visual and camera intents remain semantic; no renderer coordinates, CSS, or
  component code enter the domain.
- Citation, narration, caption, uncertainty, overlay, and source relationships
  are validated.
- Insufficient/no-plan outcomes do not become fabricated Scripts.

## Structured LLM adapter audit

- Live generation is disabled unless explicitly enabled and configured.
- Missing key/model configuration returns `PROVIDER_NOT_CONFIGURED`.
- The deterministic fake provider is used by integration tests.
- Proposals are untrusted and exact-ID allowlisted.
- Transport retry and schema repair are bounded.
- Refusal and provider/transport failure remain distinct outcomes.
- Renderer code, coordinates, CSS, prompt bodies, provider response bodies,
  chain-of-thought, and raw evidence are not retained in audit records.
- This milestone performs zero live provider calls.

## BriefingSession state-machine audit

Ten statuses and twenty commands are present. The reducer is effect-free and
uses injected transition identity/time. It does not call clocks, randomness,
timers, DOM, MapLibre, network, OpenAI, or SQLite.

- Only explicit navigation commands change the scene cursor.
- Motion completion, Composer changes, manual map interaction, and replay do
  not advance scenes.
- Current-context, clarification, and unsupported resolutions retain Script.
- Only validated replacement completion changes Script identity.
- `REPLAN_FAILED` is technical-failure-only.
- Stale identities and invalid transitions reject without partial mutation.
- Reset, end, replay, repository isolation, and reducer immutability have
  regression coverage.

## Replan and scene-mapping audit

All seven scopes and five mapping strategies are represented. Full rebuild,
remaining replacement, append clarification, stale rejection, invalid mapping,
and failure rollback are covered.

The audit found and corrected one High integration defect: the Core fixture
adapter used scene-ID membership alone for changed/preserved accounting, and
its revise fixture did not semantically change the current scene. The fixture
now adds a bounded counterevidence binding/objective change, and identical scene
IDs are compared by scene semantic fingerprint. Changed, preserved, and removed
sets are mutually exclusive.

True append remains unavailable in the browser fixture and resolves to
clarification rather than pretending a terminal replacement is append.

## Atomic Web application

The application gate prepares a validated replacement presentation before
committing it and checks:

- previous Script fingerprint
- replacement/outcome fingerprint
- next Session/presentation fingerprint
- mapped scene ID/index

The controller then synchronizes Session, Script, presentation, Player cursor,
AnalysisPanel, caption/narration sources, and scene surface. Same-ID semantic
replacement refreshes the dispatcher and route/marker overlays without
replaying camera motion. Identity mismatch rejects application.

## Map and motion regression

Automated coverage confirms:

- geographic route points as source of truth
- Pacific antimeridian splitting
- SVG route casing and main line
- origin/waypoint/destination markers
- camera/resize/replay reprojection
- `style.load` restoration and latest-overlay ownership
- real-input-only manual-view conflict
- programmatic motion without manual-view popup
- same-scene replacement route/marker refresh
- overlay cleanup when leaving Impact Path

The existing MapLibre bundle-size warning remains accepted debt.

## Browser acceptance

The user completed final acceptance in a regular Chrome browser. The accepted
coverage includes current-context answers, current-scene revision, clarification
options, full rebuild, unsupported outcomes, manual navigation, route/marker
and viewport continuity, favicon delivery, Console, Network, and accessibility.

- Current-scene revision reports changed 1, preserved 6, removed 0.
- Full rebuild moves to Opening 1/7; explicit Next moves to Global Overview 2/7.
- Route and markers remain synchronized at Impact Path 4/7.
- `favicon.svg` returns 200 with no favicon 404.
- React/runtime errors and unhandled promise rejections are zero.
- The focused MapLibre canvas no longer triggers the blocked `aria-hidden`
  warning.
- No unexpected application request or live OpenAI/LLM/search/backend call
  occurs.
- Automatic scene advancement remains absent.

Codex Chrome control could not initialize because its local kernel asset path
was unavailable. The user therefore performed Console, Network, navigation, and
accessibility acceptance directly. This tooling issue is separate from the
product and does not invalidate the completed acceptance.

## Findings and corrections

### Blocker

None found in automated and static audit.

### High

- Fixed: Core same-ID revise fixture produced no semantic scene change and
  scene-set accounting used only IDs.

### Medium

- Fixed: common semantic fingerprint canonicalization did not normalize Unicode
  strings to NFC.
- Fixed: an interactive MapLibre canvas was inside an always-hidden ARIA
  ancestor; the visible map now has explicit group semantics without hiding
  focused descendants.

### Low

- Fixed: added an explicit branded SVG favicon and HTML entry link so the
  browser no longer requests a missing default favicon.

## Remaining technical debt

- No live GPT/search/backend integration
- No true append browser fixture
- No browser failure fixture
- No production AnswerPolicy for live GPT
- No persistent BriefingSession/replan storage
- Existing MapLibre bundle-size warning
- Dark vector map and 3D globe deferred to a renderer sprint
- Production DNS-rebinding, retention/redaction, monitoring, and complete
  knowledge-record persistence remain prerequisites

## Release-readiness decision

**FINAL COMPLETE FOR THE FIXTURE-ONLY INTERACTIVE BRIEFING BASELINE.**

Automated, static, and user-operated browser acceptance are complete with 67
test files and at least 652 passing tests. Live production integrations remain
explicitly outside this baseline.

## Sprint 15 entry conditions

1. Prepare and approve a Sprint 15 plan.
2. Define production AnswerPolicy, retrieval, backend, persistence, auth, and
   operational boundaries before implementation.
3. Preserve this fixture-only baseline and evidence lineage.

Sprint 15 implementation is not part of this milestone finalization.
