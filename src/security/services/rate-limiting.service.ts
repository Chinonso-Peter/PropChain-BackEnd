import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests allowed in window
  keyPrefix?: string; // Redis key prefix
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
  window: number;
}

@Injectable()
export class RateLimitingService {
  private readonly logger = new Logger(RateLimitingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Check if a request is within rate limits
   * @param key Unique identifier (IP, user ID, API key)
   * @param config Rate limit configuration
   * @returns Rate limit info and whether request is allowed
   */
  async checkRateLimit(key: string, config: RateLimitConfig): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    try {
      const redisKey = `${config.keyPrefix || 'rate_limit'}:${key}`;
      const currentTime = Date.now();
      const windowStart = currentTime - config.windowMs;

      // Remove expired entries
      await this.redisService.getRedisInstance().zremrangebyscore(redisKey, 0, windowStart);

      // Get current count
      const currentCount = await this.redisService.getRedisInstance().zcard(redisKey);

      // Check if limit exceeded
      const allowed = currentCount < config.maxRequests;

      // Add current request timestamp if allowed
      if (allowed) {
        await this.redisService.getRedisInstance().zadd(redisKey, currentTime, currentTime.toString());
        // Set expiration to clean up old data
        await this.redisService.expire(redisKey, Math.ceil(config.windowMs / 1000) + 60);
      }

      const info: RateLimitInfo = {
        remaining: Math.max(0, config.maxRequests - currentCount - (allowed ? 1 : 0)),
        resetTime: currentTime + config.windowMs,
        limit: config.maxRequests,
        window: config.windowMs,
      };

      return { allowed, info };
    } catch (error) {
      this.logger.error(`Rate limit check failed for key ${key}:`, error);
      // Fail open - allow request if Redis is unavailable
      return {
        allowed: true,
        info: {
          remaining: config.maxRequests,
          resetTime: Date.now() + config.windowMs,
          limit: config.maxRequests,
          window: config.windowMs,
        },
      };
    }
  }

  /**
   * Get rate limit information without consuming a request
   */
  async getRateLimitInfo(key: string, config: RateLimitConfig): Promise<RateLimitInfo> {
    try {
      const redisKey = `${config.keyPrefix || 'rate_limit'}:${key}`;
      const currentTime = Date.now();
      const windowStart = currentTime - config.windowMs;

      // Remove expired entries
      await this.redisService.getRedisInstance().zremrangebyscore(redisKey, 0, windowStart);

      // Get current count
      const currentCount = await this.redisService.getRedisInstance().zcard(redisKey);

      return {
        remaining: Math.max(0, config.maxRequests - currentCount),
        resetTime: currentTime + config.windowMs,
        limit: config.maxRequests,
        window: config.windowMs,
      };
    } catch (error) {
      this.logger.error(`Failed to get rate limit info for key ${key}:`, error);
      return {
        remaining: config.maxRequests,
        resetTime: Date.now() + config.windowMs,
        limit: config.maxRequests,
        window: config.windowMs,
      };
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetRateLimit(key: string, prefix?: string): Promise<void> {
    try {
      const redisKey = `${prefix || 'rate_limit'}:${key}`;
      await this.redisService.del(redisKey);
      this.logger.log(`Rate limit reset for key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to reset rate limit for key ${key}:`, error);
    }
  }

  /**
   * Get default configurations for different use cases
   */
  getDefaultConfigurations() {
    return {
      // Standard API rate limiting
      api: {
        windowMs: 60000, // 1 minute
        maxRequests: this.configService.get<number>('RATE_LIMIT_API_PER_MINUTE', 100),
        keyPrefix: 'api_rate_limit',
      },
      // Auth endpoints (stricter)
      auth: {
        windowMs: 60000, // 1 minute
        maxRequests: this.configService.get<number>('RATE_LIMIT_AUTH_PER_MINUTE', 5),
        keyPrefix: 'auth_rate_limit',
      },
      // Expensive operations (very strict)
      expensive: {
        windowMs: 60000, // 1 minute
        maxRequests: this.configService.get<number>('RATE_LIMIT_EXPENSIVE_PER_MINUTE', 10),
        keyPrefix: 'expensive_rate_limit',
      },
      // User-based rate limiting
      user: {
        windowMs: 3600000, // 1 hour
        maxRequests: this.configService.get<number>('RATE_LIMIT_USER_PER_HOUR', 1000),
        keyPrefix: 'user_rate_limit',
      },
    };
  }
}
