import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HealthMetric {
  timestamp: Date;
  service: string;
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  details?: any;
}

export interface HealthAnalytics {
  totalChecks: number;
  healthyChecks: number;
  unhealthyChecks: number;
  averageResponseTime: number;
  lastCheck: Date;
  serviceHealth: Record<string, {
    totalChecks: number;
    successRate: number;
    averageResponseTime: number;
    lastStatus: 'healthy' | 'unhealthy';
    lastCheck: Date;
  }>;
}

@Injectable()
export class HealthAnalyticsService {
  private metrics: HealthMetric[] = [];
  private maxMetricsCount = 1000; // Keep last 1000 metrics

  constructor(private configService: ConfigService) {}

  recordHealthCheck(service: string, status: 'healthy' | 'unhealthy', responseTime: number, details?: any): void {
    const metric: HealthMetric = {
      timestamp: new Date(),
      service,
      status,
      responseTime,
      details,
    };

    this.metrics.push(metric);

    // Keep only the last maxMetricsCount metrics
    if (this.metrics.length > this.maxMetricsCount) {
      this.metrics = this.metrics.slice(-this.maxMetricsCount);
    }
  }

  getAnalytics(): HealthAnalytics {
    if (this.metrics.length === 0) {
      return this.getEmptyAnalytics();
    }

    const totalChecks = this.metrics.length;
    const healthyChecks = this.metrics.filter(m => m.status === 'healthy').length;
    const unhealthyChecks = totalChecks - healthyChecks;
    const averageResponseTime = this.metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalChecks;
    const lastCheck = this.metrics[this.metrics.length - 1].timestamp;

    // Group by service
    const serviceGroups = this.metrics.reduce((groups, metric) => {
      if (!groups[metric.service]) {
        groups[metric.service] = [];
      }
      groups[metric.service].push(metric);
      return groups;
    }, {} as Record<string, HealthMetric[]>);

    const serviceHealth = Object.entries(serviceGroups).reduce((result, [service, serviceMetrics]) => {
      const serviceTotalChecks = serviceMetrics.length;
      const serviceHealthyChecks = serviceMetrics.filter(m => m.status === 'healthy').length;
      const serviceSuccessRate = (serviceHealthyChecks / serviceTotalChecks) * 100;
      const serviceAverageResponseTime = serviceMetrics.reduce((sum, m) => sum + m.responseTime, 0) / serviceTotalChecks;
      const lastServiceMetric = serviceMetrics[serviceMetrics.length - 1];

      result[service] = {
        totalChecks: serviceTotalChecks,
        successRate: Math.round(serviceSuccessRate * 100) / 100,
        averageResponseTime: Math.round(serviceAverageResponseTime * 100) / 100,
        lastStatus: lastServiceMetric.status,
        lastCheck: lastServiceMetric.timestamp,
      };

      return result;
    }, {} as Record<string, any>);

    return {
      totalChecks,
      healthyChecks,
      unhealthyChecks,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      lastCheck,
      serviceHealth,
    };
  }

  getMetricsByTimeRange(startTime: Date, endTime: Date): HealthMetric[] {
    return this.metrics.filter(
      metric => metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  }

  getServiceMetrics(service: string): HealthMetric[] {
    return this.metrics.filter(metric => metric.service === service);
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  private getEmptyAnalytics(): HealthAnalytics {
    return {
      totalChecks: 0,
      healthyChecks: 0,
      unhealthyChecks: 0,
      averageResponseTime: 0,
      lastCheck: new Date(),
      serviceHealth: {},
    };
  }
}
