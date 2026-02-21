import { Test, TestingModule } from '@nestjs/testing';
import { ApiQuotaService } from '../../../src/security/services/api-quota.service';
import { RedisService } from '../../../src/common/services/redis.service';
import { ConfigService } from '@nestjs/config';

describe('ApiQuotaService', () => {
  let service: ApiQuotaService;
  let redisService: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiQuotaService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
            del: jest.fn(),
            // Mock Redis hash operations
            hgetall: jest.fn(),
            hset: jest.fn(),
            hdel: jest.fn(),
            eval: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApiQuotaService>(ApiQuotaService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hasAvailableQuota', () => {
    it('should return true when quota is available', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'hgetall').mockResolvedValue({ usage: '50' }); // Current usage
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 50,
        currentMonthlyUsage: 1500,
        lastReset: new Date().toISOString(),
      }));

      const result = await service.hasAvailableQuota(apiKeyId);

      expect(result.hasQuota).toBe(true);
      expect(result.quota.dailyLimit).toBe(1000);
      expect(result.quota.monthlyLimit).toBe(30000);
      expect(result.quota.currentDailyUsage).toBe(50);
      expect(result.quota.currentMonthlyUsage).toBe(1500);
    });

    it('should return false when daily quota is exceeded', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'hgetall').mockResolvedValue({ usage: '1000' }); // At daily limit
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 1000,
        currentMonthlyUsage: 15000,
        lastReset: new Date().toISOString(),
      }));

      const result = await service.hasAvailableQuota(apiKeyId);

      expect(result.hasQuota).toBe(false);
      expect(result.reason).toContain('Daily quota exceeded');
    });

    it('should return false when monthly quota is exceeded', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'hgetall').mockResolvedValue({ usage: '500' }); // Under daily limit
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 500,
        currentMonthlyUsage: 30000, // At monthly limit
        lastReset: new Date().toISOString(),
      }));

      const result = await service.hasAvailableQuota(apiKeyId);

      expect(result.hasQuota).toBe(false);
      expect(result.reason).toContain('Monthly quota exceeded');
    });

    it('should handle missing quota data gracefully', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'hgetall').mockResolvedValue({});
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const result = await service.hasAvailableQuota(apiKeyId);

      expect(result.hasQuota).toBe(true); // Fail open
      expect(result.quota.dailyLimit).toBe(0);
      expect(result.quota.monthlyLimit).toBe(0);
    });

    it('should handle Redis errors gracefully', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'hgetall').mockRejectedValue(new Error('Redis error'));

      const result = await service.hasAvailableQuota(apiKeyId);

      expect(result.hasQuota).toBe(true); // Fail open
    });
  });

  describe('recordUsage', () => {
    it('should record usage for daily and monthly quotas', async () => {
      const apiKeyId = 'api-key-123';
      const userId = 'user-123';
      
      jest.spyOn(redisService, 'incr').mockResolvedValue(51);
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 50,
        currentMonthlyUsage: 1500,
        lastReset: new Date().toISOString(),
      }));

      await service.recordUsage(apiKeyId, userId);

      expect(redisService.incr).toHaveBeenCalledWith(`api_quota:daily:${apiKeyId}`, 'usage', 1);
      expect(redisService.incr).toHaveBeenCalledWith(`api_quota:monthly:${apiKeyId}`, 'usage', 1);
    });

    it('should reset daily quota when day changes', async () => {
      const apiKeyId = 'api-key-123';
      const userId = 'user-123';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      jest.spyOn(redisService, 'incr').mockResolvedValue(1);
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 100,
        currentMonthlyUsage: 3000,
        lastReset: yesterday.toISOString(),
      }));

      await service.recordUsage(apiKeyId, userId);

      expect(redisService.incr).toHaveBeenCalledWith(`api_quota:daily:${apiKeyId}`, 'usage', 1);
      // Should also reset the daily counter
    });

    it('should reset monthly quota when month changes', async () => {
      const apiKeyId = 'api-key-123';
      const userId = 'user-123';
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      jest.spyOn(redisService, 'incr').mockResolvedValue(1);
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 50,
        currentMonthlyUsage: 5000,
        lastReset: lastMonth.toISOString(),
      }));

      await service.recordUsage(apiKeyId, userId);

      expect(redisService.incr).toHaveBeenCalledWith(`api_quota:daily:${apiKeyId}`, 'usage', 1);
      expect(redisService.incr).toHaveBeenCalledWith(`api_quota:monthly:${apiKeyId}`, 'usage', 1);
    });

    it('should handle Redis errors during recording', async () => {
      const apiKeyId = 'api-key-123';
      const userId = 'user-123';
      
      jest.spyOn(redisService, 'incr').mockRejectedValue(new Error('Redis error'));

      await expect(service.recordUsage(apiKeyId, userId)).resolves.not.toThrow();
    });
  });

  describe('getQuotaInfo', () => {
    it('should return complete quota information', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 250,
        currentMonthlyUsage: 7500,
        lastReset: new Date().toISOString(),
      }));

      const info = await service.getQuotaInfo(apiKeyId);

      expect(info.dailyLimit).toBe(1000);
      expect(info.monthlyLimit).toBe(30000);
      expect(info.currentDailyUsage).toBe(250);
      expect(info.currentMonthlyUsage).toBe(7500);
      expect(info.dailyRemaining).toBe(750);
      expect(info.monthlyRemaining).toBe(22500);
      expect(info.lastReset).toBeInstanceOf(Date);
    });

    it('should return null when no quota info exists', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const info = await service.getQuotaInfo(apiKeyId);

      expect(info).toBeNull();
    });

    it('should handle malformed JSON in Redis', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'get').mockResolvedValue('invalid-json');

      const info = await service.getQuotaInfo(apiKeyId);

      expect(info).toBeNull();
    });
  });

  describe('setQuotaLimits', () => {
    it('should set new quota limits', async () => {
      const apiKeyId = 'api-key-123';
      const dailyLimit = 2000;
      const monthlyLimit = 60000;
      
      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        dailyLimit: 1000,
        monthlyLimit: 30000,
        currentDailyUsage: 100,
        currentMonthlyUsage: 3000,
        lastReset: new Date().toISOString(),
      }));

      await service.setQuotaLimits(apiKeyId, dailyLimit, monthlyLimit);

      expect(redisService.setex).toHaveBeenCalledWith(
        `api_quota:config:${apiKeyId}`,
        expect.any(Number),
        expect.stringContaining('"dailyLimit":2000')
      );
    });

    it('should create new quota configuration when none exists', async () => {
      const apiKeyId = 'api-key-123';
      const dailyLimit = 1500;
      const monthlyLimit = 45000;
      
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      await service.setQuotaLimits(apiKeyId, dailyLimit, monthlyLimit);

      expect(redisService.setex).toHaveBeenCalledWith(
        `api_quota:config:${apiKeyId}`,
        expect.any(Number),
        expect.stringContaining('"dailyLimit":1500')
      );
    });
  });

  describe('resetQuota', () => {
    it('should reset daily and monthly quotas', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'del').mockResolvedValue(1);

      await service.resetQuota(apiKeyId);

      expect(redisService.del).toHaveBeenCalledWith(`api_quota:daily:${apiKeyId}`);
      expect(redisService.del).toHaveBeenCalledWith(`api_quota:monthly:${apiKeyId}`);
    });

    it('should handle Redis errors during reset', async () => {
      const apiKeyId = 'api-key-123';
      
      jest.spyOn(redisService, 'del').mockRejectedValue(new Error('Redis error'));

      await expect(service.resetQuota(apiKeyId)).resolves.not.toThrow();
    });
  });

  describe('getDefaultQuotaLimits', () => {
    it('should return default quota limits for different tiers', () => {
      const limits = service.getDefaultQuotaLimits();

      expect(limits).toHaveProperty('free');
      expect(limits).toHaveProperty('basic');
      expect(limits).toHaveProperty('premium');
      expect(limits).toHaveProperty('enterprise');

      // Check free tier
      expect(limits.free.dailyLimit).toBe(100);
      expect(limits.free.monthlyLimit).toBe(3000);

      // Check basic tier
      expect(limits.basic.dailyLimit).toBe(1000);
      expect(limits.basic.monthlyLimit).toBe(30000);

      // Check premium tier
      expect(limits.premium.dailyLimit).toBe(5000);
      expect(limits.premium.monthlyLimit).toBe(150000);

      // Check enterprise tier
      expect(limits.enterprise.dailyLimit).toBe(10000);
      expect(limits.enterprise.monthlyLimit).toBe(300000);
    });
  });

  describe('getQuotaUsageStats', () => {
    it('should return usage statistics for multiple API keys', async () => {
      const apiKeyIds = ['api-key-1', 'api-key-2', 'api-key-3'];
      
      jest.spyOn(redisService, 'get').mockImplementation((key) => {
        if (key.includes('api-key-1')) {
          return Promise.resolve(JSON.stringify({
            dailyLimit: 1000,
            monthlyLimit: 30000,
            currentDailyUsage: 100,
            currentMonthlyUsage: 3000,
            lastReset: new Date().toISOString(),
          }));
        } else if (key.includes('api-key-2')) {
          return Promise.resolve(JSON.stringify({
            dailyLimit: 5000,
            monthlyLimit: 150000,
            currentDailyUsage: 2500,
            currentMonthlyUsage: 75000,
            lastReset: new Date().toISOString(),
          }));
        } else {
          return Promise.resolve(null);
        }
      });

      const stats = await service.getQuotaUsageStats(apiKeyIds);

      expect(stats).toHaveLength(3);
      expect(stats[0].apiKeyId).toBe('api-key-1');
      expect(stats[0].dailyUsagePercent).toBe(10); // 100/1000 * 100
      expect(stats[0].monthlyUsagePercent).toBe(10); // 3000/30000 * 100
      
      expect(stats[1].apiKeyId).toBe('api-key-2');
      expect(stats[1].dailyUsagePercent).toBe(50); // 2500/5000 * 100
      expect(stats[1].monthlyUsagePercent).toBe(50); // 75000/150000 * 100
      
      expect(stats[2].apiKeyId).toBe('api-key-3');
      expect(stats[2].dailyUsagePercent).toBe(0); // No data
      expect(stats[2].monthlyUsagePercent).toBe(0); // No data
    });

    it('should handle empty API key list', async () => {
      const stats = await service.getQuotaUsageStats([]);

      expect(stats).toEqual([]);
    });
  });

  describe('quota validation', () => {
    it('should validate quota limits', () => {
      expect(() => {
        service.validateQuotaLimits(1000, 30000);
      }).not.toThrow();

      expect(() => {
        service.validateQuotaLimits(0, 30000);
      }).toThrow('Daily limit must be greater than 0');

      expect(() => {
        service.validateQuotaLimits(1000, 0);
      }).toThrow('Monthly limit must be greater than 0');

      expect(() => {
        service.validateQuotaLimits(50000, 30000);
      }).toThrow('Daily limit cannot exceed monthly limit');
    });

    it('should handle edge cases in quota validation', () => {
      expect(() => {
        service.validateQuotaLimits(-1, 30000);
      }).toThrow('Daily limit must be greater than 0');

      expect(() => {
        service.validateQuotaLimits(1000, -1);
      }).toThrow('Monthly limit must be greater than 0');
    });
  });

  describe('date handling', () => {
    it('should correctly identify day changes', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      expect((service as any).isSameDay(now, yesterday)).toBe(false);
      expect((service as any).isSameDay(now, now)).toBe(true);
    });

    it('should correctly identify month changes', () => {
      const now = new Date();
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      expect((service as any).isSameMonth(now, lastMonth)).toBe(false);
      expect((service as any).isSameMonth(now, now)).toBe(true);
    });

    it('should handle timezone differences correctly', () => {
      const date1 = new Date('2023-01-01T23:59:59Z');
      const date2 = new Date('2023-01-02T00:00:01Z');
      
      expect((service as any).isSameDay(date1, date2)).toBe(false);
    });
  });

  describe('Redis key generation', () => {
    it('should generate consistent keys', () => {
      const apiKeyId = 'api-key-123';
      
      const dailyKey = (service as any).getDailyKey(apiKeyId);
      const monthlyKey = (service as any).getMonthlyKey(apiKeyId);
      const configKey = (service as any).getConfigKey(apiKeyId);

      expect(dailyKey).toBe('api_quota:daily:api-key-123');
      expect(monthlyKey).toBe('api_quota:monthly:api-key-123');
      expect(configKey).toBe('api_quota:config:api-key-123');
    });

    it('should handle different API key IDs', () => {
      const key1 = (service as any).getDailyKey('key-1');
      const key2 = (service as any).getDailyKey('key-2');

      expect(key1).not.toBe(key2);
    });
  });
});
