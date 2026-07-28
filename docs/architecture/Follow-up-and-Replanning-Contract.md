# Follow-up and Replanning Contract

## Status and boundary

- Sprint: 14.0 design
- Delivery: **CORE IMPLEMENTED; WEB INTEGRATION BROWSER ACCEPTED / FINAL COMPLETE**
- Provider mode for Sprint 14 implementation: deterministic fixture/fake only

The contract is implemented by the core follow-up, replan, Session, and
application modules and connected to the fixture-only Web controller. The
reference TypeScript below reuses the existing `BriefingContract`,
`EvidenceContextPackage`, `ValidatedExplanationPlan`,
`ValidatedBriefingScript`, and presentation preference contracts.

The Web resolver consumes the existing classifier decision and maps its
`ReplanScope` to an injected fixture scenario. It does not maintain a second
keyword table. True append remains unavailable in the browser fixture and
returns clarification instead of mislabeling terminal replacement.

## Pseudo TypeScript domain contract

```ts
type BriefingSessionStatus =
  | "exploration"
  | "briefing-ready"
  | "presenting-scene"
  | "scene-motion-running"
  | "manual-map-view"
  | "composer-open"
  | "replanning"
  | "closing"
  | "ended"
  | "error";

type AnalysisTab = "key" | "evidence" | "limits" | "uncertainty" | "sources";

type ReturnableSessionStatus =
  | "exploration"
  | "briefing-ready"
  | "presenting-scene"
  | "scene-motion-running"
  | "manual-map-view"
  | "closing"
  | "ended";

interface SceneCursor {
  currentSceneId: string;
  currentSceneIndex: number;
  sceneCount: number;
}

type BriefingSessionState =
  | { status: Exclude<BriefingSessionStatus, "composer-open" | "replanning" | "error"> }
  | { status: "composer-open"; returnStatus: ReturnableSessionStatus }
  | {
      status: "replanning";
      returnStatus: ReturnableSessionStatus;
      activeRequestId: string;
      activeRequestFingerprint: string;
    }
  | { status: "error"; code: string; recoverable: boolean };

interface ViewportSnapshot {
  center: { longitude: number; latitude: number };
  zoom: number;
  bearing: number;
  pitch: number;
  capturedForSceneId: string;
  capturedAt: string;
}

interface ManualMapViewState {
  active: boolean;
  sceneId: string;
  viewport?: ViewportSnapshot;
  scriptedViewport?: ViewportSnapshot;
  interaction?: "pan" | "zoom" | "rotate" | "combined";
  startedAt?: string;
}

interface FollowUpContext {
  sessionId: string;
  questionId: string;
  contractId: string;
  contractFingerprint: string;
  contextPackageId: string;
  contextPackageFingerprint: string;
  planId: string;
  planFingerprint: string;
  scriptId: string;
  scriptFingerprint: string;
  currentSceneId: string;
  currentSceneIndex: number;
  presentationPreference: BriefingPresentationPreference;
  selectedAnalysisTab: AnalysisTab;
  viewportSnapshot?: ViewportSnapshot;
  manualViewStatus: ManualMapViewState;
  allowedSourceDocumentIds: string[];
  allowedClaimIds: string[];
  allowedEvidenceLinkIds: string[];
  allowedDataPointIds: string[];
}

interface FollowUpRequest {
  id: string;
  sessionId: string;
  parentFollowUpId?: string;
  text: string;
  context: FollowUpContext;
  createdAt: string;
  policyVersion: string;
  fingerprint: string;
}

type ReplanScope =
  | "answer-current-context"
  | "revise-current-scene"
  | "append-scenes"
  | "replace-remaining-scenes"
  | "rebuild-entire-briefing"
  | "clarification-required"
  | "unsupported";

interface ReplanDecision {
  requestId: string;
  scope: ReplanScope;
  reasons: string[];
  clarificationQuestion?: string;
  targetSceneId?: string;
  preservesCompletedScenes: boolean;
  requiresScriptReplacement: boolean;
  requiresNewEvidence: boolean;
  policyVersion: string;
  fingerprint: string;
}

interface ReplanRequest {
  id: string;
  sessionId: string;
  followUpRequest: FollowUpRequest;
  decision: ReplanDecision;
  expectedScriptId: string;
  expectedScriptFingerprint: string;
  expectedContextPackageFingerprint: string;
  replacementPolicy: ScriptReplacementPolicy;
  createdAt: string;
  fingerprint: string;
}

type ReplanResult =
  | {
      outcome: "answered-current-context";
      requestId: string;
      answer: string;
      evidenceReferenceIds: string[];
      completedAt: string;
      fingerprint: string;
    }
  | {
      outcome: "replacement-ready";
      requestId: string;
      replacementScript: ValidatedBriefingScript;
      replacementContextPackage?: EvidenceContextPackage;
      replacementPlan?: ValidatedExplanationPlan;
      sceneMapping: Record<string, string | undefined>;
      removedSceneIds: string[];
      addedSceneIds: string[];
      revisedSceneIds: string[];
      invalidatedEvidenceReferenceIds: string[];
      completedAt: string;
      fingerprint: string;
    }
  | {
      outcome: "clarification-required" | "unsupported";
      requestId: string;
      message: string;
      completedAt: string;
      fingerprint: string;
    }
  | {
      outcome: "failed";
      requestId: string;
      error: { code: string; message: string; retryable: boolean };
      completedAt: string;
      fingerprint: string;
    };

interface ScriptReplacementPolicy {
  version: string;
  currentSceneMapping:
    | "same-scene-id"
    | "nearest-surviving-predecessor"
    | "replacement-opening";
  completedScenePolicy: "preserve" | "replace-with-explicit-invalidation";
  viewportPolicy:
    | "preserve-manual-view"
    | "preserve-when-scene-survives"
    | "apply-replacement-scene-camera";
  evidenceInvalidationPolicy: "reject-silent-invalidation";
  staleResultPolicy: "ignore-and-audit";
}

interface SessionAuditRecord {
  id: string;
  sessionId: string;
  sequence: number;
  commandOrEvent: string;
  fromState: BriefingSessionStatus;
  toState: BriefingSessionStatus;
  sceneId?: string;
  sceneIndex?: number;
  scriptFingerprint?: string;
  requestId?: string;
  requestFingerprint?: string;
  outcome: "accepted" | "rejected" | "ignored-stale" | "failed";
  reasonCodes: string[];
  occurredAt: string;
  policyVersion: string;
}

interface BriefingSession {
  sessionId: string;
  questionId: string;
  contractId: string;
  contractFingerprint: string;
  contextPackageId: string;
  contextPackageFingerprint: string;
  planId: string;
  planFingerprint: string;
  scriptId: string;
  scriptFingerprint: string;
  state: BriefingSessionState;
  cursor: SceneCursor;
  presentationPreference: BriefingPresentationPreference;
  selectedAnalysisTab: AnalysisTab;
  viewportSnapshot?: ViewportSnapshot;
  manualMapView: ManualMapViewState;
  activeFollowUpId?: string;
  activeReplanRequestId?: string;
  replacementPolicy: ScriptReplacementPolicy;
  createdAt: string;
  updatedAt: string;
  policyVersion: string;
}
```

