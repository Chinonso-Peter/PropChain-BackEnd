import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { IpBlockingService } from '../services/ip-blocking.service';
import { DdosProtectionService } from '../services/ddos-protection.service';
import { SecurityHeadersService } from '../services/security-headers.service';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityMiddleware.name);

  constructor(
    private readonly ipBlockingService: IpBlockingService,
    private readonly ddosProtectionService: DdosProtectionService,
    private readonly securityHeadersService: SecurityHeadersService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const clientIp = this.getClientIp(req);
      const userAgent = req.headers['user-agent'] || '';
      const path = req.path;

      // 1. Check IP blocking
      const blockCheck = await this.ipBlockingService.shouldBlockRequest(clientIp, userAgent, path);

      if (blockCheck.shouldBlock) {
        this.logger.warn(`Blocked request from IP ${clientIp}: ${blockCheck.reason}`);
        return res.status(403).json({
          statusCode: 403,
          message: 'Access forbidden',
          reason: blockCheck.reason,
          timestamp: new Date().toISOString(),
        });
      }

      // 2. Check DDoS protection
      const ddosCheck = await this.ddosProtectionService.monitorTraffic(clientIp, path, userAgent);

      if (ddosCheck.isAttack) {
        this.logger.warn(`DDoS attack detected from IP ${clientIp}`);
        return res.status(429).json({
          statusCode: 429,
          message: 'Too many requests',
          reason: 'Potential DDoS attack detected',
          timestamp: new Date().toISOString(),
        });
      }

      // 3. Check if IP is blocked for DDoS
      if (await this.ddosProtectionService.isIpBlockedForDdos(clientIp)) {
        this.logger.warn(`Request blocked due to DDoS protection from IP ${clientIp}`);
        return res.status(429).json({
          statusCode: 429,
          message: 'Too many requests',
          reason: 'IP blocked due to DDoS protection',
          timestamp: new Date().toISOString(),
        });
      }

      // 4. Set security headers
      const securityHeaders = this.securityHeadersService.getSecurityHeaders();
      Object.entries<string>(securityHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // 5. Add security-related request properties
      (req as any).security = {
        clientIp,
        userAgent,
        timestamp: Date.now(),
      };

      next();
    } catch (error) {
      this.logger.error('Security middleware error:', error);
      // Fail open - allow request if security checks fail
      next();
    }
  }

  private getClientIp(req: Request): string {
    // Handle various proxy headers
    return (
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.headers['x-real-ip']?.toString() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }
}
