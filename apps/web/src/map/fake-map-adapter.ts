import { WORLD_CAMERA, type CameraMotionInstruction, type MapCameraState,
  type MapInitializationConfiguration, type MapRendererAdapter,
  type MapUserInteractionEvent, type ResolvedOverlayInstruction } from "./map-adapter";

export class FakeMapRendererAdapter implements MapRendererAdapter {
  initialized = false;
  destroyed = false;
  motions: CameraMotionInstruction[] = [];
  overlays: ResolvedOverlayInstruction[] = [];
  overlayApplicationCount = 0;
  resizeCount = 0;
  interactionEnabled = true;
  overlayFailure = false;
  projectionOffset = 0;
  private state: MapCameraState = WORLD_CAMERA;
  private readonly listeners = new Set<(event: MapUserInteractionEvent) => void>();
  private readonly cameraListeners = new Set<() => void>();

  async initialize(_container: HTMLElement, configuration: MapInitializationConfiguration) {
    this.initialized = true;
    this.state = configuration.initialCamera;
    return { success: true };
  }
  async applyMotion(instruction: CameraMotionInstruction) {
    this.motions.push(instruction);
    this.state = instruction.destination;
    this.emitCameraChange();
    return { success: true };
  }
  async applyOverlays(overlays: ResolvedOverlayInstruction[], _fingerprint?: string) {
    this.overlayApplicationCount += 1;
    this.overlays = [...overlays];
    return this.overlayFailure ? { success: false, message: "Fixture overlay failure." } : { success: true };
  }
  async clearSceneOverlays(_fingerprint?: string) { this.overlays = []; }
  projectPoints(points: ResolvedOverlayInstruction["points"]) {
    return points.map((point) => {
      const normalized = ((point.longitude + 180) % 360 + 360) % 360 - 180;
      const longitude = normalized
        + Math.round((this.state.center.longitude - normalized) / 360) * 360;
      return {
      x: ((longitude + 180) / 360) * 1000 + this.projectionOffset,
      y: ((90 - point.latitude) / 180) * 500,
    }; });
  }
  getCameraState() { return this.state; }
  resize() { this.resizeCount += 1; this.emitCameraChange(); }
  setInteractionEnabled(enabled: boolean) { this.interactionEnabled = enabled; }
  subscribeToUserInteraction(listener: (event: MapUserInteractionEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeToCameraChange(listener: () => void) {
    this.cameraListeners.add(listener);
    return () => this.cameraListeners.delete(listener);
  }
  emitCameraChange() {
    for (const listener of this.cameraListeners) listener();
  }
  get cameraListenerCount() { return this.cameraListeners.size; }
  emitUserInteraction(type: MapUserInteractionEvent["type"] = "pan") {
    for (const listener of this.listeners) listener({ type, source: "user" });
  }
  destroy() {
    this.destroyed = true;
    this.listeners.clear();
    this.cameraListeners.clear();
  }
}
