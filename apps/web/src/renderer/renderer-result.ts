export type RendererErrorCode =
  | "INVALID_SCRIPT"
  | "UNSUPPORTED_SCENE"
  | "REFERENCE_MISSING"
  | "MAP_INITIALIZATION_FAILED"
  | "LOCATION_RESOLUTION_FAILED"
  | "CAMERA_MOTION_FAILED"
  | "OVERLAY_FAILED";

export type RendererResult<T> =
  | { success: true; value: T; warnings: string[] }
  | { success: false; error: { code: RendererErrorCode; message: string; retryable: boolean } };

export const rendererFailure = <T>(
  code: RendererErrorCode,
  message: string,
  retryable = false,
): RendererResult<T> => ({ success: false, error: { code, message, retryable } });
