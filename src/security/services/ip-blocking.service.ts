import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';

export interface IpBlockInfo {
  ip: string;
  reason: string;
  blockedAt: Date;
  expiresAt?: Date;
  attempts?: number;
}

@Injectable()
export class IpBlockingService {
  private readonly logger = new Logger(IpBlockingService.name);
  private readonly BLOCK_KEY_PREFIX = 'ip_block';
  private readonly WHITELIST_KEY = 'ip_whitelist';
  private readonly ATTEMPT_KEY_PREFIX = 'ip_attempts';

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Check if an IP is blocked
   */
  async isIpBlocked(ip: string): Promise<boolean> {
    try {
      const blockKey = `${this.BLOCK_KEY_PREFIX}:${ip}`;
      const isBlocked = await this.redisService.exists(blockKey);

      if (isBlocked) {
        // Check if block has expired
        const ttl = await this.redisService.ttl(blockKey);
        if (ttl === -1) {
          // Permanent block
          return true;
        } else if (ttl <= 0) {
          // Expired block, remove it
          await this.unblockIp(ip);
          return false;
        }
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to check if IP ${ip} is blocked:`, error);
      return false; // Fail open
    }
  }

  /**
   * Check if an IP is whitelisted
   */
  async isIpWhitelisted(ip: string): Promise<boolean> {
    try {
      const whitelist = await this.getWhitelist();
      return whitelist.includes(ip);
    } catch (error) {
      this.logger.error(`Failed to check if IP ${ip} is whitelisted:`, error);
      return false;
    }
  }

  /**
   * Block an IP address
   */
  async blockIp(ip: string, reason: string, durationMs?: number): Promise<void> {
    try {
      // Check if IP is whitelisted
      if (await this.isIpWhitelisted(ip)) {
        this.logger.log(`Skipping block for whitelisted IP: ${ip}`);
        return;
      }

      const blockKey = `${this.BLOCK_KEY_PREFIX}:${ip}`;
      const blockInfo: IpBlockInfo = {
        ip,
        reason,
        blockedAt: new Date(),
        expiresAt: durationMs ? new Date(Date.now() + durationMs) : undefined,
      };

      const jsonData = JSON.stringify(blockInfo);

      if (durationMs) {
        await this.redisService.setex(blockKey, Math.ceil(durationMs / 1000), jsonData);
      } else {
        await this.redisService.set(blockKey, jsonData);
      }

      this.logger.warn(`IP blocked: ${ip} - Reason: ${reason}`);
    } catch (error) {
      this.logger.error(`Failed to block IP ${ip}:`, error);
    }
  }

  /**
   * Unblock an IP address
   */
  async unblockIp(ip: string): Promise<void> {
    try {
      const blockKey = `${this.BLOCK_KEY_PREFIX}:${ip}`;
      await this.redisService.del(blockKey);
      this.logger.log(`IP unblocked: ${ip}`);
    } catch (error) {
      this.logger.error(`Failed to unblock IP ${ip}:`, error);
    }
  }

  /**
   * Add IP to whitelist
   */
  async addToWhitelist(ip: string): Promise<void> {
    try {
      const whitelist = await this.getWhitelist();
      if (!whitelist.includes(ip)) {
        whitelist.push(ip);
        await this.redisService.set(this.WHITELIST_KEY, JSON.stringify(whitelist));
        // Also remove any existing blocks for this IP
        await this.unblockIp(ip);
        this.logger.log(`IP added to whitelist: ${ip}`);
      }
    } catch (error) {
      this.logger.error(`Failed to add IP ${ip} to whitelist:`, error);
    }
  }

  /**
   * Remove IP from whitelist
   */
  async removeFromWhitelist(ip: string): Promise<void> {
    try {
      const whitelist = await this.getWhitelist();
      const index = whitelist.indexOf(ip);
      if (index > -1) {
        whitelist.splice(index, 1);
        await this.redisService.set(this.WHITELIST_KEY, JSON.stringify(whitelist));
        this.logger.log(`IP removed from whitelist: ${ip}`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove IP ${ip} from whitelist:`, error);
    }
  }

  /**
   * Get whitelist
   */
  async getWhitelist(): Promise<string[]> {
    try {
      const whitelistData = await this.redisService.get(this.WHITELIST_KEY);
      return whitelistData ? JSON.parse(whitelistData) : [];
    } catch (error) {
      this.logger.error('Failed to get whitelist:', error);
      return [];
    }
  }

  /**
   * Record failed attempt for IP
   */
  async recordFailedAttempt(ip: string, reason: string): Promise<void> {
    try {
      const attemptKey = `${this.ATTEMPT_KEY_PREFIX}:${ip}`;
      const maxAttempts = this.configService.get<number>('MAX_FAILED_ATTEMPTS', 5);
      const windowMs = this.configService.get<number>('FAILED_ATTEMPT_WINDOW_MS', 900000); // 15 minutes

      // Get current attempts
      const attemptsData = await this.redisService.get(attemptKey);
      const attempts = attemptsData ? JSON.parse(attemptsData) : [];

      // Add new attempt
      attempts.push({
        timestamp: Date.now(),
        reason,
      });

      // Filter out old attempts outside the window
      const windowStart = Date.now() - windowMs;
      const recentAttempts = attempts.filter((attempt: any) => attempt.timestamp > windowStart);

      // Store updated attempts
      await this.redisService.setex(attemptKey, Math.ceil(windowMs / 1000), JSON.stringify(recentAttempts));

      // Auto-block if too many attempts
      if (recentAttempts.length >= maxAttempts) {
        const blockDuration = this.configService.get<number>('AUTO_BLOCK_DURATION_MS', 3600000); // 1 hour
        await this.blockIp(ip, `Too many failed attempts (${recentAttempts.length})`, blockDuration);
      }
    } catch (error) {
      this.logger.error(`Failed to record failed attempt for IP ${ip}:`, error);
    }
  }

  /**
   * Get block information for an IP
   */
  async getBlockInfo(ip: string): Promise<IpBlockInfo | null> {
    try {
      const blockKey = `${this.BLOCK_KEY_PREFIX}:${ip}`;
      const blockData = await this.redisService.get(blockKey);
      return blockData ? JSON.parse(blockData) : null;
    } catch (error) {
      this.logger.error(`Failed to get block info for IP ${ip}:`, error);
      return null;
    }
  }

  /**
   * Get all blocked IPs
   */
  async getBlockedIps(): Promise<IpBlockInfo[]> {
    try {
      const pattern = `${this.BLOCK_KEY_PREFIX}:*`;
      const keys = await this.redisService.keys(pattern);
      const blockInfos: IpBlockInfo[] = [];

      for (const key of keys) {
        const blockData = await this.redisService.get(key);
        if (blockData) {
          blockInfos.push(JSON.parse(blockData));
        }
      }

      return blockInfos;
    } catch (error) {
      this.logger.error('Failed to get blocked IPs:', error);
      return [];
    }
  }

  /**
   * Check if request should be blocked based on security rules
   */
  async shouldBlockRequest(
    ip: string,
    userAgent?: string,
    path?: string,
  ): Promise<{ shouldBlock: boolean; reason?: string }> {
    // Check if IP is blocked
    if (await this.isIpBlocked(ip)) {
      return { shouldBlock: true, reason: 'IP is blocked' };
    }

    // Check if IP is whitelisted
    if (await this.isIpWhitelisted(ip)) {
      return { shouldBlock: false };
    }

    // Add more sophisticated blocking rules here
    // For example: suspicious user agents, known malicious patterns, etc.

    return { shouldBlock: false };
  }
}
