import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    super();
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST'),
      port: this.configService.get('REDIS_PORT'),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB'),
      maxRetriesPerRequest: 3,
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const result = await this.redis.ping();
      if (result === 'PONG') {
        return this.getStatus(key, true, { message: 'Redis connection successful' });
      }
      throw new Error('Redis ping failed');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError('Redis connection failed', this.getStatus(key, false, { error: errMsg }));
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
