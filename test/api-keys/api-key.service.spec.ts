import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyService } from '../../src/api-keys/api-key.service';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { RedisService } from '../../src/common/services/redis.service';
import { CreateApiKeyDto } from '../../src/api-keys/dto/create-api-key.dto';
import { UpdateApiKeyDto } from '../../src/api-keys/dto/update-api-key.dto';
import { ApiKeyScope } from '../../src/api-keys/enums/api-key-scope.enum';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let configService: ConfigService;

  const mockPrismaService = {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    setex: jest.fn(),
    incr: jest.fn(),
    ttl: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        ENCRYPTION_KEY: 'test-encryption-key-32-characters',
        API_KEY_RATE_LIMIT_PER_MINUTE: 60,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new API key with valid scopes', async () => {
      const createDto: CreateApiKeyDto = {
        name: 'Test API Key',
        scopes: [ApiKeyScope.READ_PROPERTIES],
        rateLimit: 100,
      };

      const mockApiKey = {
        id: 'test-id',
        name: 'Test API Key',
        key: 'encrypted-key',
        keyPrefix: 'propchain_live_abc123',
        scopes: [ApiKeyScope.READ_PROPERTIES],
        requestCount: BigInt(0),
        lastUsedAt: null,
        isActive: true,
        rateLimit: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.apiKey.create.mockResolvedValue(mockApiKey);

      const result = await service.create(createDto);

      expect(result).toHaveProperty('key');
      expect(result.key).toMatch(/^propchain_live_/);
      expect(result.name).toBe('Test API Key');
      expect(result.scopes).toEqual([ApiKeyScope.READ_PROPERTIES]);
      expect(mockPrismaService.apiKey.create).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException for invalid scopes', async () => {
      const createDto: CreateApiKeyDto = {
        name: 'Test API Key',
        scopes: ['invalid:scope'],
        rateLimit: 100,
      };

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return all API keys', async () => {
      const mockApiKeys = [
        {
          id: 'test-id-1',
          name: 'Test API Key 1',
          key: 'encrypted-key-1',
          keyPrefix: 'propchain_live_abc123',
          scopes: [ApiKeyScope.READ_PROPERTIES],
          requestCount: BigInt(10),
          lastUsedAt: new Date(),
          isActive: true,
          rateLimit: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.apiKey.findMany.mockResolvedValue(mockApiKeys);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test API Key 1');
      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a single API key', async () => {
      const mockApiKey = {
        id: 'test-id',
        name: 'Test API Key',
        key: 'encrypted-key',
        keyPrefix: 'propchain_live_abc123',
        scopes: [ApiKeyScope.READ_PROPERTIES],
        requestCount: BigInt(5),
        lastUsedAt: new Date(),
        isActive: true,
        rateLimit: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.apiKey.findUnique.mockResolvedValue(mockApiKey);

      const result = await service.findOne('test-id');

      expect(result.name).toBe('Test API Key');
      expect(mockPrismaService.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-id' },
      });
    });

    it('should throw NotFoundException if API key not found', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an API key', async () => {
      const updateDto: UpdateApiKeyDto = {
        name: 'Updated API Key',
        scopes: [ApiKeyScope.READ_PROPERTIES, ApiKeyScope.WRITE_PROPERTIES],
      };

      const mockApiKey = {
        id: 'test-id',
        name: 'Test API Key',
        key: 'encrypted-key',
        keyPrefix: 'propchain_live_abc123',
        scopes: [ApiKeyScope.READ_PROPERTIES],
        requestCount: BigInt(5),
        lastUsedAt: new Date(),
        isActive: true,
        rateLimit: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedApiKey = { ...mockApiKey, ...updateDto };

      mockPrismaService.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue(updatedApiKey);

      const result = await service.update('test-id', updateDto);

      expect(result.name).toBe('Updated API Key');
      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: updateDto,
      });
    });

    it('should throw NotFoundException if API key not found', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent-id', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('revoke', () => {
    it('should revoke an API key', async () => {
      const mockApiKey = {
        id: 'test-id',
        name: 'Test API Key',
        key: 'encrypted-key',
        keyPrefix: 'propchain_live_abc123',
        scopes: [ApiKeyScope.READ_PROPERTIES],
        requestCount: BigInt(5),
        lastUsedAt: new Date(),
        isActive: true,
        rateLimit: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrismaService.apiKey.update.mockResolvedValue({ ...mockApiKey, isActive: false });
      mockRedisService.del.mockResolvedValue(1);

      await service.revoke('test-id');

      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: { isActive: false },
      });
      expect(mockRedisService.del).toHaveBeenCalledWith('rate_limit:propchain_live_abc123');
    });

    it('should throw NotFoundException if API key not found', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.revoke('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateApiKey', () => {
    it('should throw UnauthorizedException for invalid key format', async () => {
      await expect(service.validateApiKey('invalid-key')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent key', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.validateApiKey('propchain_live_nonexistent')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when rate limit exceeded', async () => {
      const mockApiKey = {
        id: 'test-id',
        name: 'Test API Key',
        key: 'encrypted-key',
        keyPrefix: 'propchain_live_abc123',
        scopes: [ApiKeyScope.READ_PROPERTIES],
        requestCount: BigInt(5),
        lastUsedAt: new Date(),
        isActive: true,
        rateLimit: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockRedisService.get.mockResolvedValue('60');

      await expect(
        service.validateApiKey('propchain_live_abc123xyz'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
