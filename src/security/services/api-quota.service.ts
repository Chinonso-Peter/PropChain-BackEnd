import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';

export interface ApiQuota {
  apiKeyId: string;
  userId?: string;
  plan: string;
  dailyLimit: number;
  monthlyLimit: number;
  currentDailyUsage: number;
  currentMonthlyUsage: number;
  lastReset: Date;
  expiresAt?: Date;
}

export interface QuotaPlan {
  name: string;
  dailyLimit: number;
  monthlyLimit: number;
  price?: number;
}

@Injectable()
export class ApiQuotaService {
  private readonly logger = new Logger(ApiQuotaService.name);
  private readonly QUOTA_KEY_PREFIX = 'api_quota';
  private readonly USAGE_KEY_PREFIX = 'api_usage';
  private readonly DAILY_RESET_HOUR = 0; // Reset at midnight UTC

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get quota information for an API key
   */
  async getQuota(apiKeyId: string): Promise<ApiQuota | null> {
    try {
      const quotaKey = `${this.QUOTA_KEY_PREFIX}:${apiKeyId}`;
      const quotaData = await this.redisService.get(quotaKey);

      if (!quotaData) {
        return null;
      }

      const quota = JSON.parse(quotaData) as ApiQuota;

      // Update current usage
      quota.currentDailyUsage = await this.getCurrentDailyUsage(apiKeyId);
      quota.currentMonthlyUsage = await this.getCurrentMonthlyUsage(apiKeyId);

      return quota;
    } catch (error) {
      this.logger.error(`Failed to get quota for API key ${apiKeyId}:`, error);
      return null;
    }
  }

  /**
   * Check if API key has available quota
   */
  async hasAvailableQuota(apiKeyId: string): Promise<{
    hasQuota: boolean;
    quota?: ApiQuota;
    reason?: string;
  }> {
    try {
      const quota = await this.getQuota(apiKeyId);

      if (!quota) {
        return { hasQuota: false, reason: 'No quota found for API key' };
      }

      // Check if quota has expired
      if (quota.expiresAt && new Date() > new Date(quota.expiresAt)) {
        return { hasQuota: false, reason: 'Quota has expired' };
      }

      // Check daily limit
      if (quota.currentDailyUsage >= quota.dailyLimit) {
        return { hasQuota: false, quota, reason: 'Daily quota exceeded' };
      }

      // Check monthly limit
      if (quota.currentMonthlyUsage >= quota.monthlyLimit) {
        return { hasQuota: false, quota, reason: 'Monthly quota exceeded' };
      }

      return { hasQuota: true, quota };
    } catch (error) {
      this.logger.error(`Failed to check quota for API key ${apiKeyId}:`, error);
      return { hasQuota: false, reason: 'Quota check failed' };
    }
  }

