import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitingService } from '../../../src/security/services/rate-limiting.service';
import { RedisService } from '../../../src/common/services/redis.service';
import { ConfigService } from '@nestjs/config';

describe('RateLimitingService', () => {
  let service: RateLimitingService;
  let redisService: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitingService,
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
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

    service = module.get<RateLimitingService>(RateLimitingService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow request when under limit', async () => {
      const key = 'test-key';
      const config = {
        windowMs: 60000,
        maxRequests: 100,
      };

      jest.spyOn(redisService, 'eval').mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalRequests: 1,
      });

      const result = await service.checkRateLimit(key, config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
      expect(result.limit).toBe(100);
      expect(result.window).toBe(60000);
      expect(redisService.eval).toHaveBeenCalled();
    });

    it('should deny request when over limit', async () => {
      const key = 'test-key';
      const config = {
        windowMs: 60000,
        maxRequests: 100,
      };

      jest.spyOn(redisService, 'eval').mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalRequests: 100,
      });

      const result = await service.checkRateLimit(key, config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(100);
      expect(result.window).toBe(60000);
    });

    it('should handle Redis errors gracefully', async () => {
      const key = 'test-key';
      const config = {
        windowMs: 60000,
        maxRequests: 100,
      };

      jest.spyOn(redisService, 'eval').mockRejectedValue(new Error('Redis error'));

      const result = await service.checkRateLimit(key, config);

      expect(result.allowed).toBe(true); // Fail open
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(100);
    });

    it('should use custom window size', async () => {
      const key = 'test-key';
      const config = {
        windowMs: 300000, // 5 minutes
        maxRequests: 50,
      };

      jest.spyOn(redisService, 'eval').mockResolvedValue({
        allowed: true,
        remaining: 49,
        resetTime: Date.now() + 300000,
        totalRequests: 1,
      });

      const result = await service.checkRateLimit(key, config);

      expect(result.window).toBe(300000);
      expect(result.limit).toBe(50);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for a key', async () => {
      const key = 'test-key';

      jest.spyOn(redisService, 'del').mockResolvedValue(1);

      await service.resetRateLimit(key);

      expect(redisService.del).toHaveBeenCalledWith(`rate_limit:${key}`);
    });

    it('should handle Redis errors during reset', async () => {
      const key = 'test-key';

      jest.spyOn(redisService, 'del').mockRejectedValue(new Error('Redis error'));

      await expect(service.resetRateLimit(key)).resolves.not.toThrow();
    });
  });

  describe('getRateLimitInfo', () => {
    it('should get current rate limit info', async () => {
      const key = 'test-key';

      jest.spyOn(redisService, 'get').mockResolvedValue(JSON.stringify({
        count: 10,
        resetTime: Date.now() + 60000,
      }));

      const info = await service.getRateLimitInfo(key);

      expect(info.count).toBe(10);
      expect(info.resetTime).toBeInstanceOf(Date);
    });

    it('should return null when no rate limit info exists', async () => {
      const key = 'test-key';

      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const info = await service.getRateLimitInfo(key);

      expect(info).toBeNull();
    });

    it('should handle malformed JSON in Redis', async () => {
      const key = 'test-key';

      jest.spyOn(redisService, 'get').mockResolvedValue('invalid-json');

      const info = await service.getRateLimitInfo(key);

      expect(info).toBeNull();
    });

    it('should handle Redis errors during info retrieval', async () => {
      const key = 'test-key';

      jest.spyOn(redisService, 'get').mockRejectedValue(new Error('Redis error'));

      const info = await service.getRateLimitInfo(key);

      expect(info).toBeNull();
    });
  });

  describe('getDefaultConfigurations', () => {
    it('should return default configurations for different contexts', () => {
      const configs = service.getDefaultConfigurations();

      expect(configs).toHaveProperty('api');
      expect(configs).toHaveProperty('auth');
      expect(configs).toHaveProperty('upload');
      expect(configs).toHaveProperty('search');

      // Check API configuration
      expect(configs.api.windowMs).toBe(60000);
      expect(configs.api.maxRequests).toBe(100);

      // Check auth configuration (more restrictive)
      expect(configs.auth.windowMs).toBe(900000); // 15 minutes
      expect(configs.auth.maxRequests).toBe(5);

      // Check upload configuration (more restrictive)
      expect(configs.upload.windowMs).toBe(3600000); // 1 hour
      expect(configs.upload.maxRequests).toBe(10);

      // Check search configuration (less restrictive)
      expect(configs.search.windowMs).toBe(60000);
      expect(configs.search.maxRequests).toBe(1000);
    });
  });

  describe('createCustomConfiguration', () => {
    it('should create custom rate limit configuration', () => {
      const config = service.createCustomConfiguration({
        windowMs: 120000,
        maxRequests: 200,
        skipSuccessfulRequests: false,
        skipFailedRequests: true,
      });

      expect(config.windowMs).toBe(120000);
      expect(config.maxRequests).toBe(200);
      expect(config.skipSuccessfulRequests).toBe(false);
      expect(config.skipFailedRequests).toBe(true);
    });

    it('should use default values for missing options', () => {
      const config = service.createCustomConfiguration({
        windowMs: 120000,
      });

      expect(config.windowMs).toBe(120000);
      expect(config.maxRequests).toBe(100); // Default
      expect(config.skipSuccessfulRequests).toBe(false); // Default
      expect(config.skipFailedRequests).toBe(false); // Default
    });
  });

  describe('middleware integration', () => {
    it('should work with Express middleware pattern', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {},
      };
      const mockResponse = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const mockNext = jest.fn();

      const config = service.getDefaultConfigurations().api;
      jest.spyOn(redisService, 'eval').mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalRequests: 1,
      });

      // Simulate middleware usage
      const key = `rate_limit:${mockRequest.ip}`;
      const result = await service.checkRateLimit(key, config);

      // Set rate limit headers
      mockResponse.setHeader('X-RateLimit-Limit', result.limit);
      mockResponse.setHeader('X-RateLimit-Remaining', result.remaining);
      mockResponse.setHeader('X-RateLimit-Reset', Math.floor(result.resetTime / 1000));

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });
  });

  describe('Redis Lua script', () => {
    it('should generate correct Redis Lua script', () => {
      const key = 'test-key';
      const config = {
        windowMs: 60000,
        maxRequests: 100,
      };

      const script = (service as any).generateRateLimitScript();

      expect(script).toContain('local key');
      expect(script).toContain('local current_time');
      expect(script).toContain('local window_start');
      expect(script).toContain('local requests');
      expect(script).toContain('redis.call');
    });

    it('should handle script execution correctly', async () => {
      const key = 'test-key';
      const config = {
        windowMs: 60000,
        maxRequests: 100,
      };

      const mockResult = {
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalRequests: 1,
      };

      jest.spyOn(redisService, 'eval').mockResolvedValue(mockResult);

      const result = await service.checkRateLimit(key, config);

      expect(redisService.eval).toHaveBeenCalledWith(
        expect.any(String), // script
        1, // numKeys
        expect.stringContaining(key), // key
        expect.any(Number), // windowMs
        expect.any(Number), // maxRequests
        expect.any(Number) // currentTime
      );
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys', () => {
      const identifier = 'test-identifier';
      const key1 = (service as any).generateKey(identifier);
      const key2 = (service as any).generateKey(identifier);

      expect(key1).toBe(key2);
      expect(key1).toBe('rate_limit:test-identifier');
    });

    it('should include prefix in keys', () => {
      const identifier = 'test-identifier';
      const key = (service as any).generateKey(identifier);

      expect(key).toMatch(/^rate_limit:/);
    });

    it('should handle different identifiers', () => {
      const key1 = (service as any).generateKey('user-1');
      const key2 = (service as any).generateKey('user-2');

      expect(key1).not.toBe(key2);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle zero maxRequests', async () => {
      const key = 'test-key';
      const config = {
        windowMs: 60000,
        maxRequests: 0,
      };

      jest.spyOn(redisService, 'eval').mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalRequests: 0,
      });

      const result = await service.checkRateLimit(key, config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle negative windowMs', async () => {
      const key = 'test-key';
      const config = {
        windowMs: -1,
        maxRequests: 100,
      };

      jest.spyOn(redisService, 'eval').mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalRequests: 1,
      });

      const result = await service.checkRateLimit(key, config);

      expect(result.allowed).toBe(true);
    });

    it('should handle empty key', async () => {
      const key = '';
      const config = {
        windowMs: 60000,
        maxRequests: 100,
      };

      jest.spyOn(redisService, 'eval').mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalRequests: 1,
      });

      const result = await service.checkRateLimit(key, config);

      expect(result.allowed).toBe(true);
    });
  });
});
