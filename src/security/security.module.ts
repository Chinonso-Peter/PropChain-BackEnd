import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../common/services/redis.module';
import { RateLimitingService } from './services/rate-limiting.service';
import { IpBlockingService } from './services/ip-blocking.service';
import { DdosProtectionService } from './services/ddos-protection.service';
import { ApiQuotaService } from './services/api-quota.service';
import { SecurityHeadersService } from './services/security-headers.service';
import { SecurityController } from './security.controller';

@Module({
  imports: [ConfigModule, RedisModule],
  controllers: [SecurityController],
  providers: [RateLimitingService, IpBlockingService, DdosProtectionService, ApiQuotaService, SecurityHeadersService],
  exports: [RateLimitingService, IpBlockingService, DdosProtectionService, ApiQuotaService, SecurityHeadersService],
})
export class SecurityModule {}