  /**
   * Record API usage
   */
  async recordUsage(apiKeyId: string, userId?: string): Promise<boolean> {
    try {
      const today = this.getTodayString();
      const currentMonth = this.getCurrentMonthString();

      const dailyUsageKey = `${this.USAGE_KEY_PREFIX}:${apiKeyId}:daily:${today}`;
      const monthlyUsageKey = `${this.USAGE_KEY_PREFIX}:${apiKeyId}:monthly:${currentMonth}`;

      // Increment counters
      await this.redisService.getRedisInstance().incr(dailyUsageKey);
      await this.redisService.getRedisInstance().incr(monthlyUsageKey);

      // Set expiration (keep daily data for 2 days, monthly for 32 days)
      await this.redisService.expire(dailyUsageKey, 172800); // 2 days
      await this.redisService.expire(monthlyUsageKey, 2764800); // 32 days

      // Update quota if it exists
      const quota = await this.getQuota(apiKeyId);
      if (quota) {
        quota.currentDailyUsage++;
        quota.currentMonthlyUsage++;
        await this.updateQuota(quota);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to record usage for API key ${apiKeyId}:`, error);
      return false;
    }
  }

  /**
   * Create or update quota for an API key
   */
  async setQuota(apiKeyId: string, plan: string, userId?: string, expiresAt?: Date): Promise<ApiQuota> {
    try {
      const planConfig = this.getPlanConfig(plan);

      const quota: ApiQuota = {
        apiKeyId,
        userId,
        plan,
        dailyLimit: planConfig.dailyLimit,
        monthlyLimit: planConfig.monthlyLimit,
        currentDailyUsage: await this.getCurrentDailyUsage(apiKeyId),
        currentMonthlyUsage: await this.getCurrentMonthlyUsage(apiKeyId),
        lastReset: new Date(),
        expiresAt,
      };

      const quotaKey = `${this.QUOTA_KEY_PREFIX}:${apiKeyId}`;
      await this.redisService.setex(quotaKey, this.getQuotaExpirationSeconds(), JSON.stringify(quota));

      this.logger.log(`Quota set for API key ${apiKeyId}: ${plan}`);
      return quota;
    } catch (error) {
      this.logger.error(`Failed to set quota for API key ${apiKeyId}:`, error);
      throw error;
    }
  }

  /**
   * Update existing quota
   */
  async updateQuota(quota: ApiQuota): Promise<void> {
    try {
      const quotaKey = `${this.QUOTA_KEY_PREFIX}:${quota.apiKeyId}`;
      await this.redisService.setex(quotaKey, this.getQuotaExpirationSeconds(), JSON.stringify(quota));
    } catch (error) {
      this.logger.error(`Failed to update quota for API key ${quota.apiKeyId}:`, error);
    }
  }

  /**
   * Reset daily usage counters
   */
  async resetDailyUsage(): Promise<void> {
    try {
      const pattern = `${this.USAGE_KEY_PREFIX}:*:daily:${this.getTodayString()}`;
      const keys = await this.redisService.keys(pattern);

      for (const key of keys) {
        await this.redisService.del(key);
      }

      // Update quota lastReset times
      const quotaPattern = `${this.QUOTA_KEY_PREFIX}:*`;
      const quotaKeys = await this.redisService.keys(quotaPattern);

      for (const key of quotaKeys) {
        const quotaData = await this.redisService.get(key);
        if (quotaData) {
          const quota = JSON.parse(quotaData) as ApiQuota;
          quota.lastReset = new Date();
          quota.currentDailyUsage = 0;
          await this.updateQuota(quota);
        }
      }

      this.logger.log('Daily usage counters reset');
    } catch (error) {
      this.logger.error('Failed to reset daily usage:', error);
    }
  }

  /**
   * Reset monthly usage counters
   */
  async resetMonthlyUsage(): Promise<void> {
    try {
      const currentMonth = this.getCurrentMonthString();
      const pattern = `${this.USAGE_KEY_PREFIX}:*:monthly:${currentMonth}`;
      const keys = await this.redisService.keys(pattern);

      for (const key of keys) {
        await this.redisService.del(key);
      }

      // Update quota monthly usage
      const quotaPattern = `${this.QUOTA_KEY_PREFIX}:*`;
      const quotaKeys = await this.redisService.keys(quotaPattern);

      for (const key of quotaKeys) {
        const quotaData = await this.redisService.get(key);
        if (quotaData) {
          const quota = JSON.parse(quotaData) as ApiQuota;
          quota.currentMonthlyUsage = 0;
          await this.updateQuota(quota);
        }
      }

      this.logger.log('Monthly usage counters reset');
    } catch (error) {
      this.logger.error('Failed to reset monthly usage:', error);
    }
  }

  /**
   * Get all quotas
   */
  async getAllQuotas(): Promise<ApiQuota[]> {
    try {
      const pattern = `${this.QUOTA_KEY_PREFIX}:*`;
      const keys = await this.redisService.keys(pattern);
      const quotas: ApiQuota[] = [];

      for (const key of keys) {
        const quotaData = await this.redisService.get(key);
        if (quotaData) {
          const quota = JSON.parse(quotaData) as ApiQuota;
          quota.currentDailyUsage = await this.getCurrentDailyUsage(quota.apiKeyId);
          quota.currentMonthlyUsage = await this.getCurrentMonthlyUsage(quota.apiKeyId);
          quotas.push(quota);
        }
      }

      return quotas;
    } catch (error) {
      this.logger.error('Failed to get all quotas:', error);
      return [];
    }
  }

  /**
   * Remove quota for an API key
   */
  async removeQuota(apiKeyId: string): Promise<void> {
    try {
      const quotaKey = `${this.QUOTA_KEY_PREFIX}:${apiKeyId}`;
      await this.redisService.del(quotaKey);

      // Also remove usage data
      const usagePattern = `${this.USAGE_KEY_PREFIX}:${apiKeyId}:*`;
      const usageKeys = await this.redisService.keys(usagePattern);
      for (const key of usageKeys) {
        await this.redisService.del(key);
      }

      this.logger.log(`Quota removed for API key ${apiKeyId}`);
    } catch (error) {
      this.logger.error(`Failed to remove quota for API key ${apiKeyId}:`, error);
    }
  }

  /**
   * Get available quota plans
   */
  getAvailablePlans(): QuotaPlan[] {
    return [
      {
        name: 'free',
        dailyLimit: 100,
        monthlyLimit: 1000,
      },
      {
        name: 'basic',
        dailyLimit: 1000,
        monthlyLimit: 10000,
        price: 29,
      },
      {
        name: 'pro',
        dailyLimit: 10000,
        monthlyLimit: 100000,
        price: 99,
      },
      {
        name: 'enterprise',
        dailyLimit: 100000,
        monthlyLimit: 1000000,
        price: 499,
      },
    ];
  }

  /**
   * Get plan configuration
   */
  private getPlanConfig(plan: string): QuotaPlan {
    const plans = this.getAvailablePlans();
    const planConfig = plans.find(p => p.name === plan);

    if (!planConfig) {
      throw new Error(`Unknown plan: ${plan}`);
    }

    return planConfig;
  }

  /**
   * Get current daily usage
   */
  private async getCurrentDailyUsage(apiKeyId: string): Promise<number> {
    try {
      const today = this.getTodayString();
      const usageKey = `${this.USAGE_KEY_PREFIX}:${apiKeyId}:daily:${today}`;
      const usage = await this.redisService.get(usageKey);
      return usage ? parseInt(usage, 10) : 0;
    } catch (error) {
      this.logger.error(`Failed to get daily usage for ${apiKeyId}:`, error);
      return 0;
    }
  }

  /**
   * Get current monthly usage
   */
  private async getCurrentMonthlyUsage(apiKeyId: string): Promise<number> {
    try {
      const currentMonth = this.getCurrentMonthString();
      const usageKey = `${this.USAGE_KEY_PREFIX}:${apiKeyId}:monthly:${currentMonth}`;
      const usage = await this.redisService.get(usageKey);
      return usage ? parseInt(usage, 10) : 0;
    } catch (error) {
      this.logger.error(`Failed to get monthly usage for ${apiKeyId}:`, error);
      return 0;
    }
  }

  /**
   * Get today's date string (YYYY-MM-DD)
   */
  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get current month string (YYYY-MM)
   */
  private getCurrentMonthString(): string {
    return new Date().toISOString().slice(0, 7);
  }

  /**
   * Get quota expiration in seconds (1 year)
   */
  private getQuotaExpirationSeconds(): number {
    return 31536000; // 1 year
  }
}
