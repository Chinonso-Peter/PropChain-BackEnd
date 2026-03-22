import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';

/**
 * Database Performance Monitor Service
 *
 * Monitors database performance metrics and provides alerts
 */
@Injectable()
export class PerformanceMonitorService extends EventEmitter {
  private readonly logger = new Logger(PerformanceMonitorService.name);
  private metrics: PerformanceMetrics = {
    connections: 0,
    activeConnections: 0,
    idleConnections: 0,
    totalQueries: 0,
    slowQueries: 0,
    avgResponseTime: 0,
    maxResponseTime: 0,
    cacheHitRate: 0,
    indexUsage: new Map(),
    tableStats: new Map(),
    timestamp: new Date(),
  };

  private alertThresholds = {
    slowQueryTime: 1000,
    connectionUtilization: 0.8,
    avgResponseTime: 500,
    cacheHitRate: 0.9,
    indexUsage: 0.1,
  };

  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
    this.loadThresholds();
    this.startMonitoring();
  }

  /**
   * Update connection metrics
   */
  updateConnectionMetrics(metrics: ConnectionMetrics): void {
    this.metrics.connections = metrics.total;
    this.metrics.activeConnections = metrics.active;
    this.metrics.idleConnections = metrics.idle;

    // Check for connection alerts
    const utilization = metrics.active / metrics.total;
    if (utilization > this.alertThresholds.connectionUtilization) {
      this.emitAlert('HIGH_CONNECTION_UTILIZATION', {
        utilization,
        active: metrics.active,
        total: metrics.total,
      });
    }
  }

  /**
   * Record query execution
   */
  recordQuery(query: string, executionTime: number, success: boolean): void {
    this.metrics.totalQueries++;

    if (executionTime > this.alertThresholds.slowQueryTime) {
      this.metrics.slowQueries++;
      this.emitAlert('SLOW_QUERY', {
        query: query.substring(0, 200),
        executionTime,
      });
    }

    // Update response time metrics
    this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, executionTime);
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (this.metrics.totalQueries - 1) + executionTime) / this.metrics.totalQueries;

    if (this.metrics.avgResponseTime > this.alertThresholds.avgResponseTime) {
      this.emitAlert('HIGH_RESPONSE_TIME', {
        avgTime: this.metrics.avgResponseTime,
        queryCount: this.metrics.totalQueries,
      });
    }
  }

  /**
   * Update cache metrics
   */
  updateCacheMetrics(hitRate: number): void {
    this.metrics.cacheHitRate = hitRate;

    if (hitRate < this.alertThresholds.cacheHitRate) {
      this.emitAlert('LOW_CACHE_HIT_RATE', {
        hitRate,
        threshold: this.alertThresholds.cacheHitRate,
      });
    }
  }

  /**
   * Update index usage statistics
   */
  updateIndexUsage(indexName: string, usageCount: number): void {
    this.metrics.indexUsage.set(indexName, usageCount);

    if (usageCount < this.alertThresholds.indexUsage) {
      this.emitAlert('UNUSED_INDEX', {
        indexName,
        usageCount,
      });
    }
  }

  /**
   * Update table statistics
   */
  updateTableStats(tableName: string, stats: TablePerformanceStats): void {
    this.metrics.tableStats.set(tableName, stats);

    // Check for table-specific alerts
    if (stats.avgRowLockTime > 100) {
      this.emitAlert('HIGH_LOCK_TIME', {
        tableName,
        avgLockTime: stats.avgRowLockTime,
      });
    }

    if (stats.deadlockCount > 0) {
      this.emitAlert('DEADLOCK_DETECTED', {
        tableName,
        deadlockCount: stats.deadlockCount,
      });
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance report
   */
  generatePerformanceReport(): PerformanceReport {
    const now = new Date();
    const report: PerformanceReport = {
      timestamp: now,
      summary: {
        totalQueries: this.metrics.totalQueries,
        slowQueries: this.metrics.slowQueries,
        slowQueryRate: this.metrics.totalQueries > 0 ? this.metrics.slowQueries / this.metrics.totalQueries : 0,
        avgResponseTime: this.metrics.avgResponseTime,
        maxResponseTime: this.metrics.maxResponseTime,
        connectionUtilization:
          this.metrics.connections > 0 ? this.metrics.activeConnections / this.metrics.connections : 0,
        cacheHitRate: this.metrics.cacheHitRate,
      },
      alerts: this.getRecentAlerts(),
      recommendations: this.generateRecommendations(),
      trends: this.calculateTrends(),
    };

    return report;
  }

  /**
   * Get database health score
   */
  getHealthScore(): HealthScore {
    let score = 100;
    const issues: string[] = [];

    // Response time impact
    if (this.metrics.avgResponseTime > 1000) {
      score -= 30;
      issues.push('Very high average response time');
    } else if (this.metrics.avgResponseTime > 500) {
      score -= 15;
      issues.push('High average response time');
    }

    // Slow query rate impact
    const slowQueryRate = this.metrics.totalQueries > 0 ? this.metrics.slowQueries / this.metrics.totalQueries : 0;
    if (slowQueryRate > 0.1) {
      score -= 25;
      issues.push('High slow query rate');
    } else if (slowQueryRate > 0.05) {
      score -= 10;
      issues.push('Moderate slow query rate');
    }

    // Connection utilization impact
    const connectionUtil = this.metrics.connections > 0 ? this.metrics.activeConnections / this.metrics.connections : 0;
    if (connectionUtil > 0.9) {
      score -= 20;
      issues.push('Very high connection utilization');
    } else if (connectionUtil > 0.8) {
      score -= 10;
      issues.push('High connection utilization');
    }

    // Cache hit rate impact
    if (this.metrics.cacheHitRate < 0.8) {
      score -= 15;
      issues.push('Low cache hit rate');
    } else if (this.metrics.cacheHitRate < 0.9) {
      score -= 5;
      issues.push('Moderate cache hit rate');
    }

    return {
      score: Math.max(0, score),
      status: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
      issues,
    };
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    const interval = this.configService.get<number>('PERFORMANCE_MONITORING_INTERVAL', 60000);

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.checkAlerts();
    }, interval);

    this.logger.log(`Performance monitoring started with ${interval}ms interval`);
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.log('Performance monitoring stopped');
    }
  }

  /**
   * Collect metrics from database
   */
  private async collectMetrics(): Promise<void> {
    try {
      // This would collect actual metrics from the database
      // For now, we'll simulate some basic collection

      this.metrics.timestamp = new Date();

      // Emit metrics event for other services to consume
      this.emit('metrics', this.metrics);
    } catch (error) {
      this.logger.error('Failed to collect performance metrics:', error);
    }
  }

  /**
   * Check for alerts
   */
  private checkAlerts(): void {
    const healthScore = this.getHealthScore();

    if (healthScore.score < 50) {
      this.emitAlert('POOR_PERFORMANCE', {
        score: healthScore.score,
        issues: healthScore.issues,
      });
    }
  }

  /**
   * Emit alert
   */
  private emitAlert(type: string, data: any): void {
    const alert: PerformanceAlert = {
      type,
      severity: this.getAlertSeverity(type),
      message: this.getAlertMessage(type, data),
      data,
      timestamp: new Date(),
    };

    this.emit('alert', alert);
    this.logger.warn(`Performance alert: ${alert.message}`);
  }

  /**
   * Get alert severity
   */
  private getAlertSeverity(type: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      SLOW_QUERY: 'medium',
      HIGH_CONNECTION_UTILIZATION: 'high',
      HIGH_RESPONSE_TIME: 'high',
      LOW_CACHE_HIT_RATE: 'medium',
      UNUSED_INDEX: 'low',
      HIGH_LOCK_TIME: 'medium',
      DEADLOCK_DETECTED: 'critical',
      POOR_PERFORMANCE: 'critical',
    };

    return severityMap[type] || 'medium';
  }

  /**
   * Get alert message
   */
  private getAlertMessage(type: string, data: any): string {
    const messages: Record<string, (data: any) => string> = {
      SLOW_QUERY: data => `Slow query detected: ${data.executionTime}ms`,
      HIGH_CONNECTION_UTILIZATION: data => `High connection utilization: ${(data.utilization * 100).toFixed(1)}%`,
      HIGH_RESPONSE_TIME: data => `High average response time: ${data.avgTime.toFixed(1)}ms`,
      LOW_CACHE_HIT_RATE: data => `Low cache hit rate: ${(data.hitRate * 100).toFixed(1)}%`,
      UNUSED_INDEX: data => `Unused index: ${data.indexName}`,
      HIGH_LOCK_TIME: data => `High lock time on table ${data.tableName}: ${data.avgLockTime}ms`,
      DEADLOCK_DETECTED: data => `Deadlock detected on table ${data.tableName}: ${data.deadlockCount} occurrences`,
      POOR_PERFORMANCE: data => `Poor performance score: ${data.score}/100`,
    };

    return messages[type]?.(data) || `Performance alert: ${type}`;
  }

  /**
   * Load alert thresholds from configuration
   */
  private loadThresholds(): void {
    this.alertThresholds = {
      slowQueryTime: this.configService.get<number>('SLOW_QUERY_THRESHOLD', 1000),
      connectionUtilization: this.configService.get<number>('CONNECTION_UTILIZATION_THRESHOLD', 0.8),
      avgResponseTime: this.configService.get<number>('AVG_RESPONSE_TIME_THRESHOLD', 500),
      cacheHitRate: this.configService.get<number>('CACHE_HIT_RATE_THRESHOLD', 0.9),
      indexUsage: this.configService.get<number>('INDEX_USAGE_THRESHOLD', 0.1),
    };
  }

  /**
   * Get recent alerts
   */
  private getRecentAlerts(): PerformanceAlert[] {
    // This would return recent alerts from storage
    // For now, return empty array
    return [];
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.metrics.avgResponseTime > 500) {
      recommendations.push('Optimize slow queries and add missing indexes');
    }

    if (this.metrics.slowQueries > this.metrics.totalQueries * 0.1) {
      recommendations.push('Review and optimize frequently executed slow queries');
    }

    if (this.metrics.cacheHitRate < 0.9) {
      recommendations.push('Optimize cache configuration and query patterns');
    }

    const connectionUtil = this.metrics.connections > 0 ? this.metrics.activeConnections / this.metrics.connections : 0;
    if (connectionUtil > 0.8) {
      recommendations.push('Consider increasing connection pool size or optimizing connection usage');
    }

    // Check for unused indexes
    for (const [indexName, usage] of this.metrics.indexUsage.entries()) {
      if (usage < this.alertThresholds.indexUsage) {
        recommendations.push(`Consider dropping unused index: ${indexName}`);
      }
    }

    return recommendations;
  }

  /**
   * Calculate performance trends
   */
  private calculateTrends(): PerformanceTrends {
    // This would calculate trends based on historical data
    // For now, return placeholder
    return {
      queryCount: [],
      responseTime: [],
      connectionUtilization: [],
      cacheHitRate: [],
      responseTimeTrend: 'stable',
      queryVolumeTrend: 'increasing',
      connectionUtilizationTrend: 'stable',
      cacheHitRateTrend: 'stable',
    };
  }
}

