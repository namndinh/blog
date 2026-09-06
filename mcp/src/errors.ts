import type { ErrorBody } from "./types.js";

export class BlogError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfter: number | null;

  constructor(
    code: string,
    message: string,
    retryable = false,
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "BlogError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }

  toJSON(): ErrorBody {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      retry_after: this.retryAfter,
    };
  }
}

export function asErrorBody(error: unknown): ErrorBody {
  if (error instanceof BlogError) {
    return error.toJSON();
  }
  if (error instanceof Error) {
    return {
      code: "internal_error",
      message: error.message,
      retryable: false,
      retry_after: null,
    };
  }
  return {
    code: "internal_error",
    message: "Unexpected error",
    retryable: false,
    retry_after: null,
  };
}
