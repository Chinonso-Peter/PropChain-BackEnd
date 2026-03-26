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
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    try {
      // Test basic connectivity
      const result = await this.redis.ping();
      
      if (result !== 'PONG') {
        throw new Error('Redis ping failed');
      }

      // Get Redis info
      const info = await this.redis.info();
      const memoryInfo = await this.redis.info('memory');
      const serverInfo = await this.redis.info('server');
      
      // Test read/write operations
      const testKey = 'health-check-test';
      const testValue = Date.now().toString();
      await this.redis.set(testKey, testValue, 'EX', 10);
      const retrievedValue = await this.redis.get(testKey);
      await this.redis.del(testKey);

      if (retrievedValue !== testValue) {
        throw new Error('Redis read/write test failed');
      }

      const responseTime = Date.now() - startTime;

      const details = {
        responseTime: `${responseTime}ms`,
        connection: {
          host: this.configService.get('REDIS_HOST', 'localhost'),
          port: this.configService.get('REDIS_PORT', 6379),
          db: this.configService.get('REDIS_DB', 0),
        },
        memory: this.parseMemoryInfo(memoryInfo),
        server: this.parseServerInfo(serverInfo),
        test: {
          readWrite: 'passed',
          testKey,
          testValue,
          retrievedValue,
        },
        timestamp: new Date().toISOString(),
        message: 'Redis connection successful',
      };

      return this.getStatus(key, true, details);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      throw new HealthCheckError(
        'Redis connection failed',
        this.getStatus(key, false, {
          error: error.message,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  private parseMemoryInfo(memoryInfo: string): any {
    try {
      const lines = memoryInfo.split('\r\n');
      const memory: any = {};
      
      lines.forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            memory[key] = value;
          }
        }
      });

      return {
        usedMemory: memory.used_memory_human,
        usedMemoryRss: memory.used_memory_rss_human,
        usedMemoryPeak: memory.used_memory_peak_human,
        maxMemory: memory.maxmemory_human || 'no limit',
      };
    } catch (error) {
      return { error: 'Could not parse memory info' };
    }
  }

  private parseServerInfo(serverInfo: string): any {
    try {
      const lines = serverInfo.split('\r\n');
      const server: any = {};
      
      lines.forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            server[key] = value;
          }
        }
      });

      return {
        version: server.redis_version,
        mode: server.redis_mode,
        os: server.os,
        archBits: server.arch_bits,
        uptimeInSeconds: server.uptime_in_seconds,
        connectedClients: server.connected_clients,
      };
    } catch (error) {
      return { error: 'Could not parse server info' };
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
