import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  executeFollowUp,
  type FollowUpExecutionOutcome,
  type FollowUpExecutionRequest,
} from "@world-news-ai/application-follow-up";
import type { EvidenceAllowlist, FollowUpContext, FollowUpRequest } from "@world-news-ai/follow-up";
import {
  reduceBriefingSession,
  type BriefingSession,
  type SessionCommand,
  type ViewportSnapshot,
} from "@world-news-ai/session";
import type { ValidatedBriefingScript } from "@world-news-ai/script-web";
import { adaptBriefingScript, type RenderableBriefing } from "../../renderer/presentation-adapter";
import { createDemoBriefingSession, DEMO_SESSION_POLICY_VERSION } from "../session";
import {
  browserFollowUpRuntimeContext,
  sessionTransitionContext,
  type FollowUpRuntimeContext,
} from "./follow-up-runtime-context";
import {
  BrowserFixtureReplanAdapter,
  resolveFixtureScenario,
} from "./fixture-scenario-resolver";
import { applyReplacementAtomically } from "./follow-up-script-application";
import type {
  ClarificationOptionId,
  FollowUpExecutionStatus,
  FollowUpViewModel,
} from "./follow-up-ui-state";
import { createFollowUpViewModel } from "./follow-up-view-model";

const MAX_DRAFT_LENGTH = 800;
const CLARIFICATION_DRAFTS: Partial<Record<ClarificationOptionId, string>> = {
  "replace-remaining-scenes": "여기서부터 남은 장면을 다시 구성해줘",
  "rebuild-entire-briefing": "처음부터 전체 브리핑을 다시 구성해줘",
};

export interface ClarificationOptionApplication {
  nextSession: BriefingSession;
  draft?: string;
  dismissOutcome: boolean;
  focusTarget: "composer" | "analysis";
}

function evidenceAllowlist(script: ValidatedBriefingScript): EvidenceAllowlist {
  const bindings = script.scenes.flatMap(({ contentBindings }) => contentBindings);
  const unique = (values: string[]) => [...new Set(values)];
  return {
    contextItemIds: unique(bindings.flatMap((item) => item.contextItemIds)),
    excerptIds: unique(bindings.flatMap((item) => item.excerptIds)),
    provenanceRecordIds: unique(bindings.flatMap((item) => item.provenanceRecordIds)),
    sourceDocumentIds: unique(bindings.flatMap((item) => item.sourceDocumentIds)),
    claimIds: unique(bindings.flatMap((item) => item.claimIds)),
    evidenceLinkIds: unique(bindings.flatMap((item) => item.evidenceLinkIds)),
    dataPointIds: unique(bindings.flatMap((item) => item.dataPointIds)),
  };
}

type CommandInput<T extends SessionCommand["type"]> =
  Extract<SessionCommand, { type: T }> extends infer Value
    ? Value extends SessionCommand
      ? Omit<Value, "commandId" | "expectedSessionFingerprint">
      : never
    : never;

function transition<T extends SessionCommand["type"]>(
  session: BriefingSession,
  command: CommandInput<T>,
  runtime: FollowUpRuntimeContext,
): BriefingSession {
  const result = reduceBriefingSession(session, {
    ...(command as object),
    commandId: runtime.nextId("command"),
    expectedSessionFingerprint: session.semanticFingerprint,
  } as SessionCommand, sessionTransitionContext(runtime, session.policyVersion));
  if (!result.success) throw new Error(result.structuredError.code);
  return result.nextSession;
}

export function applyClarificationOption(
  session: BriefingSession,
  option: ClarificationOptionId,
  runtime: FollowUpRuntimeContext,
): ClarificationOptionApplication {
  if (option === "keep-current-briefing") {
    return {
      nextSession: session.status === "composer-open"
        ? transition(session, { type: "CLOSE_COMPOSER" }, runtime)
        : session,
      dismissOutcome: true,
      focusTarget: "analysis",
    };
  }
  return {
    nextSession: session.status === "composer-open"
      ? session
      : transition(session, { type: "OPEN_COMPOSER" }, runtime),
    draft: CLARIFICATION_DRAFTS[option],
    dismissOutcome: true,
    focusTarget: "composer",
  };
}

