import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IpBlockingService } from '../../src/security/services/ip-blocking.service';
import { RedisService } from '../../src/common/services/redis.service';

describe('IpBlockingService', () => {
  let service: IpBlockingService;
  let redisService: RedisService;

  const mockRedisService = {
    exists: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    get: jest.fn(),
    keys: jest.fn(),
    ttl: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        MAX_FAILED_ATTEMPTS: 5,
        FAILED_ATTEMPT_WINDOW_MS: 900000,
        AUTO_BLOCK_DURATION_MS: 3600000,
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpBlockingService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<IpBlockingService>(IpBlockingService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isIpBlocked', () => {
    it('should return false when IP is not blocked', async () => {
      mockRedisService.exists.mockResolvedValue(false);

      const result = await service.isIpBlocked('192.168.1.1');

      expect(result).toBe(false);
    });

    it('should return true when IP is blocked', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      mockRedisService.ttl.mockResolvedValue(3600);

      const result = await service.isIpBlocked('192.168.1.1');

      expect(result).toBe(true);
    });

    it('should unblock IP when block has expired', async () => {
      mockRedisService.exists.mockResolvedValue(true);
      mockRedisService.ttl.mockResolvedValue(-2); // Expired

      const result = await service.isIpBlocked('192.168.1.1');

      expect(result).toBe(false);
      expect(mockRedisService.del).toHaveBeenCalled();
    });
  });

  describe('isIpWhitelisted', () => {
    it('should return true when IP is whitelisted', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(['192.168.1.1', '10.0.0.1']));

      const result = await service.isIpWhitelisted('192.168.1.1');

      expect(result).toBe(true);
    });

    it('should return false when IP is not whitelisted', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(['10.0.0.1', '10.0.0.2']));

      const result = await service.isIpWhitelisted('192.168.1.1');

      expect(result).toBe(false);
    });
  });

  describe('blockIp', () => {
    it('should block IP with duration', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify([]));

      await service.blockIp('192.168.1.1', 'Too many failed attempts', 3600000);

      expect(mockRedisService.setex).toHaveBeenCalled();
    });

    it('should not block whitelisted IP', async () => {
      const whitelist = ['192.168.1.1'];
      mockRedisService.get.mockResolvedValue(JSON.stringify(whitelist));

      await service.blockIp('192.168.1.1', 'Too many failed attempts');

      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('addToWhitelist', () => {
    it('should add IP to whitelist', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(['10.0.0.1']));

      await service.addToWhitelist('192.168.1.1');

      expect(mockRedisService.set).toHaveBeenCalledWith('ip_whitelist', JSON.stringify(['10.0.0.1', '192.168.1.1']));
    });

    it('should not duplicate IPs in whitelist', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(['192.168.1.1']));

      await service.addToWhitelist('192.168.1.1');

      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('recordFailedAttempt', () => {
    it('should record failed attempt and auto-block when threshold exceeded', async () => {
      const existingAttempts = [
        { timestamp: Date.now() - 10000, reason: 'invalid_credentials' },
        { timestamp: Date.now() - 20000, reason: 'invalid_credentials' },
        { timestamp: Date.now() - 30000, reason: 'invalid_credentials' },
        { timestamp: Date.now() - 40000, reason: 'invalid_credentials' },
        { timestamp: Date.now() - 50000, reason: 'invalid_credentials' },
      ];

      mockRedisService.get.mockResolvedValue(JSON.stringify(existingAttempts));

      await service.recordFailedAttempt('192.168.1.1', 'invalid_credentials');

      expect(mockRedisService.setex).toHaveBeenCalled();
    });
  });
});
