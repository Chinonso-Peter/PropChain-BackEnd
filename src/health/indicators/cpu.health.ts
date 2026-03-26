import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import * as os from 'os';

@Injectable()
export class CpuHealthIndicator extends HealthIndicator {
  private lastCpuUsage = process.cpuUsage();
  private lastMeasureTime = Date.now();

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastMeasureTime;
      
      // Update for next measurement
      this.lastCpuUsage = process.cpuUsage();
      this.lastMeasureTime = currentTime;
      
      // Calculate CPU usage percentage
      const cpuPercent = ((currentCpuUsage.user + currentCpuUsage.system) / (timeDiff * 1000)) * 100;
      
      const loadAverage = os.loadavg();
      const cpuCount = os.cpus().length;
      
      const details = {
        process: {
          usagePercent: Math.round(cpuPercent * 100) / 100,
          user: currentCpuUsage.user,
          system: currentCpuUsage.system,
        },
        system: {
          loadAverage: {
            '1min': Math.round(loadAverage[0] * 100) / 100,
            '5min': Math.round(loadAverage[1] * 100) / 100,
            '15min': Math.round(loadAverage[2] * 100) / 100,
          },
          cpuCount,
          loadPercentage: Math.round((loadAverage[0] / cpuCount) * 100 * 100) / 100,
        },
        platform: os.platform(),
        arch: os.arch(),
      };
      
      // Consider unhealthy if CPU usage is above 90% or load average is too high
      const isHealthy = cpuPercent < 90 && (loadAverage[0] / cpuCount) < 2;
      
      if (isHealthy) {
        return this.getStatus(key, true, details);
      } else {
        throw new HealthCheckError('CPU usage is too high', this.getStatus(key, false, details));
      }
    } catch (error) {
      throw new HealthCheckError('CPU health check failed', this.getStatus(key, false, { error: error.message }));
    }
  }
}
