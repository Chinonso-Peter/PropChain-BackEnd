import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CorsOptions } from 'cors';

export interface CorsOriginConfig {
  allowedOrigins: Array<string | RegExp>;
  allowCredentials: boolean;
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  maxAge?: number;
}

/**
 * CORS validation service for secure cross-origin request management
 * Provides environment-specific origin validation and dynamic origin checking
 */
@Injectable()
export class CorsValidationService {
  private readonly logger = new Logger(CorsValidationService.name);
  private readonly allowedOrigins: Array<string | RegExp>;
  private readonly isProduction: boolean;
  private readonly isStaging: boolean;
  private readonly isDevelopment: boolean;
  private readonly isTest: boolean;

  constructor(private configService: ConfigService) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.isStaging = this.configService.get('NODE_ENV') === 'staging';
    this.isDevelopment = this.configService.get('NODE_ENV') === 'development';
    this.isTest = this.configService.get('NODE_ENV') === 'test';

    // Parse and validate allowed origins
    const originsConfig = this.getConfiguredOrigins();
    this.allowedOrigins = this.parseAllowedOrigins(originsConfig);

    // Log configuration on startup
    this.logConfiguration();
  }

  getNestCorsOptions(): CorsOptions {
    const config = this.getCorsConfig();

    return {
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) {
          callback(null, true);
          return;
        }

        const allowed = this.isOriginAllowed(requestOrigin);
        if (!allowed) {
          this.logger.warn(`Blocked CORS request from unauthorized origin: ${requestOrigin}`);
        }

        callback(null, allowed);
      },
      credentials: config.allowCredentials,
      methods: config.allowedMethods,
      allowedHeaders: config.allowedHeaders,
      exposedHeaders: config.exposedHeaders,
      maxAge: config.maxAge,
      optionsSuccessStatus: 204,
      preflightContinue: false,
    };
  }

  /**
   * Get CORS configuration based on environment
   */
  getCorsConfig(): CorsOriginConfig {
    if (this.isProduction || this.isStaging) {
      return this.getProductionCorsConfig();
    } else if (this.isTest) {
      return this.getTestCorsConfig();
    } else {
      return this.getDevelopmentCorsConfig();
    }
  }

  /**
   * Validate if an origin is allowed
   */
  isOriginAllowed(origin: string): boolean {
    if (!origin) {
      return true;
    }

    const normalizedOrigin = this.normalizeOrigin(origin);
    return this.allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin === '*') {
        return !this.isProduction && !this.isStaging;
      }

      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(normalizedOrigin);
      }

      return this.normalizeOrigin(allowedOrigin) === normalizedOrigin;
    });
  }

  /**
   * Dynamic origin validator for NestJS CORS
   * Returns true if origin should be allowed, false otherwise
   */
  getOriginValidator(): (origin: string) => boolean {
    return (origin: string) => {
      return this.isOriginAllowed(origin);
    };
  }

  /**
   * Validate CORS configuration for security issues
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Production must have explicit origins configured
    if (this.isProduction || this.isStaging) {
      if (this.allowedOrigins.length === 0) {
        errors.push('CORS_ALLOWED_ORIGINS or CORS_ORIGIN must be configured in production/staging');
      }

      // Check for wildcard in production
      if (this.allowedOrigins.some(origin => origin === '*')) {
        errors.push('Wildcard (*) CORS origin is not allowed in production/staging');
      }

      // Validate each origin URL format
      for (const origin of this.allowedOrigins) {
        if (origin instanceof RegExp) {
          continue;
        }

        if (!this.isValidOriginUrl(origin)) {
          errors.push(`Invalid origin URL format: ${origin}`);
        }

        // Warn about insecure origins in production
        if (origin.startsWith('http://') && !origin.includes('localhost')) {
          this.logger.warn(`Insecure HTTP origin detected in production: ${origin}. Consider using HTTPS.`);
        }
      }
    }

    // Development warnings
    if (this.isDevelopment) {
      if (this.allowedOrigins.some(origin => origin === '*')) {
        this.logger.warn(
          'CORS wildcard (*) is enabled in development. This is acceptable for local development but should be disabled in production.',
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get statistics about CORS configuration
   */
  getStats(): {
    totalOrigins: number;
    isProduction: boolean;
    isWildcard: boolean;
    hasLocalhost: boolean;
  } {
    return {
      totalOrigins: this.allowedOrigins.length,
      isProduction: this.isProduction,
      isWildcard: this.allowedOrigins.some(origin => origin === '*'),
      hasLocalhost: this.allowedOrigins.some(origin =>
        typeof origin === 'string' ? origin.includes('localhost') || origin.includes('127.0.0.1') : false,
      ),
    };
  }

  /**
   * Production CORS configuration - strict security
   */
  private getProductionCorsConfig(): CorsOriginConfig {
    const validation = this.validateConfig();

    if (!validation.isValid) {
      this.logger.error('Production CORS configuration is invalid:', validation.errors.join(', '), {});
      throw new BadRequestException(`Invalid CORS configuration: ${validation.errors.join(', ')}`);
    }

    return {
      allowedOrigins: [...this.allowedOrigins],
      allowCredentials: this.configService.get<boolean>('CORS_CREDENTIALS_ENABLED', true),
      allowedMethods: this.configService.get<string[]>('CORS_ALLOWED_METHODS', [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS',
      ]),
      allowedHeaders: this.configService.get<string[]>('CORS_ALLOWED_HEADERS', [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'x-correlation-id',
        'Accept-Version',
      ]),
      exposedHeaders: this.configService.get<string[]>('CORS_EXPOSED_HEADERS', [
        'x-correlation-id',
        'x-request-id',
        'Retry-After',
      ]),
      maxAge: this.configService.get<number>('CORS_MAX_AGE', 86400), // 24 hours
    };
  }

  /**
   * Development CORS configuration - permissive for local testing
   */
  private getDevelopmentCorsConfig(): CorsOriginConfig {
    // If specific origins are configured, use them
    if (this.allowedOrigins.length > 0 && !this.allowedOrigins.some(origin => origin === '*')) {
      return {
        allowedOrigins: [...this.allowedOrigins],
        allowCredentials: true,
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'Accept-Version'],
        exposedHeaders: ['x-correlation-id', 'x-request-id'],
        maxAge: 3600, // 1 hour
      };
    }

    // Otherwise, use permissive development config
    return {
      allowedOrigins: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
      allowCredentials: true,
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'Accept-Version'],
      exposedHeaders: ['x-correlation-id', 'x-request-id'],
      maxAge: 3600,
    };
  }

  /**
   * Test CORS configuration - minimal restrictions
   */
  private getTestCorsConfig(): CorsOriginConfig {
    return {
      allowedOrigins: ['*'],
      allowCredentials: false,
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id'],
      exposedHeaders: ['x-correlation-id'],
      maxAge: 3600,
    };
  }

  /**
   * Parse allowed origins from configuration string
   */
  private parseAllowedOrigins(originsConfig: string): Array<string | RegExp> {
    const origins: Array<string | RegExp> = [];

    if (!originsConfig || originsConfig.trim() === '') {
      return origins;
    }

    // Split by comma and trim whitespace
    const originList = originsConfig.split(',').map(o => o.trim());

    for (const origin of originList) {
      if (origin && origin !== '*') {
        // Remove trailing slashes
        const normalizedOrigin = this.normalizeOrigin(origin);
        if (!origins.includes(normalizedOrigin)) {
          origins.push(normalizedOrigin);
        }
      } else if (origin === '*' && !this.isProduction && !this.isStaging) {
        // Only allow wildcard in non-production
        origins.push('*');
      }
    }

    return origins;
  }

  private getConfiguredOrigins(): string {
    return this.configService.get<string>('CORS_ALLOWED_ORIGINS') || this.configService.get<string>('CORS_ORIGIN', '');
  }

  private normalizeOrigin(origin: string): string {
    return origin.replace(/\/$/, '');
  }

  /**
   * Validate origin URL format
   */
  private isValidOriginUrl(origin: string): boolean {
    try {
      const url = new URL(origin);
      // Must be http or https
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Log CORS configuration on startup
   */
  private logConfiguration(): void {
    const stats = this.getStats();

    if (this.isProduction || this.isStaging) {
      this.logger.log(`🔒 Production-like CORS configured with ${stats.totalOrigins} allowed origin(s)`);
      if (stats.totalOrigins > 0) {
        this.logger.debug(`Allowed origins: ${this.describeAllowedOrigins()}`);
      }
    } else if (this.isDevelopment) {
      if (stats.isWildcard) {
        this.logger.warn('⚠️  Development CORS: Wildcard (*) enabled - OK for local development');
      } else {
        this.logger.log(`🔧 Development CORS configured with ${stats.totalOrigins} allowed origin(s)`);
      }
    } else {
      this.logger.log(`🧪 Test CORS configured`);
    }
  }

  private describeAllowedOrigins(): string {
    return this.allowedOrigins
      .map(origin => (origin instanceof RegExp ? origin.toString() : origin))
      .join(', ');
  }
}