export function useFollowUpSessionController(
  initialScript: ValidatedBriefingScript,
  runtime: FollowUpRuntimeContext = browserFollowUpRuntimeContext,
) {
  const initial = useMemo(() => {
    const presentation = adaptBriefingScript(initialScript);
    if (!presentation.success) throw new Error(presentation.error.message);
    return {
      session: createDemoBriefingSession(initialScript, runtime.now()),
      script: initialScript,
      presentation: presentation.value,
    };
  }, [initialScript, runtime]);
  const [session, setSession] = useState(initial.session);
  const [script, setScript] = useState(initial.script);
  const [presentation, setPresentation] = useState(initial.presentation);
  const [status, setStatus] = useState<FollowUpExecutionStatus>("idle");
  const [outcome, setOutcome] = useState<FollowUpExecutionOutcome>();
  const [viewModel, setViewModel] = useState<FollowUpViewModel>();
  const [draft, setDraft] = useState("");
  const [retryableRequest, setRetryableRequest] = useState<string>();
  const [initializationError, setInitializationError] = useState<string>();
  const [focusRequest, setFocusRequest] = useState<{
    id: number;
    target: "composer" | "analysis";
  }>();
  const latestOperation = useRef<string | undefined>(undefined);

  useEffect(() => {
    setSession(initial.session); setScript(initial.script); setPresentation(initial.presentation);
    setStatus("idle"); setOutcome(undefined); setViewModel(undefined); setDraft("");
    setRetryableRequest(undefined); setInitializationError(undefined);
  }, [initial]);

  const openComposer = useCallback(() => {
    try { setSession((current) => current.status === "composer-open"
      ? current : transition(current, { type: "OPEN_COMPOSER" }, runtime)); }
    catch { setInitializationError("The follow-up Composer could not be opened."); }
  }, [runtime]);
  const closeComposer = useCallback(() => {
    try { setSession((current) => current.status !== "composer-open"
      ? current : transition(current, { type: "CLOSE_COMPOSER" }, runtime)); }
    catch { setInitializationError("The follow-up Composer could not be closed."); }
  }, [runtime]);
  const updateDraft = useCallback((text: string) => setDraft(text.slice(0, MAX_DRAFT_LENGTH)), []);
  const startBriefing = useCallback(() => {
    try { setSession((current) => transition(current, { type: "START_BRIEFING" }, runtime)); }
    catch { setInitializationError("The demo session could not be started."); }
  }, [runtime]);
  const navigateToScene = useCallback((sceneId: string, sceneIndex: number) => {
    setSession((current) => {
      if (current.sceneCursor.sceneId === sceneId || current.status === "composer-open") return current;
      try {
        return transition(current, { type: "JUMP_TO_SCENE", sceneId, sceneIndex }, runtime);
      } catch {
        setInitializationError("The session scene could not be synchronized.");
        return current;
      }
    });
  }, [runtime]);
  const recordManualMapInteraction = useCallback((viewportSnapshot: ViewportSnapshot) => {
    setSession((current) => {
      if (current.status === "manual-map-view") return current;
      try {
        return transition(current, {
          type: "USER_MAP_INTERACTION_STARTED",
          viewportSnapshot,
        }, runtime);
      } catch {
        setInitializationError("The manual map view could not be synchronized.");
        return current;
      }
    });
  }, [runtime]);
  const keepManualMapView = useCallback(() => {
    setSession((current) => {
      if (current.status !== "manual-map-view") return current;
      try { return transition(current, { type: "KEEP_MANUAL_VIEW" }, runtime); }
      catch {
        setInitializationError("The manual map view could not be preserved.");
        return current;
      }
    });
  }, [runtime]);
  const returnToBriefingCamera = useCallback(() => {
    setSession((current) => {
      if (current.status !== "manual-map-view") return current;
      const operationId = runtime.nextId("map-return");
      try {
        const returning = transition(current, {
          type: "RETURN_TO_BRIEFING_CAMERA",
          operationId,
        }, runtime);
        return transition(returning, {
          type: "SCENE_MOTION_COMPLETED",
          operationId,
        }, runtime);
      } catch {
        setInitializationError("The briefing camera could not be restored.");
        return current;
      }
    });
  }, [runtime]);

  const run = useCallback(async (text: string, executionSession = session) => {
    const normalized = text.trim();
    if (!normalized || status === "running") return;
    setStatus("running");
    const operationId = runtime.nextId("operation");
    latestOperation.current = operationId;
    const followUpId = runtime.nextId("follow-up");
    try {
      const sceneIds = script.scenes.map(({ id }) => id);
      const allowlist = evidenceAllowlist(script);
      const visibleEvidenceIds = script.scenes[executionSession.sceneCursor.sceneIndex]?.contentBindings
        .flatMap((binding) => binding.contextItemIds) ?? [];
      const request: FollowUpRequest = {
        followUpId, sessionId: executionSession.sessionId,
        parentQuestionId: executionSession.currentQuestionId, text: normalized, locale: "en",
        currentSceneId: executionSession.sceneCursor.sceneId,
        currentSceneIndex: executionSession.sceneCursor.sceneIndex,
        expectedSessionFingerprint: executionSession.semanticFingerprint,
        scriptFingerprint: script.fingerprint,
        contextPackageFingerprint: script.contextPackageFingerprint,
        submittedAt: runtime.now(), policyVersion: executionSession.policyVersion,
      };
      const context: FollowUpContext = {
        sessionId: executionSession.sessionId,
        currentSceneId: executionSession.sceneCursor.sceneId,
        currentSceneIndex: executionSession.sceneCursor.sceneIndex,
        scriptId: script.id, scriptFingerprint: script.fingerprint,
        contractId: script.contractId, contractFingerprint: script.contractFingerprint,
        planId: script.explanationPlanId, planFingerprint: script.explanationPlanFingerprint,
        contextPackageId: script.contextPackageId,
        contextPackageFingerprint: script.contextPackageFingerprint,
        availableSceneIds: sceneIds,
        completedSceneIds: sceneIds.slice(0, executionSession.sceneCursor.sceneIndex + 1),
        remainingSceneIds: sceneIds.slice(executionSession.sceneCursor.sceneIndex + 1),
        visibleEvidenceIds, evidenceAllowlist: allowlist,
        presentationPreference: script.presentationPreference,
        selectedAnalysisTab: executionSession.selectedAnalysisTab,
        manualMapViewStatus: executionSession.manualMapViewState.status,
        ...(executionSession.followUpParentId ? { priorFollowUpId: executionSession.followUpParentId } : {}),
        policyVersion: executionSession.policyVersion,
      };
      const resolution = resolveFixtureScenario(
        request, context, script, runtime.nextId("decision"),
      );
      const execution: FollowUpExecutionRequest = {
        executionId: runtime.nextId("execution"), operationId,
        sessionId: executionSession.sessionId, followUpRequest: request,
        followUpContext: context,
        classifierPolicy: {
          decisionId: resolution.decision.decisionId,
          policyVersion: resolution.decision.policyVersion,
        },
        fixtureScenarioId: resolution.scenarioId,
        ...(resolution.appendUnavailable
          ? { appendBudget: { requestedAdditionalSceneCount: 1, maximumScenes: sceneIds.length } }
          : {}),
        deterministicContext: {
          submitTransition: sessionTransitionContext(runtime, DEMO_SESSION_POLICY_VERSION),
          startTransition: sessionTransitionContext(runtime, DEMO_SESSION_POLICY_VERSION),
          outcomeTransition: sessionTransitionContext(runtime, DEMO_SESSION_POLICY_VERSION),
          resultId: runtime.nextId("result"), answerPlanId: runtime.nextId("answer"),
        },
        expectedSessionFingerprint: executionSession.semanticFingerprint,
        policyVersion: DEMO_SESSION_POLICY_VERSION,
      };
      const result = await Promise.resolve(executeFollowUp(executionSession, execution, {
        replanAdapter: new BrowserFixtureReplanAdapter(resolution),
        classifier: () => resolution.decision,
      }));
      if (latestOperation.current !== operationId || result.outcome === "stale-ignored") return;
      if (result.outcome === "replacement-applied") {
        const applied = applyReplacementAtomically(script, resolution.replacementScript, result);
        setScript(applied.script); setPresentation(applied.presentation);
      }
      setSession(result.nextSession);
      setOutcome(result);
      setViewModel(createFollowUpViewModel(result));
      if (result.outcome === "failed") setRetryableRequest(normalized);
      else { setRetryableRequest(undefined); setDraft(""); }
    } catch {
      setRetryableRequest(normalized);
      setInitializationError("The fixture follow-up failed safely. The briefing was not changed.");
    } finally {
      if (latestOperation.current === operationId) setStatus("idle");
    }
  }, [runtime, script, session, status]);

  const submitFollowUp = useCallback(() => { void run(draft); }, [draft, run]);
  const selectClarificationOption = useCallback((option: ClarificationOptionId) => {
    try {
      const application = applyClarificationOption(session, option, runtime);
      setSession(application.nextSession);
      if (application.draft !== undefined) setDraft(application.draft);
      if (application.dismissOutcome) {
        setOutcome(undefined);
        setViewModel(undefined);
      }
      setFocusRequest((current) => ({
        id: (current?.id ?? 0) + 1,
        target: application.focusTarget,
      }));
    } catch {
      setInitializationError("The clarification option could not be applied.");
    }
  }, [runtime, session]);
  const retryFollowUp = useCallback(() => {
    if (!retryableRequest) return;
    try {
      const retrySession = session.status === "composer-open"
        ? session
        : transition(session, { type: "OPEN_COMPOSER" }, runtime);
      setSession(retrySession);
      void run(retryableRequest, retrySession);
    } catch {
      setInitializationError("The follow-up could not be prepared for retry.");
    }
  }, [retryableRequest, run, runtime, session]);
  const dismissOutcome = useCallback(() => {
    setOutcome(undefined); setViewModel(undefined); setInitializationError(undefined);
  }, []);
  const resetSession = useCallback(() => {
    setSession(createDemoBriefingSession(initialScript, runtime.now()));
    setScript(initialScript);
    const adapted = adaptBriefingScript(initialScript);
    if (adapted.success) setPresentation(adapted.value);
    setOutcome(undefined); setViewModel(undefined); setDraft("");
  }, [initialScript, runtime]);
  const endSession = useCallback(() => {
    try { setSession((current) => transition(current, { type: "END_BRIEFING" }, runtime)); }
    catch { setInitializationError("The demo session could not be ended."); }
  }, [runtime]);

  return {
    session, script, presentation, status, outcome, viewModel, draft,
    retryableRequest, latestOperationIdentity: latestOperation.current,
    initializationError, focusRequest, maxDraftLength: MAX_DRAFT_LENGTH,
    openComposer, closeComposer, startBriefing, navigateToScene,
    recordManualMapInteraction, keepManualMapView, returnToBriefingCamera,
    updateDraft, submitFollowUp,
    selectClarificationOption, retryFollowUp, dismissOutcome,
    endSession, resetSession,
  };
}
