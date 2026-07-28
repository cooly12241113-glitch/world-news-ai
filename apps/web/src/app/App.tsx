import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { SceneDispatcher } from "../renderer/SceneDispatcher";
import { initialPlayerState } from "../player/player-state";
import { playerReducer } from "../player/player-reducer";
import { calculateViewportInsets } from "../map/viewport-insets";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { BottomComposer } from "../components/BottomComposer";
import { PlaybackControlBar } from "../components/PlaybackControlBar";
import { ClosingControls } from "../components/ClosingControls";
import { MapConflictPrompt, SceneCaption, SceneProgress } from "../components/SceneChrome";
import { useBriefingKeyboard } from "../hooks/useBriefingKeyboard";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { demoCatalog } from "./demo-catalog";
import { FollowUpStatus, useFollowUpSessionController } from "../features/follow-up";
import type { MapCameraState } from "../map/map-adapter";

export function App() {
  const [demoId, setDemoId] = useState<(typeof demoCatalog)[number]["id"]>("map-impact");
  const demo = demoCatalog.find(({ id }) => id === demoId) ?? demoCatalog[0];
  const followUp = useFollowUpSessionController(demo.script);
  const briefing = followUp.presentation;
  const [player, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [panelOpen, setPanelOpen] = useState(true);
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = systemReducedMotion || demo.script.presentationPreference.mode === "reduced-motion";

  useEffect(() => {
    dispatch({
      type: "sync-script",
      sceneCount: briefing.scenes.length,
      sceneIndex: followUp.session.sceneCursor.sceneIndex,
    });
  }, [briefing.fingerprint]);

  const previous = useCallback(() => dispatch({ type: "previous" }), []);
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const onMapInteraction = useCallback((viewport: MapCameraState) => {
    dispatch({ type: "map-interaction" });
    followUp.recordManualMapInteraction(viewport);
  }, [followUp.recordManualMapInteraction]);
  const closeTransient = useCallback(() => {
    dispatch({ type: "composer-cancel" });
    setPanelOpen(false);
  }, []);
  const keyboard = useMemo(() => ({ previous, next, close: closeTransient }),
    [previous, next, closeTransient]);
  useBriefingKeyboard(keyboard);

  const scene = briefing.scenes[player.currentSceneIndex] ?? briefing.scenes[0]!;
  const mobile = typeof window !== "undefined" && window.innerWidth < 760;
  const insets = calculateViewportInsets({
    viewportWidth: typeof window === "undefined" ? 1440 : window.innerWidth,
    viewportHeight: typeof window === "undefined" ? 900 : window.innerHeight,
    composerHeight: 76, playbackHeight: 76, captionHeight: 90,
    sidePanelWidth: 390, mobileSafeAreaBottom: 16,
    panelOpen, composerExpanded: player.composerExpanded, mobile,
  });
  const playbackVisible = player.status !== "ready" && player.status !== "exploration";
  const mapScene = scene.primarySurface === "map";
  const openComposer = () => {
    dispatch({ type: "composer-focus" });
    followUp.openComposer();
  };
  const closeComposer = () => {
    dispatch({ type: "composer-cancel" });
    followUp.closeComposer();
  };
  const start = () => {
    dispatch({ type: "start" });
    followUp.startBriefing();
  };
  useEffect(() => {
    if (followUp.session.status === "presenting-scene" ||
      followUp.session.status === "manual-map-view") {
      followUp.navigateToScene(scene.id, player.currentSceneIndex);
    }
  }, [player.currentSceneIndex, scene.id]);
  useEffect(() => {
    dispatch({ type: followUp.session.composerState === "expanded"
      ? "composer-focus" : "composer-cancel" });
  }, [followUp.session.composerState]);
  useEffect(() => {
    if (!followUp.focusRequest) return;
    if (followUp.focusRequest.target === "analysis") {
      document.getElementById("analysis-scene-heading")?.focus();
    } else {
      document.getElementById("briefing-question")?.focus();
    }
  }, [followUp.focusRequest]);
  const dock = player.composerExpanded ? (
    <BottomComposer expanded briefing={playbackVisible}
      context={{ sceneId: scene.id, scriptFingerprint: briefing.fingerprint }}
      value={followUp.draft} running={followUp.status === "running"}
      maxLength={followUp.maxDraftLength}
      onChange={followUp.updateDraft} onSubmit={followUp.submitFollowUp}
      onFocus={openComposer} onCancel={closeComposer} onStart={start} />
  ) : player.status === "ended" ? (
    <ClosingControls
      onReplay={() => dispatch({ type: "replay" })}
      onFollowUp={openComposer}
      onEnd={() => { dispatch({ type: "end" }); followUp.endSession(); }} />
  ) : playbackVisible ? (
    <PlaybackControlBar state={player} mapScene={mapScene}
      onPrevious={previous}
      onReplayMotion={() => dispatch({ type: "replay-scene-motion" })}
      onNext={next}
      onSpeed={(speed) => dispatch({ type: "set-speed", speed })}
      onAnimation={() => dispatch({ type: "set-animation", enabled: !player.animationEnabled })}
      onAsk={openComposer} />
  ) : (
    <BottomComposer expanded={player.composerExpanded}
      value={followUp.draft} onChange={followUp.updateDraft}
      onFocus={openComposer} onCancel={closeComposer} onStart={start} />
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="World News AI home">
          <span className="brand-mark">WN</span><span>World News AI<small>Evidence briefing prototype</small></span>
        </a>
        <label className="demo-selector">Demo
          <select value={demoId} onChange={(event) => setDemoId(event.target.value as typeof demoId)}>
            {demoCatalog.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button type="button" className="quiet" onClick={() => setPanelOpen((value) => !value)}>
          Analysis
        </button>
      </header>

      <section className="briefing-stage" aria-label="Interactive briefing">
        <SceneDispatcher scene={scene} player={player} insets={insets}
          surfaceIdentity={briefing.fingerprint}
          reducedMotion={reducedMotion}
          onMapInteraction={onMapInteraction}
          flowCaption={<SceneCaption scene={scene} flow />}
          flowDock={dock} />
        <div className="stage-vignette" aria-hidden="true" />
        <SceneProgress current={player.currentSceneIndex} total={briefing.scenes.length} />
        {mapScene && <SceneCaption scene={scene} />}
        <AnalysisPanel scene={scene} open={panelOpen}
          onToggle={() => setPanelOpen((value) => !value)}
          followUp={followUp.viewModel}
          onClarification={followUp.selectClarificationOption}
          onRetry={followUp.retryFollowUp}
          onDismiss={followUp.dismissOutcome} />
        <MapConflictPrompt visible={player.mapConflict}
          onKeep={() => {
            dispatch({ type: "keep-user-map-view" });
            followUp.keepManualMapView();
          }}
          onReturn={() => {
            dispatch({ type: "return-to-script-camera" });
            followUp.returnToBriefingCamera();
          }} />
      </section>

      {mapScene && dock}
      <FollowUpStatus status={followUp.status} />
      {followUp.initializationError && <p className="follow-up-inline-error" role="alert">
        {followUp.initializationError}
      </p>}
      <div className="sr-only" aria-live="polite">
        Scene {player.currentSceneIndex + 1}: {scene.objective}
      </div>
    </main>
  );
}