## Type responsibilities

| Type | Responsibility |
| --- | --- |
| `BriefingSession` | Root identity and currently active immutable contract/context/plan/Script lineage plus mutable interaction state. |
| `SceneCursor` | Stable scene ID and validated positional view; index is never identity. |
| `BriefingSessionState` | Discriminated state-machine status and required state-specific metadata. |
| `ViewportSnapshot` | Renderer-neutral camera snapshot; no MapLibre type escapes the Web adapter. |
| `ManualMapViewState` | Whether user camera state is authoritative and how to restore it. |
| `FollowUpRequest` | Immutable user request linked to exact prior context and optional parent. |
| `FollowUpContext` | Complete, bounded identity/evidence allowlist captured at Composer open/submit. |
| `ReplanDecision` | Deterministic classification and whether replacement/evidence expansion is required. |
| `ReplanScope` | Seven allowed follow-up outcomes. |
| `ReplanRequest` | Tokenized request with optimistic Script/context fingerprint preconditions. |
| `ReplanResult` | Structured answer, validated replacement, clarification/unsupported, or failure. |
| `ScriptReplacementPolicy` | Atomic scene, viewport, completion, invalidation, and stale-result rules. |
| `SessionAuditRecord` | Privacy-minimized transition metadata; no question/evidence prose by default. |

## Identity and fingerprint policy

| Identity | Included | Semantic fingerprint treatment |
| --- | --- | --- |
| `sessionId` | Yes | Excluded; random operational identity. |
| `questionId` | Yes | Included by semantic reference where existing contracts require it. |
| Contract ID/fingerprint | Yes | Fingerprint included; ID retained for lineage. |
| Context Package ID/fingerprint | Yes | Fingerprint included; defines evidence boundary. |
| Plan ID/fingerprint | Yes | Fingerprint included; defines explanation intent. |
| Script ID/fingerprint | Yes | Fingerprint included; replacement precondition. |
| Current scene ID/index | Yes | Scene ID included in follow-up/request semantics; index excluded as derived position. |
| Presentation preference | Yes | Semantic preference/version included. |
| Selected analysis tab | Yes | Included in UI context, excluded from replan semantics unless explicitly referenced. |
| Viewport snapshot | Yes when available | Excluded from content fingerprints; included only in renderer/session state. |
| Manual view status | Yes | Excluded from content fingerprints. |
| Follow-up parent ID | Optional | ID excluded; parent request fingerprint may be used for semantic lineage. |
| `createdAt` / `updatedAt` | Yes | Always excluded from semantic fingerprints. |
| Policy version | Yes | Included when policy behavior can change output. |

