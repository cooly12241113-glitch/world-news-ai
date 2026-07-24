import type {
  IngestionErrorDetails,
  IngestionErrorCode,
  IngestionStage,
} from "./types";

export class IngestionError extends Error {
  readonly details: IngestionErrorDetails;

  constructor(
    code: IngestionErrorCode,
    message: string,
    stage: IngestionStage,
    options: {
      retryable?: boolean;
      cause?: unknown;
      context?: Readonly<Record<string, string | number | boolean>>;
    } = {},
  ) {
    super(message);
    this.name = "IngestionError";
    this.details = {
      code,
      message,
      stage,
      retryable: options.retryable ?? false,
      cause: safeCause(options.cause),
      context: options.context,
    };
  }
}

const safeCause = (cause: unknown): string | undefined => {
  if (cause instanceof Error) {
    return cause.name;
  }
  return undefined;
};
