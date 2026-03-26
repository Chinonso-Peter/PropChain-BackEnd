# Observability Features

This document describes the comprehensive observability features implemented in the PropChain-BackEnd application.

## Overview

The observability system provides three main capabilities:
1. **Distributed Tracing** - Track requests across services and components
2. **Custom Metrics** - Monitor application performance and business metrics
3. **Performance Monitoring** - Real-time system and application health monitoring

## Architecture

### Components

- **TracingService** - OpenTelemetry-based distributed tracing
- **MetricsInterceptor** - HTTP request/response metrics collection
- **PerformanceMonitorService** - System and application performance monitoring
- **ObservabilityController** - REST API for observability data
- **ObservabilityModule** - NestJS module that orchestrates all components

## Features

### 1. Distributed Tracing

**Implementation**: OpenTelemetry with auto-instrumentation

**Capabilities**:
- Automatic trace generation for HTTP requests
- Database query tracing
- Blockchain operation tracing
- Custom span creation
- Export to OTLP-compatible backends (Jaeger, Tempo, etc.)

**Configuration**:
```bash
OTEL_SERVICE_NAME=propchain-backend
OTEL_SERVICE_VERSION=1.0.0
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SAMPLING_RATE=1.0
```

**Usage**:
```typescript
// Create custom spans
const span = tracingService.createSpan('custom-operation', {
  userId: '123',
  operation: 'data-processing'
});

// Business logic here

span.end();
```

### 2. Custom Metrics

**Implementation**: Prometheus with custom collectors

**HTTP Metrics**:
- Request duration histogram
- Request count counter
- Request/response size histograms
- Active connections gauge
- Error rate tracking

**Business Metrics**:
- Database query duration
- Blockchain operation duration
- Cache hit rates
- Custom application metrics

**Available Endpoints**:
- `/metrics` - Prometheus metrics endpoint
- `/observability/metrics/current` - Current metrics snapshot
- `/observability/metrics/history` - Historical metrics data
- `/observability/metrics/average` - Average metrics over time

**Example Metrics**:
```
# HTTP request duration
http_request_duration_seconds{method="GET",route="/api/properties",status="200",user_id="123"} 0.245

# Database query duration
database_query_duration_seconds{operation="select",table="properties",query_type="find"} 0.012

# Blockchain operation duration
blockchain_operation_duration_seconds{operation="transfer",network="sepolia",contract="PropertyToken"} 2.456
```

### 3. Performance Monitoring

**Implementation**: Real-time system monitoring with alerts

**Monitored Metrics**:
- CPU usage and load average
- Memory usage (used, free, total)
- Disk usage (when available)
- Network metrics (connections, request rate)
- Application metrics (uptime, error rate, response time)

**Health Assessment**:
- **Healthy**: All metrics within normal thresholds
- **Warning**: 1-2 metrics exceed thresholds
- **Critical**: 3+ metrics exceed thresholds

**Alert Thresholds** (configurable):
- CPU usage > 90%
- Memory usage > 90%
- Error rate > 5%
- Response time > 5000ms

**Endpoints**:
- `/observability/health` - Detailed health status
- `/observability/tracing/status` - Tracing service status

## Configuration

### Environment Variables

```bash
# OpenTelemetry Tracing
OTEL_SERVICE_NAME=propchain-backend
OTEL_SERVICE_VERSION=1.0.0
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SAMPLING_RATE=1.0

# Metrics
METRICS_ENABLED=true
METRICS_PATH=/metrics
METRICS_PORT=9090

# Performance Monitoring
PERFORMANCE_MONITORING_ENABLED=true
PERFORMANCE_MONITORING_INTERVAL=30000
PERFORMANCE_METRICS_RETENTION=86400000

# Alert Thresholds
CPU_ALERT_THRESHOLD=90
MEMORY_ALERT_THRESHOLD=90
ERROR_RATE_ALERT_THRESHOLD=5
RESPONSE_TIME_ALERT_THRESHOLD=5000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOGGING_ENABLED=true
```

### Integration with Observability Backends