Random IDs and timestamps never change semantic fingerprints. Set-like ID
allowlists are sorted and deduplicated before fingerprinting. User question
text, exact prior semantic fingerprints, classification scope, policy version,
and replacement intent do affect the follow-up/replan fingerprint.

## Deterministic follow-up classification baseline

Classification is a pure ordered rule set. It does not call an LLM or network.
The first matching terminal rule wins.

1. **Unsupported** — prohibited request, requested live/private data, or a claim
   that cannot be answered or planned within allowed evidence/policies.
2. **Clarification required** — unresolved pronoun/subject, missing location or
   time boundary, or multiple plausible target scenes.
3. **Answer current context** — asks for source, definition, caveat, or detail
   already answerable from the current scene allowlist; no Script replacement.
4. **Revise current scene** — same scene objective and scope, but presentation
   must expose existing contradiction, uncertainty, citation, or context.
5. **Rebuild entire briefing** — changes audience level, primary answer goal,
   language, or global scope such that prior structure is no longer valid.
6. **Replace remaining scenes** — completed scenes remain valid, but the new
   requirement changes the narrative/order of future scenes.
7. **Append scenes** — bounded additional topic can follow the existing Script
   without revising completed/current content.

If rules 6 and 7 both match, choose `replace-remaining-scenes` only when the
new requirement changes a dependency or prerequisite of an existing remaining
scene. Otherwise choose `append-scenes`.

| Example | Scope | Deterministic reason |
| --- | --- | --- |
| “이 수치의 출처는?” | `answer-current-context` | Source/DataPoint is already in the current allowlist. |
| “반대 근거도 보여줘” | `revise-current-scene` when existing contradictory evidence is bound; otherwise `append-scenes` if available in the package | Same objective; presentation-only change unless a new evidence scene is required. |
| “한국 경제 영향도 추가해줘” | `append-scenes` when independent; `replace-remaining-scenes` when it changes downstream impact ordering | Bounded scope extension with explicit location. |
| “처음부터 초보자 수준으로 다시 설명해줘” | `rebuild-entire-briefing` | Audience/explanation strategy changes globally. |
| “그 사람은 왜 그랬어?” | `clarification-required` | Target entity is unresolved. |
| “지금 비공개 계좌 데이터로 추천해줘” | `unsupported` | Outside evidence/privacy/product policy. |

## Replanning and replacement policy

1. Capture an immutable `FollowUpContext` before dispatch.
2. Classify deterministically and record the policy version.
3. For `answer-current-context`, return an answer restricted to existing
   allowlisted references and never replace the Script.
4. For replacements, validate Contract/context/plan/Script reference lineage,
   status, fingerprints, scene order, evidence bindings, and allowlists.
5. Accept a result only if request ID, request fingerprint, expected old Script
   fingerprint, and expected context fingerprint still match the session.
6. Adapt the replacement before committing it. Old UI remains mounted until
   validation and adaptation succeed.
7. Map current scene by exact stable scene ID. If removed, apply the declared
   fallback policy and display that mapping to the user.
8. Explicitly list removed/revised/added scenes and invalidated evidence.
9. Ignore and audit stale completions from superseded requests.
10. On failure, restore the exact old Script, cursor, evidence, tab, and map
    snapshot and offer Retry/Cancel.

## Application outcome resolution

Sprint 14.3A adds an application orchestrator above the classifier, fixture
adapter, and reducer. `current-context-answer`, `clarification-required`, and
`unsupported` are normal policy outcomes and use `REPLAN_RESOLVED`.
`replacement-ready` uses `REPLAN_COMPLETED`; only technical or domain failures
use `REPLAN_FAILED`. Stale results produce `stale-ignored` and do not mutate the
input Session.

Append requests are checked against an explicit maximum scene budget. Budget
overflow returns clarification and alternatives; it is not silently converted
to replacement or scene compression.

## Evidence safety

- `SourceDocument`, `Claim`, `EvidenceLink`, and `DataPoint` IDs must be drawn
  from the captured allowlist or a separately validated replacement Context
  Package.
- The fake adapter must be unable to hydrate unknown IDs.
- Unsupported evidence cannot become `confirmed-fact`.
- Contradictions, gaps, caveats, and invalidations stay explicit.
- Session audit records contain identifiers, state, decisions, and reason codes;
  question text, evidence excerpts, and sensitive user context are excluded by
  default.
