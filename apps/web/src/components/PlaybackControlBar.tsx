import type { BriefingPlayerState, PlaybackSpeed } from "../player/player-state";
import { ui } from "../ui-copy";

export function PlaybackControlBar({
  state, mapScene, onPrevious, onReplayMotion, onNext, onSpeed, onAnimation, onAsk,
}: {
  state: BriefingPlayerState;
  mapScene: boolean;
  onPrevious: () => void; onNext: () => void;
  onReplayMotion: () => void; onAsk: () => void;
  onSpeed: (speed: PlaybackSpeed) => void; onAnimation: () => void;
}) {
  return (
    <div className="bottom-dock playback" data-chrome="controls"
      aria-label="Briefing playback controls">
      <button type="button" onClick={onPrevious} disabled={state.currentSceneIndex === 0}
        aria-label="Previous scene">←</button>
      {mapScene && <button type="button" onClick={onReplayMotion}>Replay scene motion</button>}
      <button type="button" onClick={onNext}
        disabled={state.currentSceneIndex >= state.sceneCount - 1}
        aria-label="Next scene">→</button>
      <span className="progress">{state.currentSceneIndex + 1} / {state.sceneCount}</span>
      {mapScene && <label>{ui.speed}
        <select value={state.playbackSpeed}
          onChange={(event) => onSpeed(event.target.value as PlaybackSpeed)}>
          <option value="slow">Slow</option><option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>
      </label>}
      {mapScene && <button type="button" onClick={onAnimation} aria-pressed={!state.animationEnabled}>
        {state.animationEnabled ? ui.motionOn : ui.motionOff}
      </button>}
      <button type="button" onClick={onAsk}>Ask a question</button>
    </div>
  );
}
