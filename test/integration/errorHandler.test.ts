import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { notFoundHandler, errorHandler, withRetry, withTimeout } from '../../src/middleware/errorHandler';
import { NotFoundError, ValidationError, AppError } from '../../src/libs/errors';

// ─── Test App Factory ──────────────────────────────────────────────────────

function createApp(routeHandler: (req: Request, res: Response, next: NextFunction) => void) {
  const app = express();
  app.use(express.json());
  app.get('/test', routeHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// ─── Error Handler Middleware ──────────────────────────────────────────────

describe('errorHandler middleware', () => {
  it('returns 404 with NOT_FOUND code for NotFoundError', async () => {
    const app = createApp((_req, _res, next) => next(new NotFoundError('User', 1)));
    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('1');
  });

  it('returns 400 with VALIDATION_ERROR for ValidationError', async () => {
    const app = createApp((_req, _res, next) => next(new ValidationError('Email is required', { field: 'email' })));
    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual({ field: 'email' });
  });

  it('returns 500 for non-operational errors', async () => {
    const app = createApp((_req, _res, next) => {
      const err = new AppError('crash', 'INTERNAL_ERROR', 500, undefined, false);
      next(err);
    });
    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 500 for unexpected plain errors', async () => {
    const app = createApp((_req, _res, next) => next(new Error('unexpected')));
    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
  });
});

describe('notFoundHandler', () => {
  it('responds 404 for unmatched routes', async () => {
    const app = express();
    app.use(notFoundHandler);
    app.use(errorHandler);
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ─── withRetry ─────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('resolves immediately on first success', async () => {
    const op = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(op, { maxAttempts: 3, delayMs: 0 });
    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries and eventually succeeds', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(op, { maxAttempts: 3, delayMs: 0 });
    expect(result).toBe('success');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all attempts', async () => {
    const op = jest.fn().mockRejectedValue(new Error('always fails'));
    await expect(withRetry(op, { maxAttempts: 3, delayMs: 0 })).rejects.toThrow('always fails');
    expect(op).toHaveBeenCalledTimes(3);
  });
});

// ─── withTimeout ───────────────────────────────────────────────────────────

describe('withTimeout', () => {
  it('resolves when operation completes in time', async () => {
    const op = () => Promise.resolve(42);
    await expect(withTimeout(op, 500)).resolves.toBe(42);
  });

  it('rejects with TimeoutError when operation takes too long', async () => {
    const slow = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('too slow')), 200));
    await expect(withTimeout(slow, 50, 'slow-query')).rejects.toMatchObject({
      code: 'TIMEOUT',
      statusCode: 504,
    });
  });
});
