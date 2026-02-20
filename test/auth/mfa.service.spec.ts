import { Test, TestingModule } from '@nestjs/testing';
import { MfaService } from '../../src/auth/mfa/mfa.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../src/common/services/redis.service';
import { StructuredLoggerService } from '../../src/common/logging/logger.service';

describe('MfaService', () => {
  let service: MfaService;
  let redisService: RedisService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      const config = {
        'MFA_CODE_EXPIRY': 300,
      };
      return config[key];
    }),
  };

  const mockRedisService = {
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    set: jest.fn(),
  };

  const mockLoggerService = {
    setContext: jest.fn(),
    logAuth: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: StructuredLoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMfaSecret', () => {
    it('should generate MFA secret and QR code', async () => {
      const result = await service.generateMfaSecret('user123', 'test@example.com');
      
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(result.secret).toHaveLength(32); // Base32 encoded secret
      expect(result.qrCode).toContain('data:image/png;base64');
      expect(mockRedisService.setex).toHaveBeenCalledWith(
        'mfa_setup:user123',
        300,
        expect.any(String)
      );
    });
  });

  describe('verifyMfaSetup', () => {
    it('should verify MFA setup with valid token', async () => {
      mockRedisService.get.mockResolvedValue('JBSWY3DPEHPK3PXP');
      
      // Mock speakeasy to return true for verification
      jest.mock('speakeasy', () => ({
        totp: {
          verify: jest.fn().mockReturnValue(true),
        },
      }));

      const result = await service.verifyMfaSetup('user123', '123456');
      
      expect(result).toBe(true);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'mfa_secret:user123',
        'JBSWY3DPEHPK3PXP'
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('mfa_setup:user123');
    });

    it('should throw error for expired setup session', async () => {
      mockRedisService.get.mockResolvedValue(null);
      
      await expect(service.verifyMfaSetup('user123', '123456'))
        .rejects
        .toThrow('MFA setup session expired or not found');
    });
  });

  describe('isMfaEnabled', () => {
    it('should return true when MFA is enabled', async () => {
      mockRedisService.get.mockResolvedValue('JBSWY3DPEHPK3PXP');
      
      const result = await service.isMfaEnabled('user123');
      
      expect(result).toBe(true);
    });

    it('should return false when MFA is not enabled', async () => {
      mockRedisService.get.mockResolvedValue(null);
      
      const result = await service.isMfaEnabled('user123');
      
      expect(result).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 10 backup codes', async () => {
      const result = await service.generateBackupCodes('user123');
      
      expect(result).toHaveLength(10);
      result.forEach(code => {
        expect(code).toHaveLength(8);
        expect(code).toMatch(/^[A-Z0-9]+$/);
      });
      
      expect(mockRedisService.setex).toHaveBeenCalledWith(
        'mfa_backup_codes:user123',
        3600, // 300 * 12
        JSON.stringify(result)
      );
    });
  });

  describe('getMfaStatus', () => {
    it('should return correct MFA status when enabled', async () => {
      mockRedisService.get
        .mockResolvedValueOnce('JBSWY3DPEHPK3PXP') // mfa_secret
        .mockResolvedValueOnce(JSON.stringify(['ABC123', 'DEF456'])); // backup_codes
      
      const result = await service.getMfaStatus('user123');
      
      expect(result).toEqual({
        enabled: true,
        hasBackupCodes: true,
      });
    });

    it('should return correct MFA status when disabled', async () => {
      mockRedisService.get
        .mockResolvedValueOnce(null) // mfa_secret
        .mockResolvedValueOnce(null); // backup_codes
      
      const result = await service.getMfaStatus('user123');
      
      expect(result).toEqual({
        enabled: false,
        hasBackupCodes: false,
      });
    });
  });
});