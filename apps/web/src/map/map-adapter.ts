export interface GeoPoint { longitude: number; latitude: number }
export interface GeoBounds { west: number; south: number; east: number; north: number }
export interface MapViewportInsets { top: number; right: number; bottom: number; left: number }
export interface ResolvedCameraTarget {
  center: GeoPoint;
  bounds?: GeoBounds;
  zoom: number;
  bearing: number;
  pitch: number;
}
export interface CameraMotionInstruction {
  destination: ResolvedCameraTarget;
  transition: "fly" | "ease" | "jump";
  durationMs: number;
  viewportInsets: MapViewportInsets;
  essential: boolean;
}
export interface ResolvedOverlayInstruction {
  id: string;
  type: "marker" | "route" | "region";
  points: GeoPoint[];
  label: string;
  destinationPointIndex?: number;
  pointLabels?: string[];
}
export interface MapCameraState extends ResolvedCameraTarget {}
export interface MapUserInteractionEvent { type: "pan" | "zoom" | "rotate"; source: "user" }
export interface MapInitializationConfiguration { style: string | object; initialCamera: MapCameraState }
export interface MapOperationResult { success: boolean; pending?: boolean; message?: string }
export interface ProjectedPoint { x: number; y: number }

export interface MapRendererAdapter {
  initialize(container: HTMLElement, configuration: MapInitializationConfiguration): Promise<{ success: boolean; message?: string }>;
  applyMotion(instruction: CameraMotionInstruction): Promise<{ success: boolean; message?: string }>;
  applyOverlays(overlays: ResolvedOverlayInstruction[], fingerprint?: string): Promise<MapOperationResult>;
  clearSceneOverlays(fingerprint?: string): Promise<void>;
  projectPoints(points: GeoPoint[]): ProjectedPoint[];
  getCameraState(): MapCameraState;
  resize(): void;
  setInteractionEnabled(enabled: boolean): void;
  subscribeToUserInteraction(listener: (event: MapUserInteractionEvent) => void): () => void;
  subscribeToCameraChange(listener: () => void): () => void;
  destroy(): void;
}

export const WORLD_CAMERA: MapCameraState = {
  center: { longitude: 18, latitude: 22 },
  zoom: 1.3,
  bearing: 0,
  pitch: 0,
};
