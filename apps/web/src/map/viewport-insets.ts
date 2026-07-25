import type { MapViewportInsets } from "./map-adapter";

export interface SafeViewportMeasurements {
  viewportWidth: number;
  viewportHeight: number;
  composerHeight: number;
  playbackHeight: number;
  captionHeight: number;
  sidePanelWidth: number;
  mobileSafeAreaBottom: number;
  panelOpen: boolean;
  composerExpanded: boolean;
  mobile: boolean;
}

const size = (value: number, maximum: number): number =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : 0;

export function calculateViewportInsets(value: SafeViewportMeasurements): MapViewportInsets {
  const width = Math.max(1, value.viewportWidth);
  const height = Math.max(1, value.viewportHeight);
  const controls = Math.max(value.composerHeight, value.playbackHeight);
  const bottom = size(controls + value.captionHeight + value.mobileSafeAreaBottom + 24, height * 0.58);
  const side = value.panelOpen ? size(value.sidePanelWidth + 20, width * 0.42) : 20;
  return {
    top: 72,
    right: value.mobile ? 20 : side,
    bottom: value.composerExpanded ? size(bottom + 96, height * 0.68) : bottom,
    left: 20,
  };
}
