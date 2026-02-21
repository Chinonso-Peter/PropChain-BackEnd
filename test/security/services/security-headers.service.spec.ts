import { Test, TestingModule } from '@nestjs/testing';
import { SecurityHeadersService } from '../../../src/security/services/security-headers.service';
import { ConfigService } from '@nestjs/config';

describe('SecurityHeadersService', () => {
  let service: SecurityHeadersService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityHeadersService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SecurityHeadersService>(SecurityHeadersService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSecurityHeaders', () => {
    it('should return default security headers for production', () => {
      jest.spyOn(configService, 'get').mockReturnValue('production');

      const headers = service.getSecurityHeaders();

      expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff');
      expect(headers).toHaveProperty('X-Frame-Options', 'DENY');
      expect(headers).toHaveProperty('X-XSS-Protection', '1; mode=block');
      expect(headers).toHaveProperty('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(headers).toHaveProperty('Content-Security-Policy');
      expect(headers).toHaveProperty('Strict-Transport-Security');
    });

    it('should return development headers for development environment', () => {
      jest.spyOn(configService, 'get').mockReturnValue('development');

      const headers = service.getSecurityHeaders();

      expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff');
      expect(headers).toHaveProperty('X-Frame-Options', 'SAMEORIGIN');
      expect(headers).toHaveProperty('X-XSS-Protection', '1; mode=block');
      expect(headers).toHaveProperty('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(headers).toHaveProperty('Content-Security-Policy');
    });

    it('should return minimal headers for test environment', () => {
      jest.spyOn(configService, 'get').mockReturnValue('test');

      const headers = service.getSecurityHeaders();

      expect(headers).toHaveProperty('X-Content-Type-Options', 'nosniff');
      expect(headers).toHaveProperty('X-Frame-Options', 'DENY');
      expect(headers).toHaveProperty('X-XSS-Protection', '1; mode=block');
      expect(headers).toHaveProperty('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(headers).toHaveProperty('X-DNS-Prefetch-Control', 'off');
    });

    it('should include custom CSP directives when provided', () => {
      jest.spyOn(configService, 'get').mockReturnValue('production');
      
      const customConfig = {
        csp: {
          scriptSrc: ['\'self\'', 'https://trusted.cdn.com'],
          styleSrc: ['\'self\'', '\'unsafe-inline\''],
        },
      };

      const headers = service.getSecurityHeaders(customConfig);

      expect(headers['Content-Security-Policy']).toContain(`script-src ${customConfig.csp?.scriptSrc?.join(' ') || ''}`);
      expect(headers['Content-Security-Policy']).toContain(`style-src ${customConfig.csp?.styleSrc?.join(' ') || ''}`);
    });
  });

  describe('getDevelopmentConfig', () => {
    it('should return relaxed security configuration for development', () => {
      const config = service.getDevelopmentConfig();

      expect(config.csp).toBeDefined();
      expect(config.csp?.defaultSrc).toContain('\'unsafe-eval\'');
      expect(config.csp?.scriptSrc).toContain('\'unsafe-inline\'');
      expect(config.csp?.styleSrc).toContain('\'unsafe-inline\'');
      expect(config.frameOptions).toBe('SAMEORIGIN');
      expect(config.contentTypeOptions).toBe(true);
      expect(config.xssProtection).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should return empty array for valid configuration', () => {
      const validConfig = {
        csp: {
          defaultSrc: ['\'self\''],
          scriptSrc: ['\'self\''],
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      };

      const errors = service.validateConfig(validConfig);

      expect(errors).toEqual([]);
    });

    it('should return error for HSTS max-age below minimum', () => {
      const invalidConfig = {
        hsts: {
          maxAge: 1000000, // Less than 180 days
        },
      };

      const errors = service.validateConfig(invalidConfig);

      expect(errors).toContain('HSTS max-age should be at least 180 days (15552000 seconds)');
    });

    it('should warn about unsafe-inline in default-src', () => {
      const configWithUnsafeInline = {
        csp: {
          defaultSrc: ['\'self\'', '\'unsafe-inline\''],
        },
      };

      const errors = service.validateConfig(configWithUnsafeInline);

      expect(errors).toEqual([]); // Should not error, just warn
    });

    it('should warn about unsafe-eval in script-src', () => {
      const configWithUnsafeEval = {
        csp: {
          scriptSrc: ['\'self\'', '\'unsafe-eval\''],
        },
      };

      const errors = service.validateConfig(configWithUnsafeEval);

      expect(errors).toEqual([]); // Should not error, just warn
    });

    it('should handle missing CSP configuration', () => {
      const configWithoutCsp = {};

      const errors = service.validateConfig(configWithoutCsp);

      expect(errors).toEqual([]);
    });

    it('should handle missing HSTS configuration', () => {
      const configWithoutHsts = {
        csp: {
          defaultSrc: ['\'self\''],
        },
      };

      const errors = service.validateConfig(configWithoutHsts);

      expect(errors).toEqual([]);
    });
  });

  describe('buildCSPDirective', () => {
    it('should build CSP directive from array of values', () => {
      const values = ['\'self\'', 'https://trusted.com', '\'unsafe-inline\''];
      const directive = (service as any).buildCSPDirective(values);

      expect(directive).toBe('\'self\' https://trusted.com \'unsafe-inline\'');
    });

    it('should handle empty array', () => {
      const directive = (service as any).buildCSPDirective([]);

      expect(directive).toBe('');
    });

    it('should handle single value', () => {
      const directive = (service as any).buildCSPDirective(['\'self\'']);

      expect(directive).toBe('\'self\'');
    });

    it('should filter out null/undefined values', () => {
      const values = ['\'self\'', null, 'https://trusted.com', undefined, '\'unsafe-inline\''];
      const directive = (service as any).buildCSPDirective(values);

      expect(directive).toBe('\'self\' https://trusted.com \'unsafe-inline\'');
    });
  });

  describe('buildCSPHeader', () => {
    it('should build complete CSP header from configuration', () => {
      const cspConfig = {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\'', 'https://cdn.example.com'],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:', 'https:'],
        connectSrc: ['\'self\''],
        fontSrc: ['\'self\''],
        objectSrc: ['\'none\''],
        mediaSrc: ['\'self\''],
        frameSrc: ['\'none\''],
        childSrc: ['\'none\''],
        frameAncestors: ['\'none\''],
        formAction: ['\'self\''],
        baseUri: ['\'self\''],
      };

      const cspHeader = (service as any).buildCSPHeader(cspConfig);

      expect(cspHeader).toContain('default-src \'self\'');
      expect(cspHeader).toContain('script-src \'self\' https://cdn.example.com');
      expect(cspHeader).toContain('style-src \'self\' \'unsafe-inline\'');
      expect(cspHeader).toContain('img-src \'self\' data: https:');
      expect(cspHeader).toContain('connect-src \'self\'');
      expect(cspHeader).toContain('font-src \'self\'');
      expect(cspHeader).toContain('object-src \'none\'');
      expect(cspHeader).toContain('media-src \'self\'');
      expect(cspHeader).toContain('frame-src \'none\'');
      expect(cspHeader).toContain('child-src \'none\'');
      expect(cspHeader).toContain('frame-ancestors \'none\'');
      expect(cspHeader).toContain('form-action \'self\'');
      expect(cspHeader).toContain('base-uri \'self\'');
    });

    it('should handle partial CSP configuration', () => {
      const partialCspConfig = {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\''],
      };

      const cspHeader = (service as any).buildCSPHeader(partialCspConfig);

      expect(cspHeader).toContain('default-src \'self\'');
      expect(cspHeader).toContain('script-src \'self\'');
      expect(cspHeader).not.toContain('style-src');
    });

    it('should handle empty CSP configuration', () => {
      const cspHeader = (service as any).buildCSPHeader({});

      expect(cspHeader).toBe('');
    });
  });

  describe('buildHSTSHeader', () => {
    it('should build HSTS header with all options', () => {
      const hstsConfig = {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      };

      const hstsHeader = (service as any).buildHSTSHeader(hstsConfig);

      expect(hstsHeader).toBe('max-age=31536000; includeSubDomains; preload');
    });

    it('should build HSTS header with only max-age', () => {
      const hstsConfig = {
        maxAge: 31536000,
      };

      const hstsHeader = (service as any).buildHSTSHeader(hstsConfig);

      expect(hstsHeader).toBe('max-age=31536000');
    });

    it('should build HSTS header with includeSubDomains only', () => {
      const hstsConfig = {
        maxAge: 31536000,
        includeSubDomains: true,
      };

      const hstsHeader = (service as any).buildHSTSHeader(hstsConfig);

      expect(hstsHeader).toBe('max-age=31536000; includeSubDomains');
    });

    it('should handle empty HSTS configuration', () => {
      const hstsHeader = (service as any).buildHSTSHeader({});

      expect(hstsHeader).toBe('max-age=0');
    });

    it('should handle missing HSTS configuration', () => {
      const hstsHeader = (service as any).buildHSTSHeader(null);

      expect(hstsHeader).toBe('max-age=0');
    });
  });

  describe('buildPermissionsPolicyHeader', () => {
    it('should build permissions policy header', () => {
      const permissionsConfig = {
        geolocation: [],
        midi: [],
        notifications: [],
        push: [],
        syncXhr: [],
        microphone: [],
        camera: [],
        magnetometer: [],
        gyroscope: [],
        fullscreen: ['\'self\''],
        payment: [],
      };

      const policyHeader = (service as any).buildPermissionsPolicyHeader(permissionsConfig);

      expect(policyHeader).toContain('geolocation=()');
      expect(policyHeader).toContain('midi=()');
      expect(policyHeader).toContain('notifications=()');
      expect(policyHeader).toContain('push=()');
      expect(policyHeader).toContain('sync-xhr=()');
      expect(policyHeader).toContain('microphone=()');
      expect(policyHeader).toContain('camera=()');
      expect(policyHeader).toContain('magnetometer=()');
      expect(policyHeader).toContain('gyroscope=()');
      expect(policyHeader).toContain('fullscreen=(\'self\')');
      expect(policyHeader).toContain('payment=()');
    });

    it('should handle empty permissions configuration', () => {
      const policyHeader = (service as any).buildPermissionsPolicyHeader({});

      expect(policyHeader).toBe('');
    });

    it('should handle missing permissions configuration', () => {
      const policyHeader = (service as any).buildPermissionsPolicyHeader(null);

      expect(policyHeader).toBe('');
    });
  });

  describe('error handling', () => {
    it('should handle malformed CSP configuration gracefully', () => {
      const malformedConfig = {
        csp: {
          defaultSrc: undefined,
          scriptSrc: undefined,
        },
      };

      expect(() => {
        service.getSecurityHeaders(malformedConfig);
      }).not.toThrow();
    });

    it('should handle malformed HSTS configuration gracefully', () => {
      const malformedConfig = {
        hsts: {
          maxAge: undefined as any,
          includeSubDomains: undefined as any,
        },
      };

      expect(() => {
        service.getSecurityHeaders(malformedConfig);
      }).not.toThrow();
    });
  });
});
