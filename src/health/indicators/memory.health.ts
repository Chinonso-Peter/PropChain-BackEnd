import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

@Injectable()
export class MemoryHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const memUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      const usedMemory = totalMemory - freeMemory;
      
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100;
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100;
      const systemUsedMB = Math.round(usedMemory / 1024 / 1024 * 100) / 100;
      const systemTotalMB = Math.round(totalMemory / 1024 / 1024 * 100) / 100;
      
      // Consider unhealthy if heap usage is above 80% of heap total
      const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      const isHealthy = heapUsagePercent < 80;
      
      const details = {
        heap: {
          used: `${heapUsedMB} MB`,
          total: `${heapTotalMB} MB`,
          usagePercent: Math.round(heapUsagePercent * 100) / 100,
        },
        system: {
          used: `${systemUsedMB} MB`,
          total: `${systemTotalMB} MB`,
          usagePercent: Math.round((usedMemory / totalMemory) * 100 * 100) / 100,
        },
        external: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024 * 100) / 100} MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024 * 100) / 100} MB`,
        },
      };

      if (isHealthy) {
        return this.getStatus(key, true, details);
      } else {
        throw new HealthCheckError('Memory usage is too high', this.getStatus(key, false, details));
      }
    } catch (error) {
      throw new HealthCheckError('Memory health check failed', this.getStatus(key, false, { error: error.message }));
    }
  }
}
