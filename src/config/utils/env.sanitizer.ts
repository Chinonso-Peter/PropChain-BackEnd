/**
 * Environment variable sanitization utilities
 */
export class EnvSanitizer {
  /**
   * Sanitize environment variables for security
   */
  static sanitize(env: Record<string, string>): Record<string, string> {
    const sanitized = { ...env };

    // Remove potentially dangerous characters
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        // Remove null bytes and control characters
        sanitized[key] = value.replace(/[\x00-\x1F\x7F]/g, '').trim();

        // Remove potential SQL injection patterns
        if (key.toLowerCase().includes('database') || key.toLowerCase().includes('db')) {
          sanitized[key] = this.sanitizeDatabaseUrl(value);
        }

        // Remove potential XSS patterns from URLs
        if (key.toLowerCase().includes('url')) {
          sanitized[key] = this.sanitizeUrl(value);
        }
      }
    }

    return sanitized;
  }

  /**
   * Sanitize database URLs
   */
  private static sanitizeDatabaseUrl(url: string): string {
    // Basic URL validation and sanitization
    const urlRegex = /^(postgresql|mysql|mongodb):\/\/[^;]+$/;
    if (!urlRegex.test(url)) {
      throw new Error(`Invalid database URL format: ${url}`);
    }
    return url;
  }

  /**
   * Sanitize URLs
   */
  private static sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove potentially dangerous parts
      parsed.hash = '';
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    } catch {
      throw new Error(`Invalid URL format: ${url}`);
    }
  }

  /**
   * Mask sensitive values for logging
   */
  static maskSensitiveValues(env: Record<string, string>): Record<string, string> {
    const masked = { ...env };
    const sensitiveKeys = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'PRIVATE_KEY',
      'REDIS_PASSWORD',
      'SESSION_SECRET',
      'SMTP_PASS',
      'API_KEY',
      'ETHERSCAN_API_KEY',
      'WEB3_STORAGE_TOKEN',
      'IPFS_PROJECT_SECRET',
      'S3_SECRET_ACCESS_KEY',
    ];

    for (const key of Object.keys(masked)) {
      if (sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
        const value = masked[key];
        if (value && value.length > 8) {
          // Show first 4 and last 4 characters, mask the rest
          masked[key] = `${value.substring(0, 4)}${'*'.repeat(value.length - 8)}${value.substring(value.length - 4)}`;
        } else if (value) {
          masked[key] = '****';
        }
      }
    }

    return masked;
  }
}
