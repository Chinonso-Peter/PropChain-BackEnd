import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RateLimitingService } from './services/rate-limiting.service';
import { IpBlockingService } from './services/ip-blocking.service';
import { DdosProtectionService } from './services/ddos-protection.service';
import { ApiQuotaService } from './services/api-quota.service';
import { SecurityHeadersService } from './services/security-headers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// RBAC imports - uncomment when RBAC module is available
// import { RbacGuard } from '../rbac/guards/rbac.guard';
// import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

export interface BlockIpDto {
  ip: string;
  reason: string;
  duration?: number; // in milliseconds
}

export interface SetQuotaDto {
  apiKeyId: string;
  plan: string;
  userId?: string;
  expiresAt?: Date;
}

@Controller('security')
@ApiTags('security')
@UseGuards(JwtAuthGuard)
// @UseGuards(JwtAuthGuard, RbacGuard) // Uncomment when RBAC is available
export class SecurityController {
  constructor(
    private readonly rateLimitingService: RateLimitingService,
    private readonly ipBlockingService: IpBlockingService,
    private readonly ddosProtectionService: DdosProtectionService,
    private readonly apiQuotaService: ApiQuotaService,
    private readonly securityHeadersService: SecurityHeadersService,
  ) {}

  // Rate Limiting Endpoints
  @Get('rate-limit/:key')
  @ApiOperation({ summary: 'Get rate limit information' })
  @ApiResponse({ status: 200, description: 'Rate limit info retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getRateLimit(@Param('key') key: string, @Query('type') type?: string) {
    const config = this.rateLimitingService.getDefaultConfigurations()[type || 'api'];
    const info = await this.rateLimitingService.getRateLimitInfo(key, config);
    return {
      key,
      type: type || 'api',
      ...info,
    };
  }

  @Delete('rate-limit/:key')
  @ApiOperation({ summary: 'Reset rate limit for a key' })
  @ApiResponse({ status: 200, description: 'Rate limit reset successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async resetRateLimit(@Param('key') key: string, @Query('type') type?: string) {
    await this.rateLimitingService.resetRateLimit(key, type);
    return { message: 'Rate limit reset successfully', key, type };
  }

  // IP Blocking Endpoints
  @Get('ip-blocks')
  @ApiOperation({ summary: 'Get all blocked IPs' })
  @ApiResponse({ status: 200, description: 'Blocked IPs retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getBlockedIps() {
    const blockedIps = await this.ipBlockingService.getBlockedIps();
    return { blockedIps, count: blockedIps.length };
  }

  @Post('ip-blocks')
  @ApiOperation({ summary: 'Block an IP address' })
  @ApiResponse({ status: 201, description: 'IP blocked successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async blockIp(@Body() blockDto: BlockIpDto) {
    await this.ipBlockingService.blockIp(blockDto.ip, blockDto.reason, blockDto.duration);
    return {
      message: 'IP blocked successfully',
      ip: blockDto.ip,
      reason: blockDto.reason,
      duration: blockDto.duration,
    };
  }

  @Delete('ip-blocks/:ip')
  @ApiOperation({ summary: 'Unblock an IP address' })
  @ApiResponse({ status: 200, description: 'IP unblocked successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async unblockIp(@Param('ip') ip: string) {
    await this.ipBlockingService.unblockIp(ip);
    return { message: 'IP unblocked successfully', ip };
  }

  @Get('ip-whitelist')
  @ApiOperation({ summary: 'Get IP whitelist' })
  @ApiResponse({ status: 200, description: 'Whitelist retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getWhitelist() {
    const whitelist = await this.ipBlockingService.getWhitelist();
    return { whitelist, count: whitelist.length };
  }

  @Post('ip-whitelist')
  @ApiOperation({ summary: 'Add IP to whitelist' })
  @ApiResponse({ status: 200, description: 'IP added to whitelist successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async addToWhitelist(@Body() { ip }: { ip: string }) {
    await this.ipBlockingService.addToWhitelist(ip);
    return { message: 'IP added to whitelist successfully', ip };
  }

  @Delete('ip-whitelist/:ip')
  @ApiOperation({ summary: 'Remove IP from whitelist' })
  @ApiResponse({ status: 200, description: 'IP removed from whitelist successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async removeFromWhitelist(@Param('ip') ip: string) {
    await this.ipBlockingService.removeFromWhitelist(ip);
    return { message: 'IP removed from whitelist successfully', ip };
  }

  // DDoS Protection Endpoints
  @Get('ddos/status')
  @ApiOperation({ summary: 'Get DDoS protection status' })
  @ApiResponse({ status: 200, description: 'Protection status retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getDdosStatus() {
    const status = await this.ddosProtectionService.getProtectionStatus();
    return status;
  }

  @Get('ddos/attacks')
  @ApiOperation({ summary: 'Get recent DDoS attacks' })
  @ApiResponse({ status: 200, description: 'Attacks retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getRecentAttacks(@Query('hours') hours?: number) {
    const attacks = await this.ddosProtectionService.getRecentAttacks(hours);
    return { attacks, count: attacks.length };
  }

  @Post('ddos/block-ip')
  @ApiOperation({ summary: 'Manually block IP for DDoS protection' })
  @ApiResponse({ status: 200, description: 'IP blocked successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async manualBlockIp(@Body() { ip, duration }: { ip: string; duration?: number }) {
    await this.ddosProtectionService.manualBlockIp(ip, duration);
    return { message: 'IP blocked for DDoS protection', ip, duration };
  }

  @Delete('ddos/block-ip/:ip')
  @ApiOperation({ summary: 'Unblock IP from DDoS protection' })
  @ApiResponse({ status: 200, description: 'IP unblocked successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async manualUnblockIp(@Param('ip') ip: string) {
    await this.ddosProtectionService.unblockIp(ip);
    return { message: 'IP unblocked from DDoS protection', ip };
  }

  // API Quota Endpoints
  @Get('quotas')
  @ApiOperation({ summary: 'Get all API quotas' })
  @ApiResponse({ status: 200, description: 'Quotas retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getAllQuotas() {
    const quotas = await this.apiQuotaService.getAllQuotas();
    return { quotas, count: quotas.length };
  }

  @Get('quotas/:apiKeyId')
  @ApiOperation({ summary: 'Get quota for specific API key' })
  @ApiResponse({ status: 200, description: 'Quota retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getQuota(@Param('apiKeyId') apiKeyId: string) {
    const quota = await this.apiQuotaService.getQuota(apiKeyId);
    return quota ? { quota } : { message: 'No quota found for this API key' };
  }

  @Post('quotas')
  @ApiOperation({ summary: 'Set quota for API key' })
  @ApiResponse({ status: 201, description: 'Quota set successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async setQuota(@Body() quotaDto: SetQuotaDto) {
    const quota = await this.apiQuotaService.setQuota(
      quotaDto.apiKeyId,
      quotaDto.plan,
      quotaDto.userId,
      quotaDto.expiresAt,
    );
    return { message: 'Quota set successfully', quota };
  }

  @Delete('quotas/:apiKeyId')
  @ApiOperation({ summary: 'Remove quota for API key' })
  @ApiResponse({ status: 200, description: 'Quota removed successfully' })
  // @RequirePermissions('security.write') // Uncomment when RBAC is available
  async removeQuota(@Param('apiKeyId') apiKeyId: string) {
    await this.apiQuotaService.removeQuota(apiKeyId);
    return { message: 'Quota removed successfully', apiKeyId };
  }

  @Get('quotas/plans/available')
  @ApiOperation({ summary: 'Get available quota plans' })
  @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getAvailablePlans() {
    const plans = this.apiQuotaService.getAvailablePlans();
    return { plans };
  }

  // Security Headers Endpoints
  @Get('headers')
  @ApiOperation({ summary: 'Get current security headers configuration' })
  @ApiResponse({ status: 200, description: 'Headers configuration retrieved successfully' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async getSecurityHeaders() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const config = isDevelopment ? this.securityHeadersService.getDevelopmentConfig() : undefined;

    const headers = this.securityHeadersService.getSecurityHeaders(config);
    return { headers, environment: process.env.NODE_ENV };
  }

  @Get('headers/validate')
  @ApiOperation({ summary: 'Validate security headers configuration' })
  @ApiResponse({ status: 200, description: 'Configuration validation completed' })
  // @RequirePermissions('security.read') // Uncomment when RBAC is available
  async validateHeaders() {
    const config = {
      csp: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    };
    const errors = this.securityHeadersService.validateConfig(config);
    return {
      valid: errors.length === 0,
      errors,
      config,
    };
  }
}
