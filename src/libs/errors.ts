export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'TIMEOUT';

export interface SerializedError {
  name: string;
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: unknown;
  isOperational: boolean;
}

// ─── Base Application Error ────────────────────────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean; // false = programmer error, crash-worthy
  public readonly details?: unknown;

  constructor(
    message: string,
    code: ErrorCode = 'INTERNAL_ERROR',
    statusCode = 500,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  serialize(): SerializedError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      isOperational: this.isOperational,
    };
  }
}

// ─── Domain-Specific Errors ────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} is currently unavailable`, 'SERVICE_UNAVAILABLE', 503);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 'RATE_LIMITED', 429);
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string) {
    super(`Operation timed out: ${operation}`, 'TIMEOUT', 504);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Narrows any thrown value to an Error instance */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(String(value));
}

/** True when the error is a known, operational AppError */
export function isOperationalError(error: unknown): boolean {
  return error instanceof AppError && error.isOperational;
}

/** Wraps an async fn, converting unknown throws into AppErrors */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  fallbackMessage = 'An unexpected error occurred',
): Promise<[T, null] | [null, AppError]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (err) {
    if (err instanceof AppError) return [null, err];
    const appErr = new AppError(
      err instanceof Error ? err.message : fallbackMessage,
      'INTERNAL_ERROR',
      500,
      undefined,
      false,
    );
    return [null, appErr];
  }
}
