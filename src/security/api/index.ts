/**
 * API Security Module Index
 *
 * Centralized exports for API security services and utilities
 */

// Core security services
export * from './security.headers';
export * from './request.validation';
export * from './threat.detection';
export * from './auth.hardening';
export * from './abuse.detection';
export * from './security.testing';

/**
 * Re-export commonly used services and types
 */
export { SecurityHeadersInterceptor } from './security.headers';

export { RequestValidationInterceptor } from './request.validation';

export { ThreatDetectionService } from './threat.detection';

export { AuthHardeningGuard, RbacHardeningGuard, ApiKeyGuard, RequestSigningGuard } from './auth.hardening';

export { AbuseDetectionService } from './abuse.detection';

export { SecurityTestingService } from './security.testing';
