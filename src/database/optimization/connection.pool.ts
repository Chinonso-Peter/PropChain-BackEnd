import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';

/**
 * Database Connection Pool Manager
 *
 * Manages database connection pooling with optimization and monitoring
 */
@Injectable()
export class ConnectionPoolService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionPoolService.name);
  private pool: any; // This would be the actual database connection pool
  private metrics: PoolMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
    totalRequests: 0,
    failedRequests: 0,
    avgWaitTime: 0,
    maxWaitTime: 0,
    connectionErrors: 0,
    lastError: null,
    timestamp: new Date(),
  };

  private config: PoolConfig = {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  };

  constructor(private readonly configService: ConfigService) {
    super();
    this.loadConfig();
  }

  async onModuleInit() {
    await this.initializePool();
    this.startMonitoring();
  }

  async onModuleDestroy() {
    await this.closePool();
  }

  /**
   * Get connection from pool
   */
  async getConnection(): Promise<any> {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.waitingRequests++;

    try {
      const connection = await this.pool.acquire();
      const waitTime = Date.now() - startTime;

      this.updateWaitMetrics(waitTime);
      this.metrics.waitingRequests--;
      this.metrics.activeConnections++;

      this.emit('connection:acquired', { connection, waitTime });

      return connection;
    } catch (error) {
      this.metrics.failedRequests++;
      this.metrics.waitingRequests--;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);

      this.emit('connection:error', { error, waitTime: Date.now() - startTime });

      throw error;
    }
  }

  /**
   * Release connection back to pool
   */
  async releaseConnection(connection: any): Promise<void> {
    try {
      await this.pool.release(connection);
      this.metrics.activeConnections--;
      this.metrics.idleConnections++;

      this.emit('connection:released', { connection });
    } catch (error) {
      this.metrics.connectionErrors++;
      this.logger.error('Error releasing connection:', error);
      throw error;
    }
  }

  /**
   * Get pool metrics
   */
  getMetrics(): PoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Get pool status
   */
  getPoolStatus(): PoolStatus {
    const utilization =
      this.metrics.totalConnections > 0 ? this.metrics.activeConnections / this.metrics.totalConnections : 0;

    const errorRate = this.metrics.totalRequests > 0 ? this.metrics.failedRequests / this.metrics.totalRequests : 0;

    return {
      status: this.getPoolHealthStatus(utilization, errorRate),
      utilization,
      errorRate,
      avgWaitTime: this.metrics.avgWaitTime,
      totalConnections: this.metrics.totalConnections,
      activeConnections: this.metrics.activeConnections,
      idleConnections: this.metrics.idleConnections,
      waitingRequests: this.metrics.waitingRequests,
    };
  }

  /**
   * Optimize pool configuration
   */
  async optimizePool(): Promise<PoolOptimizationResult> {
    const currentMetrics = this.getMetrics();
    const optimizations: string[] = [];
    let changed = false;

    // Analyze connection usage
    const avgUtilization = this.calculateAverageUtilization();

    if (avgUtilization > 0.8 && this.config.max < 20) {
      // High utilization, consider increasing max connections
      const newMax = Math.min(this.config.max * 2, 20);
      this.config.max = newMax;
      optimizations.push(`Increased max connections to ${newMax}`);
      changed = true;
    } else if (avgUtilization < 0.3 && this.config.max > 5) {
      // Low utilization, consider decreasing max connections
      const newMax = Math.max(this.config.max / 2, 5);
      this.config.max = newMax;
      optimizations.push(`Decreased max connections to ${newMax}`);
      changed = true;
    }

    // Analyze wait times
    if (currentMetrics.avgWaitTime > 1000 && this.config.min < this.config.max - 2) {
      // High wait times, consider increasing min connections
      const newMin = Math.min(this.config.min + 1, this.config.max - 1);
      this.config.min = newMin;
      optimizations.push(`Increased min connections to ${newMin}`);
      changed = true;
    }

    // Analyze error rate
    const errorRate =
      currentMetrics.totalRequests > 0 ? currentMetrics.failedRequests / currentMetrics.totalRequests : 0;

    if (errorRate > 0.05) {
      // High error rate, consider increasing timeouts
      this.config.acquireTimeoutMillis = Math.min(this.config.acquireTimeoutMillis * 1.5, 60000);
      this.config.createTimeoutMillis = Math.min(this.config.createTimeoutMillis * 1.5, 60000);
      optimizations.push('Increased connection timeouts due to high error rate');
      changed = true;
    }

    if (changed) {
      await this.reconfigurePool();
    }

    return {
      optimized: changed,
      optimizations,
      previousConfig: { ...this.config },
      newConfig: { ...this.config },
    };
  }

  /**
   * Resize pool
   */
  async resizePool(newMin: number, newMax: number): Promise<void> {
    if (newMin < 0 || newMax < newMin) {
      throw new Error('Invalid pool size configuration');
    }

    const oldConfig = { ...this.config };
    this.config.min = newMin;
    this.config.max = newMax;

    try {
      await this.reconfigurePool();
      this.logger.log(`Pool resized: min ${oldConfig.min}->${newMin}, max ${oldConfig.max}->${newMax}`);
    } catch (error) {
      // Revert on failure
      this.config = oldConfig;
      throw error;
    }
  }

  /**
   * Initialize connection pool
   */
  private async initializePool(): Promise<void> {
    try {
      // This would initialize the actual database connection pool
      // For now, we'll simulate it

      this.logger.log(`Initializing connection pool with min=${this.config.min}, max=${this.config.max}`);

      // Simulate pool creation
      this.pool = {
        acquire: this.mockAcquire.bind(this),
        release: this.mockRelease.bind(this),
        destroy: this.mockDestroy.bind(this),
      };

      this.metrics.totalConnections = this.config.min;
      this.metrics.idleConnections = this.config.min;

      this.logger.log('Connection pool initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize connection pool:', error);
      throw error;
    }
  }

  /**
   * Close connection pool
   */
  private async closePool(): Promise<void> {
    try {
      if (this.pool) {
        await this.pool.destroy();
        this.pool = null;
        this.logger.log('Connection pool closed');
      }
    } catch (error) {
      this.logger.error('Error closing connection pool:', error);
    }
  }

  /**
   * Reconfigure pool with new settings
   */
  private async reconfigurePool(): Promise<void> {
    // This would reconfigure the actual pool
    this.logger.log('Reconfiguring connection pool with new settings');
  }

  /**
   * Start monitoring pool metrics
   */
  private startMonitoring(): void {
    setInterval(() => {
      this.updateMetrics();
      this.checkPoolHealth();
    }, 10000); // Every 10 seconds
  }

  /**
   * Update pool metrics
   */
  private updateMetrics(): void {
    this.metrics.timestamp = new Date();

    // This would collect actual metrics from the pool
    // For now, we'll simulate some basic updates

    // Emit metrics event
    this.emit('metrics', this.metrics);
  }

  /**
   * Check pool health and emit alerts
   */
  private checkPoolHealth(): void {
    const status = this.getPoolStatus();

    if (status.status === 'critical') {
      this.emit('alert', {
        type: 'POOL_CRITICAL',
        message: 'Connection pool is in critical state',
        data: status,
      });
    } else if (status.status === 'warning') {
      this.emit('alert', {
        type: 'POOL_WARNING',
        message: 'Connection pool needs attention',
        data: status,
      });
    }
  }

  /**
   * Get pool health status
   */
  private getPoolHealthStatus(utilization: number, errorRate: number): 'healthy' | 'warning' | 'critical' {
    if (utilization > 0.9 || errorRate > 0.1) {
      return 'critical';
    }
    if (utilization > 0.7 || errorRate > 0.05) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Calculate average utilization over time
   */
  private calculateAverageUtilization(): number {
    // This would calculate based on historical data
    // For now, return current utilization
    return this.metrics.totalConnections > 0 ? this.metrics.activeConnections / this.metrics.totalConnections : 0;
  }

  /**
   * Update wait time metrics
   */
  private updateWaitMetrics(waitTime: number): void {
    this.metrics.maxWaitTime = Math.max(this.metrics.maxWaitTime, waitTime);

    // Update average wait time
    const totalRequests = this.metrics.totalRequests;
    this.metrics.avgWaitTime = (this.metrics.avgWaitTime * (totalRequests - 1) + waitTime) / totalRequests;
  }

  /**
   * Load configuration from environment
   */
  private loadConfig(): void {
    this.config = {
      min: this.configService.get<number>('DB_POOL_MIN', 2),
      max: this.configService.get<number>('DB_POOL_MAX', 10),
      acquireTimeoutMillis: this.configService.get<number>('DB_POOL_ACQUIRE_TIMEOUT', 30000),
      createTimeoutMillis: this.configService.get<number>('DB_POOL_CREATE_TIMEOUT', 30000),
      destroyTimeoutMillis: this.configService.get<number>('DB_POOL_DESTROY_TIMEOUT', 5000),
      idleTimeoutMillis: this.configService.get<number>('DB_POOL_IDLE_TIMEOUT', 30000),
      reapIntervalMillis: this.configService.get<number>('DB_POOL_REAP_INTERVAL', 1000),
      createRetryIntervalMillis: this.configService.get<number>('DB_POOL_RETRY_INTERVAL', 200),
    };
  }

  // Mock methods for simulation (would be replaced with actual pool implementation)
  private async mockAcquire(): Promise<any> {
    // Simulate connection acquisition
    return { id: Math.random().toString(36), acquired: Date.now() };
  }

  private async mockRelease(connection: any): Promise<void> {
    // Simulate connection release
    connection.released = Date.now();
  }

  private async mockDestroy(): Promise<void> {
    // Simulate pool destruction
  }
}

// Type definitions
interface PoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
  createRetryIntervalMillis: number;
}

export interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalRequests: number;
  failedRequests: number;
  avgWaitTime: number;
  maxWaitTime: number;
  connectionErrors: number;
  lastError: string | null;
  timestamp: Date;
}

export interface PoolStatus {
  status: 'healthy' | 'warning' | 'critical';
  utilization: number;
  errorRate: number;
  avgWaitTime: number;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
}

export interface PoolOptimizationResult {
  optimized: boolean;
  optimizations: string[];
  previousConfig: PoolConfig;
  newConfig: PoolConfig;
}
