import type { BriefingPlayerState, PlaybackSpeed } from "../player/player-state";

export function PlaybackControlBar({
  state, onPrevious, onNext, onToggle, onSpeed, onAnimation,
}: {
  state: BriefingPlayerState;
  onPrevious: () => void; onNext: () => void; onToggle: () => void;
  onSpeed: (speed: PlaybackSpeed) => void; onAnimation: () => void;
}) {
  return (
    <div className="bottom-dock playback" aria-label="Briefing playback controls">
      <button type="button" onClick={onPrevious} disabled={state.currentSceneIndex === 0}
        aria-label="Previous scene">←</button>
      <button type="button" className="primary" onClick={onToggle}
        aria-label={state.status === "playing" ? "Pause briefing" : "Play briefing"}>
        {state.status === "playing" ? "Pause" : "Play"}
      </button>
      <button type="button" onClick={onNext}
        disabled={state.currentSceneIndex >= state.sceneCount - 1}
        aria-label="Next scene">→</button>
      <span className="progress">{state.currentSceneIndex + 1} / {state.sceneCount}</span>
      <label>Speed
        <select value={state.playbackSpeed}
          onChange={(event) => onSpeed(event.target.value as PlaybackSpeed)}>
          <option value="slow">Slow</option><option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>
      </label>
      <button type="button" onClick={onAnimation} aria-pressed={!state.animationEnabled}>
        {state.animationEnabled ? "Motion on" : "Motion off"}
      </button>
    </div>
  );
}
