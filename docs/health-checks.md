# Health Check Implementation

This document describes the comprehensive health check implementation for the PropChain-BackEnd application.

## Overview

The health check system provides detailed monitoring of all system components including database, Redis, blockchain services, system resources, and external dependencies. It includes analytics, scheduled checks, and manual triggering capabilities.

## Endpoints

### Basic Health Check
- **GET** `/health`
- **Description**: Basic health check for core services (database, Redis)
- **Response**: Health status of core services

### Detailed Health Check
- **GET** `/health/detailed`
- **Description**: Comprehensive health check for all services
- **Response**: Health status of all services including database, Redis, blockchain, memory, CPU, disk, and dependencies

### Comprehensive Health Check
- **GET** `/health/comprehensive`
- **Description**: Full health check with analytics and system information
- **Response**: Health status, analytics data, and detailed system information

### Liveness Probe
- **GET** `/health/liveness`
- **Description**: Kubernetes liveness probe
- **Response**: Basic liveness information

### Readiness Probe
- **GET** `/health/readiness`
- **Description**: Kubernetes readiness probe
- **Response**: Service readiness status

### Health Analytics
- **GET** `/health/analytics`
- **Description**: Get health check analytics
- **Response**: Historical health check data and statistics

### Clear Analytics
- **GET** `/health/analytics/clear`
- **Description**: Clear health check analytics
- **Response**: Confirmation message

### Dependencies
- **GET** `/health/dependencies`
- **Description**: Get configured dependencies
- **Response**: List of monitored external dependencies

### Manual Health Check Trigger
- **POST** `/health/trigger`
- **Description**: Trigger manual health check
- **Query Parameters**:
  - `type`: `basic`, `detailed`, or `dependencies` (default: `basic`)
- **Response**: Health check results

## Health Indicators

### Database Health Indicator
- **Purpose**: Monitor database connectivity and performance
- **Checks**: Connection test, connection pool info, table count
- **Response Time**: Measured and reported
- **Error Handling**: Detailed error messages with response times

### Redis Health Indicator
- **Purpose**: Monitor Redis connectivity and performance
- **Checks**: Ping test, read/write operations, server info, memory usage
- **Response Time**: Measured and reported
- **Details**: Connection info, memory stats, server version

### Blockchain Health Indicator
- **Purpose**: Monitor blockchain RPC connectivity
- **Checks**: Block number, network info, gas prices, balance queries
- **Response Time**: Measured and reported
- **Details**: Network info, latest block data, gas information

### Memory Health Indicator
- **Purpose**: Monitor system memory usage
- **Checks**: Heap usage, system memory, external memory
- **Threshold**: Unhealthy if heap usage > 80%
- **Details**: Memory usage breakdown and percentages

### CPU Health Indicator
- **Purpose**: Monitor CPU usage and load
- **Checks**: Process CPU usage, system load average
- **Threshold**: Unhealthy if CPU > 90% or load average > 2x CPU count
- **Details**: CPU usage, load averages, system info

### Disk Health Indicator
- **Purpose**: Monitor disk accessibility
- **Checks**: Write access test
- **Details**: Platform-specific disk information

### Dependencies Health Indicator
- **Purpose**: Monitor external service dependencies
- **Checks**: HTTP health checks for configured dependencies
- **Configurable**: Dependencies can be added/removed via configuration
- **Details**: Response times, status codes, error information

## Analytics

The health check system collects and stores analytics data including:

- Total health checks performed
- Success/failure rates
- Average response times
- Service-specific statistics
- Historical data (last 1000 metrics)

### Analytics Features
- **Real-time tracking**: All health checks are recorded
- **Service-specific stats**: Individual metrics per service
- **Time-based filtering**: Query metrics by time range
- **Automatic cleanup**: Old metrics are pruned periodically

## Scheduled Health Checks

The system includes automated health checks:

- **Every 5 minutes**: Basic health check (core services)
- **Every 30 minutes**: Extended health check (all services)
- **Every hour**: Dependency health check
- **Daily**: Metrics cleanup (midnight)

## Configuration

### Environment Variables

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/propchain

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0

# Blockchain Configuration
RPC_URL=https://eth-mainnet.alchemyapi.io/v2/your_api_key

# Health Check Dependencies (JSON array)
HEALTH_CHECK_DEPENDENCIES=[
  {
    "name": "valuation-provider",
    "url": "https://api.valuation-service.com/v1/health",
    "timeout": 5000,
    "method": "GET",
    "expectedStatus": 200
  }
]
```

## Response Format

### Healthy Response
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "details": {
        "responseTime": "15ms",
        "connectionPool": {...},
        "tableCount": 25,
        "timestamp": "2024-01-01T00:00:00.000Z",
        "message": "Database connection successful"
      }
    },
    "redis": {
      "status": "up",
      "details": {
        "responseTime": "5ms",
        "connection": {...},
        "memory": {...},
        "server": {...},
        "test": {...},
        "timestamp": "2024-01-01T00:00:00.000Z",
        "message": "Redis connection successful"
      }
    }
  },
  "details": {
    "responseTime": "20ms"
  }
}
```

### Unhealthy Response
```json
{
  "status": "error",
  "error": "Database connection failed",
  "details": {
    "database": {
      "status": "down",
      "details": {
        "error": "Connection timeout",
        "responseTime": "5000ms",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    }
  }
}
```

## Monitoring Integration

### Kubernetes
- **Liveness Probe**: `/health/liveness`
- **Readiness Probe**: `/health/readiness`
- **Startup Probe**: `/health` (with appropriate configuration)

### Prometheus Metrics
Health check metrics can be integrated with Prometheus using the existing `@willsoto/nestjs-prometheus` module.

### Alerting
Configure alerts based on:
- Health check failures
- High response times
- Resource usage thresholds

## Testing

The health check system includes comprehensive tests:

```bash
# Run health check tests
npm run test -- --testPathPattern=health

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

## Troubleshooting

### Common Issues

1. **Database Connection Failures**
   - Check database connectivity
   - Verify connection string
   - Check connection pool settings

2. **Redis Connection Failures**
   - Verify Redis server is running
   - Check connection parameters
   - Verify authentication

3. **Blockchain RPC Failures**
   - Check RPC URL validity
   - Verify API key if required
   - Check network connectivity

4. **High Memory Usage**
   - Monitor memory leaks
   - Check for memory-intensive operations
   - Consider increasing memory limits

5. **High CPU Usage**
   - Profile CPU-intensive operations
   - Check for infinite loops
   - Optimize database queries

### Debug Mode

Enable debug logging by setting the log level:

```bash
LOG_LEVEL=debug
```

This will provide detailed health check execution logs.

## Performance Considerations

- Health checks are designed to be lightweight
- Response times are measured and reported
- Timeouts are configured to prevent hanging
- Scheduled checks use appropriate intervals
- Metrics are limited to prevent memory issues

## Security

- Health check endpoints should be secured in production
- Consider IP whitelisting for health endpoints
- Rate limiting may be applied to prevent abuse
- Sensitive information is filtered from responses

## Future Enhancements

- Circuit breaker pattern implementation
- Advanced alerting integrations
- Performance benchmarking
- Distributed tracing integration
- Custom health check plugins