#### Jaeger
```bash
# Start Jaeger
docker run -d \
  --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  jaegertracing/all-in-one:latest

# Configure environment
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

#### Prometheus
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'propchain-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

#### Grafana Dashboard
Import the provided Grafana dashboard configuration for visualization:
- CPU and Memory usage
- Request rates and response times
- Error rates and status codes
- Database and blockchain operation metrics

## Usage Examples

### Adding Custom Metrics

```typescript
@Injectable()
export class PropertyService {
  constructor(private metricsInterceptor: MetricsInterceptor) {}

  async createProperty(data: CreatePropertyDto) {
    const start = Date.now();
    
    try {
      // Business logic
      const property = await this.repository.create(data);
      
      // Record success metric
      this.metricsInterceptor.recordCustomMetric(
        'property_creation_duration_seconds',
        (Date.now() - start) / 1000,
        { status: 'success' }
      );
      
      return property;
    } catch (error) {
      // Record error metric
      this.metricsInterceptor.recordCustomMetric(
        'property_creation_duration_seconds',
        (Date.now() - start) / 1000,
        { status: 'error', error_type: error.constructor.name }
      );
      throw error;
    }
  }
}
```

### Adding Custom Spans

```typescript
@Injectable()
export class BlockchainService {
  constructor(private tracingService: TracingService) {}

  async transferProperty(from: string, to: string, propertyId: string) {
    const span = this.tracingService.createSpan('property-transfer', {
      from,
      to,
      propertyId,
      network: process.env.BLOCKCHAIN_NETWORK,
    });

    try {
      // Blockchain operation
      const result = await this.contract.transfer(from, to, propertyId);
      
      span.setAttributes({
        transactionHash: result.hash,
        gasUsed: result.gasUsed.toString(),
      });
      
      return result;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
}
```

### Performance Monitoring Integration

```typescript
@Controller()
export class AppController {
  constructor(private performanceMonitor: PerformanceMonitorService) {}

  @Get('health')
  getHealth() {
    return this.performanceMonitor.getHealthStatus();
  }

  @Post('api/properties')
  async createProperty(@Body() data: CreatePropertyDto) {
    // Record request for rate calculation
    this.performanceMonitor.recordRequest('/api/properties');
    
    try {
      return await this.propertyService.create(data);
    } catch (error) {
      // Record error for monitoring
      this.performanceMonitor.recordError('/api/properties', error);
      throw error;
    }
  }
}
```

## Best Practices

### 1. Instrumentation
- Use auto-instrumentation for standard operations
- Add custom spans for business-critical operations
- Include relevant attributes in spans
- Use semantic conventions where possible

### 2. Metrics
- Use meaningful metric names
- Include relevant labels for filtering
- Choose appropriate bucket sizes for histograms
- Avoid high cardinality labels

### 3. Performance Monitoring
- Set appropriate alert thresholds
- Monitor trends over time
- Correlate metrics with business events
- Regularly review and adjust monitoring

### 4. Security
- Secure metrics endpoints in production
- Use authentication for sensitive observability data
- Sanitize sensitive data from traces and metrics
- Follow data retention policies

## Troubleshooting

### Common Issues

1. **Metrics not appearing**
   - Check METRICS_ENABLED=true
   - Verify metrics endpoint is accessible
   - Check Prometheus configuration

2. **Traces not exported**
   - Verify OTEL_EXPORTER_OTLP_ENDPOINT
   - Check network connectivity to collector
   - Verify collector is running

3. **High memory usage**
   - Adjust PERFORMANCE_METRICS_RETENTION
   - Check for metric cardinality issues
   - Monitor garbage collection

4. **Performance impact**
   - Adjust OTEL_SAMPLING_RATE
   - Use batch processors in production
   - Monitor overhead

### Debug Commands

```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Check health status
curl http://localhost:3000/observability/health

# Check tracing status
curl http://localhost:3000/observability/tracing/status

# View current metrics
curl http://localhost:3000/observability/metrics/current
```

## Migration Guide

### From Basic Logging
1. Install observability dependencies
2. Update environment configuration
3. Add observability module to app module
4. Replace manual logging with structured tracing
5. Add custom metrics for business operations

### From Basic Metrics
1. Migrate existing Prometheus metrics
2. Add business-specific metrics
3. Implement performance monitoring
4. Set up alerting rules
5. Create dashboards

## Future Enhancements

- SLA monitoring and reporting
- Anomaly detection
- Distributed context propagation
- Custom alerting integrations
- Performance profiling integration
- Business intelligence metrics
