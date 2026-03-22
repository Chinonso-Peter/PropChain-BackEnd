import { Injectable, NestInterceptor, ExecutionContext, CallHandler, BadRequestException } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Request Validation and Sanitization Interceptor
 *
 * Validates and sanitizes incoming requests to prevent injection attacks
 */
@Injectable()
export class RequestValidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Validate and sanitize request
    this.validateAndSanitizeRequest(request);

    return next.handle();
  }

  /**
   * Validate and sanitize request data
   */
  private validateAndSanitizeRequest(request: any): void {
    // Sanitize query parameters
    if (request.query) {
      request.query = this.sanitizeObject(request.query);
    }

    // Sanitize request body
    if (request.body) {
      request.body = this.sanitizeObject(request.body);
    }

    // Sanitize path parameters
    if (request.params) {
      request.params = this.sanitizeObject(request.params);
    }

    // Validate request size
    this.validateRequestSize(request);

    // Check for potential injection attacks
    this.checkForInjectionAttacks(request);
  }

  /**
   * Sanitize object values
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];

        if (typeof value === 'string') {
          // Remove potentially dangerous characters
          sanitized[key] = this.sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }

  /**
   * Sanitize string values
   */
  private sanitizeString(str: string): string {
    return (
      str
        // Remove null bytes
        .replace(/\x00/g, '')
        // Remove control characters except newlines and tabs
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Trim whitespace
        .trim()
    );
  }

  /**
   * Validate request size
   */
  private validateRequestSize(request: any): void {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const size = JSON.stringify(request).length;

    if (size > maxSize) {
      throw new BadRequestException('Request size exceeds maximum allowed size');
    }
  }

  /**
   * Check for potential injection attacks
   */
  private checkForInjectionAttacks(request: any): void {
    const suspiciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
      /union\s+select/gi,
      /drop\s+table/gi,
      /delete\s+from/gi,
      /insert\s+into/gi,
      /update\s+set/gi,
      /exec\s*\(/gi,
      /system\s*\(/gi,
    ];

    const checkValue = (value: any, path: string): void => {
      if (typeof value === 'string') {
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(value)) {
            throw new BadRequestException(`Potential injection attack detected in ${path}`);
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            checkValue(value[key], `${path}.${key}`);
          }
        }
      }
    };

    checkValue(request, 'request');
  }
}
