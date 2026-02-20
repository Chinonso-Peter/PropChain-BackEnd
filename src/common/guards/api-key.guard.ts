import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../../api-keys/api-key.service';
import { ApiQuotaService } from 'src/security/services/api-quota.service';
import { RateLimitingService } from 'src/security/services/rate-limiting.service';

@Injectable()
export class EnhancedApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedApiKeyGuard.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly apiQuotaService: ApiQuotaService,
    private readonly rateLimitingService: RateLimitingService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const apiKey = this.extractApiKey(request);

      if (!apiKey) {
        throw new UnauthorizedException('API key is required');
      }

      // 1. Validate API key
      const keyRecord = await this.apiKeyService.validateApiKey(apiKey);
      if (!keyRecord) {
        throw new UnauthorizedException('Invalid API key');
      }

      // 2. Check if key is active
      if (!keyRecord.isActive) {
        throw new ForbiddenException('API key is inactive');
      }

      // 3. Check expiration
      if (keyRecord.expiresAt && new Date() > new Date(keyRecord.expiresAt)) {
        throw new ForbiddenException('API key has expired');
      }

      // 4. Check quota
      const quotaCheck = await this.apiQuotaService.hasAvailableQuota(keyRecord.id);
      if (!quotaCheck.hasQuota) {
        throw new ForbiddenException(`Quota exceeded: ${quotaCheck.reason}`);
      }

      // 5. Check rate limit
      const rateLimitConfig = this.rateLimitingService.getDefaultConfigurations().api;
      const { allowed, info } = await this.rateLimitingService.checkRateLimit(`api:${keyRecord.id}`, rateLimitConfig);

      if (!allowed) {
        // Record the quota usage even if rate limited (this counts as a request)
        await this.apiQuotaService.recordUsage(keyRecord.id, keyRecord.userId);
        this.setRateLimitHeaders(request.res, info);
        throw new ForbiddenException('Rate limit exceeded');
      }

      // 6. Record usage
      await this.apiQuotaService.recordUsage(keyRecord.id, keyRecord.userId);

      // 7. Set rate limit headers
      this.setRateLimitHeaders(request.res, info);

      // 8. Attach key info to request
      request.apiKey = {
        id: keyRecord.id,
        name: keyRecord.name,
        userId: keyRecord.userId,
        scopes: keyRecord.scopes,
        quota: quotaCheck.quota,
      };

      return true;
    } catch (error) {
      this.logger.warn(`API key authentication failed: ${error.message}`);
      throw error;
    }
  }

  private extractApiKey(request: any): string | undefined {
    // Check header first
    let apiKey = request.headers['x-api-key'];

    // Check query parameter
    if (!apiKey) {
      apiKey = request.query.apiKey;
    }

    // Check body (for POST requests)
    if (!apiKey && request.body && request.body.apiKey) {
      apiKey = request.body.apiKey;
    }

    return apiKey;
  }

  private setRateLimitHeaders(response: any, info: any): void {
    if (response && response.setHeader) {
      response.setHeader('X-RateLimit-Limit', info.limit);
      response.setHeader('X-RateLimit-Remaining', info.remaining);
      response.setHeader('X-RateLimit-Reset', Math.floor(info.resetTime / 1000));
      response.setHeader('X-RateLimit-Window', info.window);
      response.setHeader('X-Quota-Daily-Limit', info.quota?.dailyLimit || 0);
      response.setHeader(
        'X-Quota-Daily-Remaining',
        Math.max(0, (info.quota?.dailyLimit || 0) - (info.quota?.currentDailyUsage || 0)),
      );
      response.setHeader('X-Quota-Monthly-Limit', info.quota?.monthlyLimit || 0);
      response.setHeader(
        'X-Quota-Monthly-Remaining',
        Math.max(0, (info.quota?.monthlyLimit || 0) - (info.quota?.currentMonthlyUsage || 0)),
      );
    }
  }
}

// Export alias for backward compatibility
export const ApiKeyGuard = EnhancedApiKeyGuard;
