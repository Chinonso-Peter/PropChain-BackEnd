import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';

/**
 * Enhanced Authentication Guard
 *
 * Provides hardened authentication with additional security checks
 */
@Injectable()
export class AuthHardeningGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    // Validate token format
    if (!this.isValidTokenFormat(token)) {
      throw new UnauthorizedException('Invalid token format');
    }

    // Check if token is blacklisted
    if (await this.isTokenBlacklisted(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    try {
      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Additional security checks
      await this.validateSecurityContext(payload, request);

      // Attach user to request
      request.user = payload;

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Extract token from authorization header
   */
  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Validate JWT token format
   */
  private isValidTokenFormat(token: string): boolean {
    // JWT tokens have 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Each part should be base64url encoded
    try {
      parts.forEach(part => {
        Buffer.from(part, 'base64url');
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if token is blacklisted
   */
  private async isTokenBlacklisted(token: string): Promise<boolean> {
    // This would check against a blacklist store (Redis, database, etc.)
    // For now, return false
    return false;
  }

  /**
   * Validate security context
   */
  private async validateSecurityContext(payload: any, request: any): Promise<void> {
    // Check token expiration buffer
    const now = Date.now();
    const exp = payload.exp * 1000;
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    if (exp - now < bufferTime) {
      throw new UnauthorizedException('Token is expiring soon, please refresh');
    }

    // Check issued at time (prevent very old tokens)
    const iat = payload.iat * 1000;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (now - iat > maxAge) {
      throw new UnauthorizedException('Token is too old, please re-authenticate');
    }

    // Validate user agent consistency
    const expectedUserAgent = payload.userAgent;
    const actualUserAgent = request.headers['user-agent'];

    if (expectedUserAgent && expectedUserAgent !== actualUserAgent) {
      throw new UnauthorizedException('User agent mismatch');
    }

    // Validate IP address consistency (if enabled)
    const ipValidationEnabled = this.configService.get<boolean>('IP_VALIDATION_ENABLED', false);
    if (ipValidationEnabled) {
      const expectedIp = payload.ip;
      const actualIp = this.getClientIp(request);

      if (expectedIp && expectedIp !== actualIp) {
        throw new UnauthorizedException('IP address mismatch');
      }
    }
  }

  /**
   * Get client IP address
   */
  private getClientIp(request: any): string {
    return (
      request.ip ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      '0.0.0.0'
    );
  }
}

/**
 * Enhanced Role-based Access Control Guard
 */
@Injectable()
export class RbacHardeningGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());

    if (!requiredRoles) {
      return true; // No roles required
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Check if user has required roles
    const hasRole = requiredRoles.some(role => user.roles?.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Additional security checks
    this.validateUserPermissions(user, context);

    return true;
  }

  /**
   * Validate additional user permissions
   */
  private validateUserPermissions(user: any, context: ExecutionContext): void {
    // Check if user account is active
    if (user.status !== 'active') {
      throw new ForbiddenException('Account is not active');
    }

    // Check if user account is not suspended
    if (user.suspendedUntil && user.suspendedUntil > Date.now()) {
      throw new ForbiddenException('Account is suspended');
    }

    // Check if user has passed 2FA requirement (if enabled)
    const twoFaRequired = this.configService.get<boolean>('TWO_FA_REQUIRED', false);
    if (twoFaRequired && !user.twoFactorVerified) {
      throw new ForbiddenException('Two-factor authentication required');
    }

    // Check session timeout
    const sessionTimeout = this.configService.get<number>('SESSION_TIMEOUT', 3600000); // 1 hour
    const lastActivity = user.lastActivity || user.iat * 1000;

    if (Date.now() - lastActivity > sessionTimeout) {
      throw new UnauthorizedException('Session has expired');
    }
  }
}

/**
 * API Key Authentication Guard
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    // Validate API key format
    if (!this.isValidApiKeyFormat(apiKey)) {
      throw new UnauthorizedException('Invalid API key format');
    }

    // Verify API key
    const isValid = await this.verifyApiKey(apiKey, request);

    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  /**
   * Extract API key from request
   */
  private extractApiKey(request: any): string | null {
    // Check header first
    const headerKey = request.headers['x-api-key'];
    if (headerKey) {
      return headerKey;
    }

    // Check query parameter
    const queryKey = request.query.api_key;
    if (queryKey) {
      return queryKey;
    }

    return null;
  }

  /**
   * Validate API key format
   */
  private isValidApiKeyFormat(apiKey: string): boolean {
    // API keys should be at least 32 characters and contain only alphanumeric characters
    return /^[a-zA-Z0-9]{32,}$/.test(apiKey);
  }

  /**
   * Verify API key against database
   */
  private async verifyApiKey(apiKey: string, request: any): Promise<boolean> {
    // This would verify against database or API key service
    // For now, return true for demonstration
    return true;
  }
}

/**
 * Request Signing Verification Guard
 */
@Injectable()
export class RequestSigningGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Skip signing verification for non-sensitive endpoints
    if (this.isPublicEndpoint(context)) {
      return true;
    }

    const signature = request.headers['x-signature'];
    const timestamp = request.headers['x-timestamp'];

    if (!signature || !timestamp) {
      throw new UnauthorizedException('Request signature and timestamp are required');
    }

    // Validate timestamp (prevent replay attacks)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(now - requestTime) > maxAge) {
      throw new UnauthorizedException('Request timestamp is too old');
    }

    // Verify signature
    const isValid = await this.verifySignature(request, signature);

    if (!isValid) {
      throw new UnauthorizedException('Invalid request signature');
    }

    return true;
  }

  /**
   * Check if endpoint is public
   */
  private isPublicEndpoint(context: ExecutionContext): boolean {
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler());
    return isPublic === true;
  }

  /**
   * Verify request signature
   */
  private async verifySignature(request: any, signature: string): Promise<boolean> {
    // This would verify the signature using the client's secret key
    // For now, return true for demonstration
    return true;
  }
}
