import { Controller, Get, Query, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { BlockchainHealthIndicator } from './indicators/blockchain.health';
import { MemoryHealthIndicator } from './indicators/memory.health';
import { CpuHealthIndicator } from './indicators/cpu.health';
import { DiskHealthIndicator } from './indicators/disk.health';
import { DependenciesHealthIndicator } from './indicators/dependencies.health';
import { HealthAnalyticsService, HealthAnalytics } from './health-analytics.service';
import { HealthSchedulerService } from './health-scheduler.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private dbHealth: DatabaseHealthIndicator,
    private redisHealth: RedisHealthIndicator,
    private blockchainHealth: BlockchainHealthIndicator,
    private memoryHealth: MemoryHealthIndicator,
    private cpuHealth: CpuHealthIndicator,
    private diskHealth: DiskHealthIndicator,
    private dependenciesHealth: DependenciesHealthIndicator,
    private healthAnalytics: HealthAnalyticsService,
    private healthScheduler: HealthSchedulerService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async check() {
    const startTime = Date.now();
    try {
      const result = await this.health.check([
        () => this.dbHealth.isHealthy('database'),
        () => this.redisHealth.isHealthy('redis'),
      ]);
      
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('basic', 'healthy', responseTime);
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('basic', 'unhealthy', responseTime);
      throw error;
    }
  }

  @Get('detailed')
  @HealthCheck()
  @ApiOperation({ summary: 'Detailed health check with all services' })
  @ApiResponse({ status: 200, description: 'All services are healthy' })
  @ApiResponse({ status: 503, description: 'One or more services are unhealthy' })
  async checkDetailed() {
    const startTime = Date.now();
    try {
      const result = await this.health.check([
        () => this.dbHealth.isHealthy('database'),
        () => this.redisHealth.isHealthy('redis'),
        () => this.blockchainHealth.isHealthy('blockchain'),
        () => this.memoryHealth.isHealthy('memory'),
        () => this.cpuHealth.isHealthy('cpu'),
        () => this.diskHealth.isHealthy('disk'),
        () => this.dependenciesHealth.isHealthy('dependencies'),
      ]);
      
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('detailed', 'healthy', responseTime);
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('detailed', 'unhealthy', responseTime);
      throw error;
    }
  }

  @Get('comprehensive')
  @HealthCheck()
  @ApiOperation({ summary: 'Comprehensive health check with analytics' })
  @ApiResponse({ status: 200, description: 'All services are healthy with analytics' })
  @ApiResponse({ status: 503, description: 'One or more services are unhealthy' })
  async checkComprehensive() {
    const startTime = Date.now();
    try {
      const healthResult = await this.health.check([
        () => this.dbHealth.isHealthy('database'),
        () => this.redisHealth.isHealthy('redis'),
        () => this.blockchainHealth.isHealthy('blockchain'),
        () => this.memoryHealth.isHealthy('memory'),
        () => this.cpuHealth.isHealthy('cpu'),
        () => this.diskHealth.isHealthy('disk'),
        () => this.dependenciesHealth.isHealthy('dependencies'),
      ]);
      
      const analytics = this.healthAnalytics.getAnalytics();
      const responseTime = Date.now() - startTime;
      
      this.healthAnalytics.recordHealthCheck('comprehensive', 'healthy', responseTime);
      
      return {
        ...healthResult,
        analytics,
        systemInfo: this.getSystemInfo(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('comprehensive', 'unhealthy', responseTime);
      
      return {
        status: 'error',
        error: error.message,
        analytics: this.healthAnalytics.getAnalytics(),
        systemInfo: this.getSystemInfo(),
        responseTime: `${responseTime}ms`,
      };
    }
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
    };
  }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Service is ready to accept traffic' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async readiness() {
    const startTime = Date.now();
    try {
      const result = await this.health.check([
        () => this.dbHealth.isHealthy('database'), 
        () => this.redisHealth.isHealthy('redis')
      ]);
      
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('readiness', 'healthy', responseTime);
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('readiness', 'unhealthy', responseTime);
      throw error;
    }
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get health check analytics' })
  @ApiResponse({ status: 200, description: 'Analytics data retrieved successfully' })
  getAnalytics(): HealthAnalytics {
    return this.healthAnalytics.getAnalytics();
  }

  @Get('analytics/clear')
  @ApiOperation({ summary: 'Clear health check analytics' })
  @ApiResponse({ status: 200, description: 'Analytics cleared successfully' })
  clearAnalytics(): { message: string } {
    this.healthAnalytics.clearMetrics();
    return { message: 'Health check analytics cleared successfully' };
  }

  @Get('dependencies')
  @ApiOperation({ summary: 'Get configured dependencies' })
  @ApiResponse({ status: 200, description: 'Dependencies retrieved successfully' })
  getDependencies() {
    return {
      dependencies: this.dependenciesHealth.getDependencies(),
    };
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger manual health check' })
  @ApiQuery({ name: 'type', required: false, enum: ['basic', 'detailed', 'dependencies'], description: 'Type of health check to trigger' })
  @ApiResponse({ status: 200, description: 'Health check triggered successfully' })
  async triggerManualHealthCheck(@Query('type') type: 'basic' | 'detailed' | 'dependencies' = 'basic') {
    return this.healthScheduler.triggerManualHealthCheck(type);
  }

  private getSystemInfo() {
    const os = require('os');
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
    };
  }
}
