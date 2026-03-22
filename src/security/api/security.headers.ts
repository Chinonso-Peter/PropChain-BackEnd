import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Security Headers Interceptor
 *
 * Automatically adds security headers to all API responses
 */
@Injectable()
export class SecurityHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => {
        const response = context.switchToHttp().getResponse();

        // Content Security Policy
        response.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "font-src 'self'; " +
            "connect-src 'self'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self';",
        );

        // Strict Transport Security
        response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

        // X-Frame-Options
        response.setHeader('X-Frame-Options', 'DENY');

        // X-Content-Type-Options
        response.setHeader('X-Content-Type-Options', 'nosniff');

        // Referrer Policy
        response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Permissions Policy
        response.setHeader(
          'Permissions-Policy',
          'geolocation=(), ' +
            'microphone=(), ' +
            'camera=(), ' +
            'payment=(), ' +
            'usb=(), ' +
            'magnetometer=(), ' +
            'gyroscope=(), ' +
            'accelerometer=()',
        );

        // X-XSS-Protection
        response.setHeader('X-XSS-Protection', '1; mode=block');

        // Remove Server Header
        response.removeHeader('Server');

        return data;
      }),
    );
  }
}
