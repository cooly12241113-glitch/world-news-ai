# Sprint 14 Implementation Matrix

## Status

**DESIGNED / NOT IMPLEMENTED**

The module owners below are proposed ownership boundaries for Sprint 14
implementation. They do not assert that the modules already exist.

| Requirement | Current support | Sprint 14 change | Module owner | Test strategy | Risk | Acceptance criterion | Deferred work |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Session aggregate | Player state only; no session identity | Add framework-neutral `BriefingSession` contract | Core session domain | Contract fixtures and type checks | High | Session binds exact contract/context/plan/Script fingerprints | Persistence |
| Deterministic state machine | Deterministic player reducer covers playback subset | Add 10-state reducer and 19 command/event contract | Session reducer | Table-driven transition tests | High | Same input gives same state/effects/audit | Distributed session |
| Invalid transitions | Some actions return unchanged state | Return explicit rejected transition and audit reason | Session reducer | Every state × command invalid cases | High | No invalid command mutates state or emits effect | Product telemetry |
| Manual-only navigation | Existing reducer and tests enforce explicit navigation | Preserve rule across session/replan | Session reducer | Fake timers, motion completion, overlay completion | Blocker | Only explicit navigation/replacement mapping changes cursor | Auto advancement |
| App component state concentration | `App.tsx` owns adaptation, player, panel, scene, docks, insets, keyboard | Extract session controller/selectors and effect bridges | Web session integration | App integration tests and responsibility review | High | App is composition shell; semantic state is reducer-owned | Router/application shell |
| Script/session identity | Adapter exposes Script ID/fingerprint; reducer stores neither | Bind exact lineage to session and requests | Session domain | Fingerprint precondition tests | Blocker | Replacement only applies to expected active Script/context | Server concurrency control |
| Current scene and new Script mapping | Index selects current scene; no replacement | Stable scene-ID mapping plus explicit fallback policy | Replacement coordinator | Partial/full fixture matrix | Blocker | Removed scene is never silently selected | Semantic similarity mapping |
| Current-context answer | Composer has no submit | Fake answer result with no Script swap | Fake follow-up adapter | Assert Script object/fingerprint unchanged | High | Current-context result preserves Script and cursor | Live answer generation |
| Partial replan | None | Fixture replacement preserving completed scenes | Fake replan adapter + coordinator | Completed/current/remaining scene fixtures | High | Completed scenes preserved or explicitly invalidated | Live replanning |
| Full replan | None | Fixture replacement under policy | Fake replan adapter + coordinator | Opening/current/removed mapping tests | High | Policy controls cursor, viewport, and invalidation | Live replanning |
| Stale replan completion | Motion IDs already ignore stale completion | Tokenize follow-up/replan result and ignore stale token/fingerprint | Session reducer/coordinator | Out-of-order completion tests | Blocker | Superseded result cannot replace current Script | Cancellation transport |
| Fast repeated follow-up requests | None | One active request; later accepted request supersedes prior token | Session reducer | Rapid submit and reversed completion tests | High | Exactly one result can commit; others audited stale | Queue/backpressure |
| Replan failure rollback | None | Preserve immutable pre-submit snapshot and restore | Session reducer/coordinator | Adapter failure at classify/validate/adapt/apply | Blocker | Old Script, cursor, context, tab, viewport restored | Retry service policy |
| Evidence reference invalidation | Script validator validates references; no replacement diff | Compare old/new context allowlists and report invalidation | Replacement validator | Unknown/removed reference fixtures | Blocker | Silent evidence invalidation rejected | New evidence retrieval |
| Evidence allowlist | Existing generation/Script validation boundaries | Capture exact IDs in `FollowUpContext` and validate result | Follow-up contract/validator | Invented SourceDocument/Claim/EvidenceLink/DataPoint IDs | Blocker | Unknown ID cannot enter answer or replacement | Live retrieval expansion |
| Unsupported fact promotion | Existing epistemic validation | Re-run plan/Script validation and reject promotion | Replacement validator | Unsupported-to-confirmed fixtures | Blocker | Unsupported evidence never becomes confirmed fact | External fact checking |
| Script fingerprint mismatch | Adapter preserves fingerprint; no session precondition | Compare expected and active fingerprints at start/complete | Coordinator | Mismatch before dispatch and before completion | Blocker | Mismatch result rejected without UI swap | Server ETag/versioning |
| Composer open/close | Player preserves scene index; input local | Capture return state/context/viewport; exact cancel restore | Session reducer + Composer | Open/cancel from presenting/manual/closing/ended | High | Cancel returns exact scene and viewport | Draft persistence |
| Composer submission | No submit callback | Add validated submit and structured outcomes | Composer/session integration | Empty, valid, clarification, unsupported | Medium | Invalid input stays open; valid request tokenized | Voice input |
| Viewport snapshot | Adapter exposes `getCameraState`; reducer stores conflict only | Add renderer-neutral snapshot capture/restore bridge | Map effect bridge | Fake adapter camera round-trip tests | High | Snapshot restored exactly where policy requires | Cross-device viewport |
| Viewport restoration | Return command replays scene camera only | Distinguish manual snapshot, scripted snapshot, replacement camera | Map effect bridge | Cancel/failure/partial/full policy matrix | High | Restoration follows declared replacement policy | Persistent map state |
| Replay scene motion | Request counter reruns same scene motion | Route through session command/effect token | Session reducer + map bridge | Scene identity invariant tests | Medium | Cursor unchanged and stale completion ignored | Motion timeline controls |
| Presentation adapter gate | Rejects unvalidated Scripts and sorts scenes | Adapt replacement before atomic commit | Presentation/replacement coordinator | Invalid status/order/surface fixture tests | High | Old UI stays active until adaptation succeeds | New surface implementations |
| Analysis tab context | Local panel state resets by scene | Lift semantic tab selection into session context | Session selectors + panel | Open/replan/cancel tab preservation tests | Medium | Same surviving scene keeps explicit tab selection | User preference persistence |
| Closing/ended flow | Closing controls render at current `ended` player status | Separate closing scene from completed session | Session reducer + controls | Final scene, end, replay, follow-up tests | Medium | No implicit reset; replay explicitly selects scene 0 | Session history screen |
| Replanning navigation lock | None | Reject navigation while active request pending | Session reducer | Keyboard/button/direct dispatch tests | High | Cursor cannot change during replan | Optimistic navigation |
| Change summary | None | Report added/revised/removed scenes and evidence invalidations | Replan result UI | Fixture rendering/accessibility tests | Medium | Every accepted replacement displays changes | Rich diff visualization |
| Structured errors | Map/player have local strings | Add typed session/replan error outcomes | Session contract/UI | Failure-code coverage | Medium | Retryable and terminal failures are distinguishable | Central error reporting |
| Mobile layout | Existing responsive prototype | Add Composer expanded, replan loading/error, change summary states | Web UI/CSS | Narrow viewport component/integration tests | High | Controls remain reachable, non-overlapping, keyboard accessible | Native app layout |
| Session audit privacy | Existing generation audit seam, no player audit | Record IDs, transitions, reason codes; exclude prose | Session audit | Snapshot and forbidden-field tests | High | No question/evidence text in default audit record | Retention/redaction service |
| Network/LLM isolation | Web fixtures; no follow-up adapter | Deterministic fake only | Fake adapter | Network spy and dependency review | Blocker | Zero network/LLM calls in Sprint 14 tests | Live provider adapter |
| Database isolation | No Web session persistence | Keep session in memory | Session integration | Migration and package diff checks | Low | Migration files unchanged | Persistent session storage |
| Sprint 13.1 regression | 51 files / 484 tests baseline | Preserve behavior while adding session layer | Whole repository | Full typecheck/test/build/audit for implementation | Blocker | Baseline tests remain passing plus new tests | Performance soak tests |

## High-risk dependency order

```text
identity/fingerprint preconditions
  -> deterministic reducer
  -> evidence/replacement validation
  -> scene mapping and rollback
  -> viewport bridge
  -> Composer/UI integration
  -> mobile/accessibility hardening
```

UI integration must not begin by expanding `App.tsx`. The session contracts,
reducer, fake adapter, and replacement validation should exist with tests before
the App composition is changed.

## Blocker exit conditions

- Manual-only navigation is mechanically enforced.
- Stale or mismatched replacements cannot commit.
- Evidence IDs remain allowlisted and epistemic validation still runs.
- Failed replans restore the prior session snapshot.
- Existing and new tests remain offline and deterministic.