// Type definitions
export interface PerformanceMetrics {
  connections: number;
  activeConnections: number;
  idleConnections: number;
  totalQueries: number;
  slowQueries: number;
  avgResponseTime: number;
  maxResponseTime: number;
  cacheHitRate: number;
  indexUsage: Map<string, number>;
  tableStats: Map<string, TablePerformanceStats>;
  timestamp: Date;
}

export interface ConnectionMetrics {
  total: number;
  active: number;
  idle: number;
}

export interface TablePerformanceStats {
  avgRowLockTime: number;
  deadlockCount: number;
  avgQueryTime: number;
  indexUsageStats: Map<string, number>;
}

export interface PerformanceReport {
  timestamp: Date;
  summary: {
    totalQueries: number;
    slowQueries: number;
    slowQueryRate: number;
    avgResponseTime: number;
    maxResponseTime: number;
    connectionUtilization: number;
    cacheHitRate: number;
  };
  alerts: PerformanceAlert[];
  recommendations: string[];
  trends: PerformanceTrends;
}

export interface PerformanceAlert {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: any;
  timestamp: Date;
}

export interface PerformanceTrends {
  queryCount: number[];
  responseTime: number[];
  connectionUtilization: number[];
  cacheHitRate: number[];
  responseTimeTrend: 'improving' | 'stable' | 'degrading';
  queryVolumeTrend: 'increasing' | 'stable' | 'decreasing';
  connectionUtilizationTrend: 'increasing' | 'stable' | 'decreasing';
  cacheHitRateTrend: 'improving' | 'stable' | 'degrading';
}

export interface HealthScore {
  score: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  issues: string[];
}
