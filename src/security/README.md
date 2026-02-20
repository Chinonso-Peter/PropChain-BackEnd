# Security Implementation

This document describes the comprehensive security features implemented in the PropChain backend.

## Features Implemented

### 1. Advanced Rate Limiting
- **Redis-based rate limiting** with sliding window algorithm
- **Multiple rate limit tiers**: API, Auth, Expensive operations, User-based
- **Customizable configurations** via environment variables
- **Rate limit headers** in HTTP responses
- **Fail-open design** to prevent service disruption

### 2. IP Blocking and Whitelisting
- **Automatic IP blocking** after failed attempts
- **Manual IP blocking/unblocking** via API
- **IP whitelist** functionality
- **Configurable thresholds** and block durations
- **Real-time blocking checks** in middleware

### 3. DDoS Protection
- **Traffic monitoring** and anomaly detection
- **Automatic attack mitigation**
- **Multiple mitigation strategies**: IP blocking, rate limiting, challenges
- **Attack logging** and reporting
- **Configurable thresholds** and response actions

### 4. API Quota Management
- **Plan-based quotas**: Free, Basic, Pro, Enterprise
- **Daily and monthly usage tracking**
- **Automatic quota reset** schedules
- **Usage monitoring** with headers
- **Quota enforcement** in API key validation

### 5. Security Headers
- **Content Security Policy (CSP)** with customizable directives
- **HTTP Strict Transport Security (HSTS)**
- **X-Frame-Options**, **X-Content-Type-Options**, **X-XSS-Protection**
- **Referrer Policy** and **Permissions Policy**
- **Environment-specific configurations**

### 6. Enhanced Authentication Security
- **Enhanced API key guard** with quota and rate limit checking
- **Comprehensive validation** including expiration and active status
- **Usage tracking** and quota consumption
- **Detailed security headers** in responses

## Configuration

### Environment Variables

```env
# Advanced Rate Limiting
RATE_LIMIT_API_PER_MINUTE=100
RATE_LIMIT_AUTH_PER_MINUTE=5
RATE_LIMIT_EXPENSIVE_PER_MINUTE=10
RATE_LIMIT_USER_PER_HOUR=1000

# IP Blocking
MAX_FAILED_ATTEMPTS=5
FAILED_ATTEMPT_WINDOW_MS=900000
AUTO_BLOCK_DURATION_MS=3600000

# DDoS Protection
DDOS_THRESHOLD_PER_MINUTE=100
DDOS_MITIGATION_ACTION=block_ip
DDOS_BLOCK_DURATION_MS=3600000
DDOS_ATTACK_RETENTION_HOURS=168

# Security Headers
SECURITY_HEADERS_ENABLED=true
CSP_REPORT_URI=
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=true
```

## API Endpoints

### Security Management
- `GET /api/security/rate-limit/:key` - Get rate limit information
- `DELETE /api/security/rate-limit/:key` - Reset rate limit
- `GET /api/security/ip-blocks` - Get blocked IPs
- `POST /api/security/ip-blocks` - Block an IP
- `DELETE /api/security/ip-blocks/:ip` - Unblock an IP
- `GET /api/security/ip-whitelist` - Get whitelist
- `POST /api/security/ip-whitelist` - Add to whitelist
- `DELETE /api/security/ip-whitelist/:ip` - Remove from whitelist
- `GET /api/security/ddos/status` - Get DDoS protection status
- `GET /api/security/ddos/attacks` - Get recent attacks
- `POST /api/security/ddos/block-ip` - Manual IP blocking
- `GET /api/security/quotas` - Get all quotas
- `GET /api/security/quotas/:apiKeyId` - Get specific quota
- `POST /api/security/quotas` - Set quota
- `DELETE /api/security/quotas/:apiKeyId` - Remove quota
- `GET /api/security/quotas/plans/available` - Available plans
- `GET /api/security/headers` - Current headers configuration
- `GET /api/security/headers/validate` - Validate configuration

## Usage Examples

### Rate Limiting Decorator
```typescript
import { RateLimit } from '../security/decorators/rate-limit.decorator';
import { AdvancedRateLimitGuard } from '../security/guards/advanced-rate-limit.guard';

@Controller('api/expensive')
@UseGuards(AdvancedRateLimitGuard)
export class ExpensiveOperationsController {
  
  @Post('operation')
  @RateLimit({
    windowMs: 60000, // 1 minute
    maxRequests: 10, // 10 requests per minute
    keyPrefix: 'expensive_ops'
  })
  async performExpensiveOperation() {
    // Your expensive operation here
  }
}
```

### Enhanced API Key Protection
```typescript
import { EnhancedApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('api/protected')
@UseGuards(EnhancedApiKeyGuard)
export class ProtectedController {
  
  @Get('data')
  async getData(@Request() req) {
    // req.apiKey contains quota and usage information
    console.log('Remaining quota:', req.apiKey.quota.currentDailyUsage);
    return { data: 'protected data' };
  }
}
```

## Security Headers Applied

The system automatically applies the following security headers:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `X-Download-Options: noopen`
- `X-Permitted-Cross-Domain-Policies: none`
- `X-DNS-Prefetch-Control: off`

## Rate Limit Headers

When rate limiting is applied, the following headers are included:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `X-RateLimit-Window`
- `X-Quota-Daily-Limit`
- `X-Quota-Daily-Remaining`
- `X-Quota-Monthly-Limit`
- `X-Quota-Monthly-Remaining`

## Monitoring and Logging

All security events are logged with appropriate severity levels:
- **WARN**: Rate limit exceeded, IP blocked
- **ERROR**: Security service failures
- **INFO**: Security operations, configuration changes

## Fail-Safe Design

The security system is designed with fail-open principles:
- If Redis is unavailable, rate limiting is bypassed
- If security services fail, requests are allowed
- Critical business operations continue during security service outages

## Testing

Comprehensive tests are included for all security features:
- Unit tests for each service
- Integration tests for combined functionality
- Performance tests for high-load scenarios
- Security tests for edge cases

## Future Enhancements

Planned improvements:
- Machine learning-based anomaly detection
- Geographic IP blocking
- Request fingerprinting
- Advanced CAPTCHA integration
- Rate limit analytics dashboard
- Automated threat intelligence integration