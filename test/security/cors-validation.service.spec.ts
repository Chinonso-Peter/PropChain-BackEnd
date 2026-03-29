import { ConfigService } from '@nestjs/config';
import { CorsValidationService } from '../../src/security/services/cors-validation.service';

describe('CorsValidationService', () => {
  const createConfigService = (values: Record<string, unknown>) =>
    ({
      get: jest.fn((key: string, defaultValue?: unknown) => (key in values ? values[key] : defaultValue)),
    }) as unknown as ConfigService;

  it('uses localhost defaults in development when no origins are configured', () => {
    const service = new CorsValidationService(
      createConfigService({
        NODE_ENV: 'development',
      }),
    );

    const config = service.getCorsConfig();

    expect(config.allowCredentials).toBe(true);
    expect(config.allowedOrigins).toHaveLength(2);
    expect(service.isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(service.isOriginAllowed('https://malicious.example.com')).toBe(false);
  });

  it('blocks wildcard configuration in production-like environments', () => {
    const service = new CorsValidationService(
      createConfigService({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: '*',
      }),
    );

    expect(service.validateConfig()).toEqual({
      isValid: false,
      errors: ['Wildcard (*) CORS origin is not allowed in production/staging'],
    });
  });

  it('allows configured origins and exposes a dynamic Nest CORS callback', done => {
    const service = new CorsValidationService(
      createConfigService({
        NODE_ENV: 'staging',
        CORS_ALLOWED_ORIGINS: 'https://app.propchain.example,https://admin.propchain.example/',
        CORS_ALLOWED_HEADERS: ['Content-Type', 'Authorization', 'X-Requested-With'],
        CORS_EXPOSED_HEADERS: ['x-correlation-id'],
      }),
    );

    const corsOptions = service.getNestCorsOptions();
    const originHandler = corsOptions.origin as (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => void;

    expect(service.isOriginAllowed('https://admin.propchain.example')).toBe(true);
    expect(service.isOriginAllowed('https://unknown.example')).toBe(false);

    originHandler('https://app.propchain.example', (error, allow) => {
      expect(error).toBeNull();
      expect(allow).toBe(true);

      originHandler(undefined, (missingOriginError, missingOriginAllowed) => {
        expect(missingOriginError).toBeNull();
        expect(missingOriginAllowed).toBe(true);
        done();
      });
    });
  });

  it('uses credential-free wildcard handling in test mode', () => {
    const service = new CorsValidationService(
      createConfigService({
        NODE_ENV: 'test',
      }),
    );

    const config = service.getCorsConfig();

    expect(config.allowCredentials).toBe(false);
    expect(config.allowedOrigins).toEqual(['*']);
    expect(service.isOriginAllowed('https://any-origin.example')).toBe(true);
  });
});
