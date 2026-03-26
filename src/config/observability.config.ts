import { register } from 'prom-client';

export default () => ({
  observability: {
    tracing: {
      serviceName: process.env.OTEL_SERVICE_NAME || 'propchain-backend',
      serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
      enabled: process.env.OTEL_ENABLED === 'true',
      exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'console',
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS || '',
      sampling: process.env.OTEL_SAMPLING_RATE || '1.0',
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      path: process.env.METRICS_PATH || '/metrics',
      port: process.env.METRICS_PORT || '9090',
      labels: {
        app: 'propchain-backend',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
    },
    performance: {
      monitoring: {
        enabled: process.env.PERFORMANCE_MONITORING_ENABLED !== 'false',
        interval: parseInt(process.env.PERFORMANCE_MONITORING_INTERVAL || '30000'), // 30 seconds
        retention: parseInt(process.env.PERFORMANCE_METRICS_RETENTION || '86400000'), // 24 hours
      },
      alerts: {
        cpuThreshold: parseFloat(process.env.CPU_ALERT_THRESHOLD || '90'),
        memoryThreshold: parseFloat(process.env.MEMORY_ALERT_THRESHOLD || '90'),
        errorRateThreshold: parseFloat(process.env.ERROR_RATE_ALERT_THRESHOLD || '5'),
        responseTimeThreshold: parseFloat(process.env.RESPONSE_TIME_ALERT_THRESHOLD || '5000'),
      },
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      enabled: process.env.LOGGING_ENABLED !== 'false',
    },
  },
});

export const observabilityConstants = {
  METRICS_PREFIX: 'propchain_',
  DEFAULT_BUCKETS: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  DATABASE_BUCKETS: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  BLOCKCHAIN_BUCKETS: [0.1, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
  SIZE_BUCKETS: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
  SPAN_NAMES: {
    HTTP_REQUEST: 'http-request',
    DATABASE_QUERY: 'database-query',
    BLOCKCHAIN_OPERATION: 'blockchain-operation',
    CACHE_OPERATION: 'cache-operation',
    AUTHENTICATION: 'authentication',
    AUTHORIZATION: 'authorization',
    VALIDATION: 'validation',
  },
  METRIC_NAMES: {
    HTTP_REQUEST_DURATION: 'http_request_duration_seconds',
    HTTP_REQUEST_COUNT: 'http_request_total',
    HTTP_REQUEST_SIZE: 'http_request_size_bytes',
    HTTP_RESPONSE_SIZE: 'http_response_size_bytes',
    ACTIVE_CONNECTIONS: 'active_connections',
    DATABASE_QUERY_DURATION: 'database_query_duration_seconds',
    BLOCKCHAIN_OPERATION_DURATION: 'blockchain_operation_duration_seconds',
    CACHE_HIT_RATE: 'cache_hit_rate',
    ERROR_RATE: 'error_rate',
    SYSTEM_CPU_USAGE: 'system_cpu_usage_percent',
    SYSTEM_MEMORY_USAGE: 'system_memory_usage_percent',
    APPLICATION_UPTIME: 'application_uptime_seconds',
    APPLICATION_REQUESTS_PER_SECOND: 'application_requests_per_second',
  },
  LABELS: {
    METHOD: 'method',
    ROUTE: 'route',
    STATUS: 'status',
    USER_ID: 'user_id',
    OPERATION: 'operation',
    TABLE: 'table',
    QUERY_TYPE: 'query_type',
    NETWORK: 'network',
    CONTRACT: 'contract',
    CACHE_TYPE: 'cache_type',
    ERROR_TYPE: 'error_type',
    ENDPOINT: 'endpoint',
    TYPE: 'type',
  },
};
