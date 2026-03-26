import { Request, Response, NextFunction } from 'express';
import { AppError, isOperationalError, toError } from 'src/lib/errors';
import { logger } from 'src/lib/logger';

const errorLogger = logger.child('ErrorHandler');

// ─── 404 Handler (place before errorHandler in app) ───────────────────────

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.path}`, 'NOT_FOUND', 404));
}

// ─── Global Error Handler ─────────────────────────────────────────────────

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const error = err instanceof AppError ? err : convertToAppError(err);

  // Log operational errors as warnings, programmer errors as errors
  if (error.isOperational) {
    errorLogger.warn('Operational error', { code: error.code, message: error.message });
  } else {
    errorLogger.error('Unexpected error — possible programmer error', toError(err), {
      code: error.code,
    });
  }

  // In production, hide internals for non-operational errors
  const isProd = process.env.NODE_ENV === 'production';
  const safeMessage = !error.isOperational && isProd ? 'An unexpected error occurred' : error.message;

  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: safeMessage,
      ...(error.details && { details: error.details }),
      // Expose stack only in development
      ...(!isProd && { stack: error.stack }),
    },
  });
}

// ─── Recovery Mechanisms ──────────────────────────────────────────────────

/** Retry an async operation with exponential backoff */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number; label?: string } = {},
): Promise<T> {
  const { maxAttempts = 3, delayMs = 300, label = 'operation' } = options;
  const retryLogger = logger.child('Retry');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const isLast = attempt === maxAttempts;
      retryLogger.warn(`Attempt ${attempt}/${maxAttempts} failed for "${label}"`, {
        error: err instanceof Error ? err.message : String(err),
      });

      if (isLast) throw err;
      await delay(delayMs * 2 ** (attempt - 1)); // exponential backoff
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error('Retry loop exited unexpectedly');
}

/** Wrap an operation with a timeout */
export async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, label = 'operation'): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AppError(`Timed out: ${label}`, 'TIMEOUT', 504)), timeoutMs),
    ),
  ]);
}

// ─── Private Helpers ──────────────────────────────────────────────────────

function convertToAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const error = toError(err);
  return new AppError(error.message, 'INTERNAL_ERROR', 500, undefined, false);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Process-Level Error Safety Net ──────────────────────────────────────

export function registerProcessErrorHandlers(): void {
  const processLogger = logger.child('Process');

  process.on('uncaughtException', (err: Error) => {
    processLogger.error('Uncaught exception — shutting down', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    processLogger.error('Unhandled promise rejection', toError(reason));
    if (!isOperationalError(reason)) process.exit(1);
  });
}
