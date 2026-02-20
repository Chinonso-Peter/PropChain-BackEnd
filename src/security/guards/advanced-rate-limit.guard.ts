import { Injectable, CanActivate, ExecutionContext, Logger, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitingService } from '../../security/services/rate-limiting.service';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
  skipIf?: (context: ExecutionContext) => boolean | Promise<boolean>;
}

@Injectable()
export class AdvancedRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdvancedRateLimitGuard.name);

  constructor(
    private readonly rateLimitingService: RateLimitingService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();

      // Get rate limit options from decorator or use defaults
      const options = this.reflector.get<RateLimitOptions>('rateLimitOptions', context.getHandler()) || {};

      // Check if we should skip rate limiting
      if (options.skipIf && (await options.skipIf(context))) {
        return true;
      }

      // Generate rate limit key
      const key = this.generateKey(request, context);

      // Get configuration
      const config = {
        windowMs: options.windowMs || 60000, // 1 minute default
        maxRequests: options.maxRequests || 100, // 100 requests default
        keyPrefix: options.keyPrefix || 'api',
      };

      // Check rate limit
      const { allowed, info } = await this.rateLimitingService.checkRateLimit(key, config);

      // Set rate limit headers
      this.setRateLimitHeaders(request.res, info);

      if (!allowed) {
        this.logger.warn(`Rate limit exceeded for key: ${key}`);
        // You can throw an exception here or return false
        // For now, we'll return false to block the request
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Rate limit check failed:', error);
      // Fail open - allow request if rate limiting service fails
      return true;
    }
  }

  private generateKey(request: any, context: ExecutionContext): string {
    // Try to get user ID first
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    // Try to get API key
    const apiKey = request.headers['x-api-key'] || request.query.apiKey;
    if (apiKey) {
      return `api:${apiKey}`;
    }

    // Fall back to IP address
    const ip = this.getClientIp(request);
    return `ip:${ip}`;
  }

  private getClientIp(request: any): string {
    // Handle reverse proxy headers
    return (
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      (request.connection?.socket ? request.connection.socket.remoteAddress : null) ||
      'unknown'
    );
  }

  private setRateLimitHeaders(response: any, info: any): void {
    if (response && response.setHeader) {
      response.setHeader('X-RateLimit-Limit', info.limit);
      response.setHeader('X-RateLimit-Remaining', info.remaining);
      response.setHeader('X-RateLimit-Reset', Math.floor(info.resetTime / 1000));
      response.setHeader('X-RateLimit-Window', info.window);
    }
  }
}
