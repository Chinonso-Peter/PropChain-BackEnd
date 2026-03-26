import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ServiceUnavailableError,
  RateLimitError,
  TimeoutError,
  isOperationalError,
  tryCatch,
  toError,
} from '../../src/lib/errors';

describe('AppError', () => {
  it('sets all fields correctly', () => {
    const err = new AppError('something failed', 'INTERNAL_ERROR', 500, { extra: true });
    expect(err.message).toBe('something failed');
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.details).toEqual({ extra: true });
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('AppError');
  });

  it('serializes correctly', () => {
    const err = new AppError('oops', 'NOT_FOUND', 404);
    const s = err.serialize();
    expect(s.code).toBe('NOT_FOUND');
    expect(s.statusCode).toBe(404);
    expect(s.isOperational).toBe(true);
  });
});

describe('Domain errors', () => {
  it('ValidationError → 400', () => {
    const e = new ValidationError('bad input', { field: 'email' });
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.details).toEqual({ field: 'email' });
  });

  it('NotFoundError with id → descriptive message', () => {
    const e = new NotFoundError('User', 99);
    expect(e.statusCode).toBe(404);
    expect(e.message).toContain('99');
  });

  it('NotFoundError without id → generic message', () => {
    const e = new NotFoundError('Config');
    expect(e.message).toBe('Config not found');
  });

  it('UnauthorizedError → 401', () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
  });

  it('ForbiddenError → 403', () => {
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it('ConflictError → 409', () => {
    expect(new ConflictError('duplicate email').statusCode).toBe(409);
  });

  it('ServiceUnavailableError → 503', () => {
    const e = new ServiceUnavailableError('PaymentGateway');
    expect(e.statusCode).toBe(503);
    expect(e.message).toContain('PaymentGateway');
  });

  it('RateLimitError → 429', () => {
    expect(new RateLimitError().statusCode).toBe(429);
  });

  it('TimeoutError → 504', () => {
    const e = new TimeoutError('DB query');
    expect(e.statusCode).toBe(504);
    expect(e.message).toContain('DB query');
  });
});

describe('isOperationalError', () => {
  it('returns true for operational AppError', () => {
    expect(isOperationalError(new NotFoundError('Item'))).toBe(true);
  });

  it('returns false for non-operational AppError', () => {
    const e = new AppError('crash', 'INTERNAL_ERROR', 500, undefined, false);
    expect(isOperationalError(e)).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isOperationalError(new Error('plain'))).toBe(false);
  });
});

describe('toError', () => {
  it('returns the same Error instance', () => {
    const err = new Error('original');
    expect(toError(err)).toBe(err);
  });

  it('wraps a string into an Error', () => {
    const err = toError('string error');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('string error');
  });
});

describe('tryCatch', () => {
  it('returns [result, null] on success', async () => {
    const [val, err] = await tryCatch(async () => 42);
    expect(val).toBe(42);
    expect(err).toBeNull();
  });

  it('returns [null, AppError] when AppError is thrown', async () => {
    const thrown = new NotFoundError('Post', 1);
    const [val, err] = await tryCatch(async () => {
      throw thrown;
    });
    expect(val).toBeNull();
    expect(err).toBe(thrown);
  });

  it('wraps unknown throws into AppError', async () => {
    const [val, err] = await tryCatch(async () => {
      throw 'raw string throw';
    });
    expect(val).toBeNull();
    expect(err).toBeInstanceOf(AppError);
    expect(err?.code).toBe('INTERNAL_ERROR');
  });
});
