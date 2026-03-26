import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { BlockchainHealthIndicator } from './indicators/blockchain.health';
import { MemoryHealthIndicator } from './indicators/memory.health';
import { CpuHealthIndicator } from './indicators/cpu.health';
import { DiskHealthIndicator } from './indicators/disk.health';
import { DependenciesHealthIndicator } from './indicators/dependencies.health';
import { HealthAnalyticsService } from './health-analytics.service';

@Injectable()
export class HealthSchedulerService {
  private readonly logger = new Logger(HealthSchedulerService.name);

  constructor(
    private health: HealthCheckService,
    private dbHealth: DatabaseHealthIndicator,
    private redisHealth: RedisHealthIndicator,
    private blockchainHealth: BlockchainHealthIndicator,
    private memoryHealth: MemoryHealthIndicator,
    private cpuHealth: CpuHealthIndicator,
    private diskHealth: DiskHealthIndicator,
    private dependenciesHealth: DependenciesHealthIndicator,
    private healthAnalytics: HealthAnalyticsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async performScheduledHealthCheck() {
    this.logger.debug('Performing scheduled health check...');
    
    try {
      const startTime = Date.now();
      const result = await this.health.check([
        () => this.dbHealth.isHealthy('database'),
        () => this.redisHealth.isHealthy('redis'),
        () => this.memoryHealth.isHealthy('memory'),
        () => this.cpuHealth.isHealthy('cpu'),
        () => this.diskHealth.isHealthy('disk'),
      ]);

      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('scheduled', 'healthy', responseTime);
      
      this.logger.debug(`Scheduled health check completed successfully in ${responseTime}ms`);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('scheduled', 'unhealthy', responseTime);
      
      this.logger.error(`Scheduled health check failed in ${responseTime}ms:`, error.message);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async performExtendedHealthCheck() {
    this.logger.debug('Performing extended health check...');
    
    try {
      const startTime = Date.now();
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
      this.healthAnalytics.recordHealthCheck('extended', 'healthy', responseTime);
      
      this.logger.debug(`Extended health check completed successfully in ${responseTime}ms`);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('extended', 'unhealthy', responseTime);
      
      this.logger.error(`Extended health check failed in ${responseTime}ms:`, error.message);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async performDependencyHealthCheck() {
    this.logger.debug('Performing dependency health check...');
    
    try {
      const startTime = Date.now();
      const result = await this.health.check([
        () => this.dependenciesHealth.isHealthy('dependencies'),
      ]);

      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('dependencies', 'healthy', responseTime);
      
      this.logger.debug(`Dependency health check completed successfully in ${responseTime}ms`);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck('dependencies', 'unhealthy', responseTime);
      
      this.logger.error(`Dependency health check failed in ${responseTime}ms:`, error.message);
    }
  }

  @Cron('0 0 * * *') // Daily at midnight
  async cleanupOldMetrics() {
    this.logger.debug('Cleaning up old health metrics...');
    
    try {
      // Keep only last 24 hours of metrics
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentMetrics = this.healthAnalytics.getMetricsByTimeRange(twentyFourHoursAgo, new Date());
      
      this.logger.debug(`Cleaned up metrics, keeping ${recentMetrics.length} recent metrics`);
    } catch (error) {
      this.logger.error('Failed to cleanup old metrics:', error.message);
    }
  }

  async triggerManualHealthCheck(type: 'basic' | 'detailed' | 'dependencies' = 'basic') {
    this.logger.log(`Manual health check triggered: ${type}`);
    
    try {
      const startTime = Date.now();
      let checks = [];

      switch (type) {
        case 'basic':
          checks = [
            () => this.dbHealth.isHealthy('database'),
            () => this.redisHealth.isHealthy('redis'),
          ];
          break;
        case 'detailed':
          checks = [
            () => this.dbHealth.isHealthy('database'),
            () => this.redisHealth.isHealthy('redis'),
            () => this.blockchainHealth.isHealthy('blockchain'),
            () => this.memoryHealth.isHealthy('memory'),
            () => this.cpuHealth.isHealthy('cpu'),
            () => this.diskHealth.isHealthy('disk'),
          ];
          break;
        case 'dependencies':
          checks = [
            () => this.dependenciesHealth.isHealthy('dependencies'),
          ];
          break;
      }

      const result = await this.health.check(checks);
      const responseTime = Date.now() - startTime;
      
      this.healthAnalytics.recordHealthCheck(`manual-${type}`, 'healthy', responseTime);
      this.logger.log(`Manual ${type} health check completed successfully in ${responseTime}ms`);
      
      return { success: true, result, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.healthAnalytics.recordHealthCheck(`manual-${type}`, 'unhealthy', responseTime);
      
      this.logger.error(`Manual ${type} health check failed in ${responseTime}ms:`, error.message);
      
      return { success: false, error: error.message, responseTime };
    }
  }
}
