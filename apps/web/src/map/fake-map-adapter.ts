import { WORLD_CAMERA, type CameraMotionInstruction, type MapCameraState,
  type MapInitializationConfiguration, type MapRendererAdapter,
  type MapUserInteractionEvent, type ResolvedOverlayInstruction } from "./map-adapter";

export class FakeMapRendererAdapter implements MapRendererAdapter {
  initialized = false;
  destroyed = false;
  motions: CameraMotionInstruction[] = [];
  overlays: ResolvedOverlayInstruction[] = [];
  resizeCount = 0;
  interactionEnabled = true;
  private state: MapCameraState = WORLD_CAMERA;
  private readonly listeners = new Set<(event: MapUserInteractionEvent) => void>();

  async initialize(_container: HTMLElement, configuration: MapInitializationConfiguration) {
    this.initialized = true;
    this.state = configuration.initialCamera;
    return { success: true };
  }
  async applyMotion(instruction: CameraMotionInstruction) {
    this.motions.push(instruction);
    this.state = instruction.destination;
    return { success: true };
  }
  async applyOverlays(overlays: ResolvedOverlayInstruction[]) {
    this.overlays = [...overlays];
    return { success: true };
  }
  async clearSceneOverlays() { this.overlays = []; }
  getCameraState() { return this.state; }
  resize() { this.resizeCount += 1; }
  setInteractionEnabled(enabled: boolean) { this.interactionEnabled = enabled; }
  subscribeToUserInteraction(listener: (event: MapUserInteractionEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emitUserInteraction(type: MapUserInteractionEvent["type"] = "pan") {
    for (const listener of this.listeners) listener({ type, source: "user" });
  }
  destroy() { this.destroyed = true; this.listeners.clear(); }
}
