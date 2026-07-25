import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { adaptBriefingScript } from "../renderer/presentation-adapter";
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

export function App() {
  const [demoId, setDemoId] = useState<(typeof demoCatalog)[number]["id"]>("map-impact");
  const demo = demoCatalog.find(({ id }) => id === demoId) ?? demoCatalog[0];
  const adapted = useMemo(() => adaptBriefingScript(demo.script), [demo]);
  const [player, dispatch] = useReducer(playerReducer, initialPlayerState);
  const [panelOpen, setPanelOpen] = useState(true);
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = systemReducedMotion || demo.script.presentationPreference.mode === "reduced-motion";

  useEffect(() => {
    if (adapted.success) dispatch({ type: "load", sceneCount: adapted.value.scenes.length });
    else dispatch({ type: "error", message: adapted.error.message });
  }, [adapted]);

  const previous = useCallback(() => dispatch({ type: "previous" }), []);
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const onMapInteraction = useCallback(() => dispatch({ type: "map-interaction" }), []);
  const closeTransient = useCallback(() => {
    dispatch({ type: "composer-cancel" });
    setPanelOpen(false);
  }, []);
  const keyboard = useMemo(() => ({ previous, next, close: closeTransient }),
    [previous, next, closeTransient]);
  useBriefingKeyboard(keyboard);

  if (!adapted.success) return <main className="fatal-error" role="alert">
    <h1>Briefing unavailable</h1><p>{adapted.error.message}</p>
  </main>;
  const briefing = adapted.value;
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
  const dock = player.composerExpanded ? (
    <BottomComposer expanded briefing={playbackVisible}
      context={{ sceneId: scene.id, scriptFingerprint: briefing.fingerprint }}
      onFocus={() => dispatch({ type: "composer-focus" })}
      onCancel={() => dispatch({ type: "composer-cancel" })}
      onStart={() => dispatch({ type: "start" })} />
  ) : player.status === "ended" ? (
    <ClosingControls
      onReplay={() => dispatch({ type: "replay" })}
      onFollowUp={() => dispatch({ type: "composer-focus" })}
      onEnd={() => dispatch({ type: "end" })} />
  ) : playbackVisible ? (
    <PlaybackControlBar state={player} mapScene={mapScene}
      onPrevious={previous}
      onReplayMotion={() => dispatch({ type: "replay-scene-motion" })}
      onNext={next}
      onSpeed={(speed) => dispatch({ type: "set-speed", speed })}
      onAnimation={() => dispatch({ type: "set-animation", enabled: !player.animationEnabled })}
      onAsk={() => dispatch({ type: "composer-focus" })} />
  ) : (
    <BottomComposer expanded={player.composerExpanded}
      onFocus={() => dispatch({ type: "composer-focus" })}
      onCancel={() => dispatch({ type: "composer-cancel" })}
      onStart={() => dispatch({ type: "start" })} />
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
          reducedMotion={reducedMotion}
          onMapInteraction={onMapInteraction}
          flowCaption={<SceneCaption scene={scene} flow />}
          flowDock={dock} />
        <div className="stage-vignette" aria-hidden="true" />
        <SceneProgress current={player.currentSceneIndex} total={briefing.scenes.length} />
        {mapScene && <SceneCaption scene={scene} />}
        <AnalysisPanel scene={scene} open={panelOpen} onToggle={() => setPanelOpen((value) => !value)} />
        <MapConflictPrompt visible={player.mapConflict}
          onKeep={() => dispatch({ type: "keep-user-map-view" })}
          onReturn={() => dispatch({ type: "return-to-script-camera" })} />
      </section>

      {mapScene && dock}
      <div className="sr-only" aria-live="polite">
        Scene {player.currentSceneIndex + 1}: {scene.objective}
      </div>
    </main>
  );
}
