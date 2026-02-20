import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma/prisma.service';
import { RedisService } from '../common/services/redis.service';
import { PaginationService, PaginationQueryDto, PaginatedResponseDto } from '../common/pagination';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { ApiKeyResponseDto, CreateApiKeyResponseDto } from './dto/api-key-response.dto';
import { API_KEY_SCOPES, ApiKeyScope } from './enums/api-key-scope.enum';
import * as crypto from 'crypto';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class ApiKeyService {
  private readonly encryptionKey: string;
  private readonly globalRateLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly paginationService: PaginationService,
  ) {
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    this.globalRateLimit = this.configService.get<number>('API_KEY_RATE_LIMIT_PER_MINUTE', 60);

    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY must be set in environment variables');
    }
  }

  async create(createApiKeyDto: CreateApiKeyDto): Promise<CreateApiKeyResponseDto> {
    this.validateScopes(createApiKeyDto.scopes);

    const plainKey = this.generateApiKey();
    const keyPrefix = this.extractKeyPrefix(plainKey);
    const encryptedKey = this.encryptKey(plainKey);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: createApiKeyDto.name,
        key: encryptedKey,
        keyPrefix,
        scopes: createApiKeyDto.scopes,
        rateLimit: createApiKeyDto.rateLimit,
      },
    });

    return {
      ...this.mapToResponseDto(apiKey),
      key: plainKey,
    };
  }

  async findAll(
    paginationQuery?: PaginationQueryDto,
  ): Promise<ApiKeyResponseDto[] | PaginatedResponseDto<ApiKeyResponseDto>> {
    // If no pagination query provided, return all (for backward compatibility)
    if (!paginationQuery) {
      const apiKeys = await this.prisma.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return apiKeys.map(apiKey => this.mapToResponseDto(apiKey));
    }

    // Paginated response
    const { skip, take, orderBy } = this.paginationService.getPrismaOptions(paginationQuery, 'createdAt');

    const [apiKeys, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        skip,
        take,
        orderBy,
      }),
      this.prisma.apiKey.count(),
    ]);

    const data = apiKeys.map(apiKey => this.mapToResponseDto(apiKey));
    return this.paginationService.formatResponse(data, total, paginationQuery);
  }

  async findOne(id: string): Promise<ApiKeyResponseDto> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return this.mapToResponseDto(apiKey);
  }

  async update(id: string, updateApiKeyDto: UpdateApiKeyDto): Promise<ApiKeyResponseDto> {
    if (updateApiKeyDto.scopes) {
      this.validateScopes(updateApiKeyDto.scopes);
    }

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    const updatedApiKey = await this.prisma.apiKey.update({
      where: { id },
      data: updateApiKeyDto,
    });

    return this.mapToResponseDto(updatedApiKey);
  }

  async revoke(id: string): Promise<void> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    await this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    await this.redis.del(`rate_limit:${apiKey.keyPrefix}`);
  }

  async validateApiKey(plainKey: string): Promise<any> {
    if (!plainKey || !plainKey.startsWith('propchain_live_')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    const keyPrefix = this.extractKeyPrefix(plainKey);

    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        keyPrefix,
        isActive: true,
      },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    const decryptedKey = this.decryptKey(apiKey.key);

    if (decryptedKey !== plainKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.checkRateLimit(apiKey);
    await this.trackUsage(apiKey.id, keyPrefix);

    return apiKey; // Return full API key object
  }

  private async checkRateLimit(apiKey: any): Promise<void> {
    const limit = apiKey.rateLimit || this.globalRateLimit;
    const redisKey = `rate_limit:${apiKey.keyPrefix}`;

    // Attempt to access the raw client property since getClient() doesn't exist
    // Usually in these wrappers, it's called 'client' or 'redis'
    const rawClient = (this.redis as any).client || (this.redis as any).redis;

    const currentCount = await this.redis.get(redisKey);
    const count = currentCount ? parseInt(currentCount, 10) : 0;

    if (count >= limit) {
      throw new UnauthorizedException('Rate limit exceeded');
    }

    if (rawClient) {
      const ttl = await rawClient.ttl(redisKey);
      if (ttl === -1 || ttl === -2) {
        await this.redis.set(redisKey, '1');
        await rawClient.expire(redisKey, 60);
      } else {
        await rawClient.incr(redisKey);
      }
    } else {
      // Fallback if rawClient access fails:
      // Manual increment and reset logic (less accurate but doesn't crash)
      const newCount = (count + 1).toString();
      await this.redis.set(redisKey, newCount);
    }
  }

  private async trackUsage(apiKeyId: string, keyPrefix: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        requestCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  private generateApiKey(): string {
    const randomBytes = crypto.randomBytes(24);
    const randomString = randomBytes
      .toString('base64')
      .replace(/\+/g, '')
      .replace(/\//g, '')
      .replace(/=/g, '')
      .substring(0, 32);

    return `propchain_live_${randomString}`;
  }

  private extractKeyPrefix(key: string): string {
    return key.substring(0, 28);
  }

  private encryptKey(plainKey: string): string {
    return CryptoJS.AES.encrypt(plainKey, this.encryptionKey).toString();
  }

  private decryptKey(encryptedKey: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  private validateScopes(scopes: string[]): void {
    const invalidScopes = scopes.filter(scope => !API_KEY_SCOPES.includes(scope as ApiKeyScope));

    if (invalidScopes.length > 0) {
      throw new BadRequestException(
        `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes are: ${API_KEY_SCOPES.join(', ')}`,
      );
    }
  }

  private mapToResponseDto(apiKey: any): ApiKeyResponseDto {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      requestCount: apiKey.requestCount.toString(),
      lastUsedAt: apiKey.lastUsedAt,
      isActive: apiKey.isActive,
      rateLimit: apiKey.rateLimit,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    };
  }
}
