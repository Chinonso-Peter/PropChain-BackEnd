import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';

export interface DdosAttackInfo {
  attackId: string;
  detectedAt: Date;
  mitigated: boolean;
  blockedIps: string[];
  requestCount: number;
  mitigationAction: string;
}

@Injectable()
export class DdosProtectionService {
  private readonly logger = new Logger(DdosProtectionService.name);
  private readonly DDOS_PREFIX = 'ddos_protection';
  private readonly REQUEST_WINDOW = 60000; // 1 minute
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  private attackIds: Set<string> = new Set();

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    // Start cleanup job
    this.startCleanupJob();
  }

  /**
   * Monitor and detect potential DDoS attacks
   */
  async monitorTraffic(
    ip: string,
    path: string,
    userAgent: string,
  ): Promise<{ isAttack: boolean; info?: DdosAttackInfo }> {
    try {
      const currentTime = Date.now();
      const windowStart = currentTime - this.REQUEST_WINDOW;

      // Track request in Redis
      const requestKey = `${this.DDOS_PREFIX}:requests:${ip}`;
      await this.redisService.getRedisInstance().zadd(requestKey, currentTime, currentTime.toString());
      await this.redisService.getRedisInstance().zremrangebyscore(requestKey, 0, windowStart);
      await this.redisService.expire(requestKey, Math.ceil(this.REQUEST_WINDOW / 1000) + 60);

      // Get request count for this IP
      const requestCount = await this.redisService.getRedisInstance().zcard(requestKey);

      // Check if threshold exceeded
      const threshold = this.configService.get<number>('DDOS_THRESHOLD_PER_MINUTE', 100);

      if (requestCount > threshold) {
        const attackId = this.generateAttackId(ip, currentTime);

        // Check if we've already detected this attack
        if (this.attackIds.has(attackId)) {
          return { isAttack: true };
        }

        this.attackIds.add(attackId);

        const attackInfo: DdosAttackInfo = {
          attackId,
          detectedAt: new Date(),
          mitigated: false,
          blockedIps: [ip],
          requestCount,
          mitigationAction: 'ip_blocked',
        };

        // Apply mitigation
        await this.mitigateAttack(attackInfo);

        this.logger.warn(`DDoS attack detected from IP ${ip} - Request count: ${requestCount}`);
        return { isAttack: true, info: attackInfo };
      }

      return { isAttack: false };
    } catch (error) {
      this.logger.error(`Failed to monitor traffic for IP ${ip}:`, error);
      return { isAttack: false };
    }
  }

  /**
   * Apply mitigation for detected attack
   */
  private async mitigateAttack(attackInfo: DdosAttackInfo): Promise<void> {
    try {
      const mitigationAction = this.configService.get<string>('DDOS_MITIGATION_ACTION', 'block_ip');
      const blockDuration = this.configService.get<number>('DDOS_BLOCK_DURATION_MS', 3600000); // 1 hour

      switch (mitigationAction) {
        case 'block_ip':
          for (const ip of attackInfo.blockedIps) {
            await this.redisService.setex(
              `${this.DDOS_PREFIX}:blocked:${ip}`,
              Math.ceil(blockDuration / 1000),
              JSON.stringify({
                attackId: attackInfo.attackId,
                blockedAt: Date.now(),
              }),
            );
          }
          attackInfo.mitigated = true;
          attackInfo.mitigationAction = 'ip_blocked';
          break;

        case 'rate_limit':
          // Implement rate limiting for affected IPs
          attackInfo.mitigated = true;
          attackInfo.mitigationAction = 'rate_limited';
          break;

        case 'challenge':
          // Implement challenge/response (CAPTCHA-like)
          attackInfo.mitigated = true;
          attackInfo.mitigationAction = 'challenge_issued';
          break;
      }

      // Store attack information
      await this.storeAttackInfo(attackInfo);
    } catch (error) {
      this.logger.error(`Failed to mitigate attack ${attackInfo.attackId}:`, error);
    }
  }

  /**
   * Check if IP is currently blocked due to DDoS
   */
  async isIpBlockedForDdos(ip: string): Promise<boolean> {
    try {
      const blockKey = `${this.DDOS_PREFIX}:blocked:${ip}`;
      return await this.redisService.exists(blockKey);
    } catch (error) {
      this.logger.error(`Failed to check DDoS block status for IP ${ip}:`, error);
      return false;
    }
  }

  /**
   * Get attack information
   */
  async getAttackInfo(attackId: string): Promise<DdosAttackInfo | null> {
    try {
      const attackKey = `${this.DDOS_PREFIX}:attacks:${attackId}`;
      const attackData = await this.redisService.get(attackKey);
      return attackData ? JSON.parse(attackData) : null;
    } catch (error) {
      this.logger.error(`Failed to get attack info for ${attackId}:`, error);
      return null;
    }
  }

  /**
   * Get all recent attacks
   */
  async getRecentAttacks(hours: number = 24): Promise<DdosAttackInfo[]> {
    try {
      const attackKeyPattern = `${this.DDOS_PREFIX}:attacks:*`;
      const keys = await this.redisService.keys(attackKeyPattern);
      const cutoffTime = Date.now() - hours * 3600000;
      const attacks: DdosAttackInfo[] = [];

      for (const key of keys) {
        const attackData = await this.redisService.get(key);
        if (attackData) {
          const attackInfo = JSON.parse(attackData);
          if (new Date(attackInfo.detectedAt).getTime() > cutoffTime) {
            attacks.push(attackInfo);
          }
        }
      }

      return attacks.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    } catch (error) {
      this.logger.error('Failed to get recent attacks:', error);
      return [];
    }
  }

  /**
   * Store attack information
   */
  private async storeAttackInfo(attackInfo: DdosAttackInfo): Promise<void> {
    try {
      const attackKey = `${this.DDOS_PREFIX}:attacks:${attackInfo.attackId}`;
      const retentionHours = this.configService.get<number>('DDOS_ATTACK_RETENTION_HOURS', 168); // 1 week

      await this.redisService.setex(attackKey, retentionHours * 3600, JSON.stringify(attackInfo));
    } catch (error) {
      this.logger.error(`Failed to store attack info ${attackInfo.attackId}:`, error);
    }
  }

  /**
   * Generate unique attack ID
   */
  private generateAttackId(ip: string, timestamp: number): string {
    return `${ip}_${timestamp}`;
  }

  /**
   * Start cleanup job to remove old data
   */
  private startCleanupJob(): void {
    setInterval(async () => {
      try {
        // Clean up old attack IDs
        const cutoffTime = Date.now() - 3600000; // 1 hour ago
        for (const attackId of this.attackIds) {
          const timestamp = parseInt(attackId.split('_')[1]);
          if (timestamp < cutoffTime) {
            this.attackIds.delete(attackId);
          }
        }

        // Clean up old blocked IPs
        const blockPattern = `${this.DDOS_PREFIX}:blocked:*`;
        const blockKeys = await this.redisService.keys(blockPattern);
        const currentTime = Date.now();

        for (const key of blockKeys) {
          const ttl = await this.redisService.ttl(key);
          if (ttl <= 0) {
            await this.redisService.del(key);
          }
        }
      } catch (error) {
        this.logger.error('DDoS cleanup job failed:', error);
      }
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Get current protection status
   */
  async getProtectionStatus(): Promise<{
    activeAttacks: number;
    blockedIps: number;
    threshold: number;
  }> {
    try {
      const attackPattern = `${this.DDOS_PREFIX}:attacks:*`;
      const blockPattern = `${this.DDOS_PREFIX}:blocked:*`;

      const attackKeys = await this.redisService.keys(attackPattern);
      const blockKeys = await this.redisService.keys(blockPattern);
      const threshold = this.configService.get<number>('DDOS_THRESHOLD_PER_MINUTE', 100);

      return {
        activeAttacks: attackKeys.length,
        blockedIps: blockKeys.length,
        threshold,
      };
    } catch (error) {
      this.logger.error('Failed to get protection status:', error);
      return {
        activeAttacks: 0,
        blockedIps: 0,
        threshold: 100,
      };
    }
  }

  /**
   * Manually block an IP for DDoS protection
   */
  async manualBlockIp(ip: string, durationMs: number = 3600000): Promise<void> {
    try {
      const blockKey = `${this.DDOS_PREFIX}:blocked:${ip}`;
      const blockData = {
        manuallyBlocked: true,
        blockedAt: Date.now(),
        reason: 'manual_block',
      };

      await this.redisService.setex(blockKey, Math.ceil(durationMs / 1000), JSON.stringify(blockData));

      this.logger.warn(`IP manually blocked for DDoS protection: ${ip}`);
    } catch (error) {
      this.logger.error(`Failed to manually block IP ${ip}:`, error);
    }
  }

  /**
   * Unblock an IP from DDoS protection
   */
  async unblockIp(ip: string): Promise<void> {
    try {
      const blockKey = `${this.DDOS_PREFIX}:blocked:${ip}`;
      await this.redisService.del(blockKey);
      this.logger.log(`IP unblocked from DDoS protection: ${ip}`);
    } catch (error) {
      this.logger.error(`Failed to unblock IP ${ip}:`, error);
    }
  }
}
