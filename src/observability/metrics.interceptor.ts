import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Histogram, Counter, Gauge, Registry } from 'prom-client';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly httpRequestDuration: Histogram<string>;
  private readonly httpRequestCount: Counter<string>;
  private readonly httpRequestSize: Histogram<string>;
  private readonly httpResponseSize: Histogram<string>;
  private readonly activeConnections: Gauge<string>;
  private readonly databaseQueryDuration: Histogram<string>;
  private readonly blockchainOperationDuration: Histogram<string>;
  private readonly cacheHitRate: Gauge<string>;
  private readonly errorRate: Gauge<string>;

  constructor() {
    // HTTP Request Metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status', 'user_id'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.httpRequestCount = new Counter({
      name: 'http_request_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status', 'user_id'],
    });

    this.httpRequestSize = new Histogram({
      name: 'http_request_size_bytes',
      help: 'Size of HTTP requests in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
    });

    this.httpResponseSize = new Histogram({
      name: 'http_response_size_bytes',
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route', 'status'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
    });

    // Connection Metrics
    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
    });

    // Database Metrics
    this.databaseQueryDuration = new Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table', 'query_type'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    });

    // Blockchain Metrics
    this.blockchainOperationDuration = new Histogram({
      name: 'blockchain_operation_duration_seconds',
      help: 'Duration of blockchain operations in seconds',
      labelNames: ['operation', 'network', 'contract'],
      buckets: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
    });

    // Cache Metrics
    this.cacheHitRate = new Gauge({
      name: 'cache_hit_rate',
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type', 'operation'],
    });

    // Error Rate Metrics
    this.errorRate = new Gauge({
      name: 'error_rate',
      help: 'Error rate percentage',
      labelNames: ['error_type', 'endpoint'],
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = req.method;
    const route = req.route?.path || req.url;
    const userId = req.user?.id || 'anonymous';
    const start = process.hrtime();

    // Track request size
    const requestSize = this.getRequestSize(req);
    this.httpRequestSize.labels(method, route).observe(requestSize);

    // Increment active connections
    this.activeConnections.labels('http').inc();

    return next.handle().pipe(
      tap(() => {
        const status = res.statusCode;
        const duration = process.hrtime(start);
        const seconds = duration[0] + duration[1] / 1e9;
        const responseSize = this.getResponseSize(res);

        // Record HTTP metrics
        this.httpRequestDuration.labels(method, route, status, userId).observe(seconds);
        this.httpRequestCount.labels(method, route, status, userId).inc();
        this.httpResponseSize.labels(method, route, status).observe(responseSize);

        // Update error rate for non-2xx responses
        if (status >= 400) {
          const errorType = status >= 500 ? 'server_error' : 'client_error';
          this.errorRate.labels(errorType, route).inc();
        }

        // Decrement active connections
        this.activeConnections.labels('http').dec();
      }),
    );
  }

  private getRequestSize(req: any): number {
    try {
      if (req.headers['content-length']) {
        return parseInt(req.headers['content-length'], 10);
      }
      if (req.body && typeof req.body === 'string') {
        return Buffer.byteLength(req.body, 'utf8');
      }
      if (req.body && typeof req.body === 'object') {
        return Buffer.byteLength(JSON.stringify(req.body), 'utf8');
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private getResponseSize(res: any): number {
    try {
      if (res.headers['content-length']) {
        return parseInt(res.headers['content-length'], 10);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  // Public methods to be used by other services
  recordDatabaseQuery(operation: string, table: string, queryType: string, duration: number) {
    this.databaseQueryDuration.labels(operation, table, queryType).observe(duration);
  }

  recordBlockchainOperation(operation: string, network: string, contract: string, duration: number) {
    this.blockchainOperationDuration.labels(operation, network, contract).observe(duration);
  }

  updateCacheHitRate(cacheType: string, operation: string, hitRate: number) {
    this.cacheHitRate.labels(cacheType, operation).set(hitRate);
  }

  recordCustomMetric(name: string, value: number, labels: Record<string, string> = {}) {
    const histogram = new Histogram({
      name,
      help: `Custom metric: ${name}`,
      labelNames: Object.keys(labels),
    });
    histogram.labels(...Object.values(labels)).observe(value);
  }
}
