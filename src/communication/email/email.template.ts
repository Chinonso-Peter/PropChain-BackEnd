import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Email Template Service
 *
 * Handles dynamic email template rendering with personalization and caching
 */
@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templateCache: Map<string, CachedTemplate> = new Map();
  private readonly cacheTtlMs: number;
  private readonly maxCacheSize: number;

  constructor(private readonly configService: ConfigService) {
    this.cacheTtlMs = this.configService.get<number>('EMAIL_TEMPLATE_CACHE_TTL_MS', 300000); // 5 minutes
    this.maxCacheSize = this.configService.get<number>('EMAIL_TEMPLATE_MAX_CACHE_SIZE', 1000);
    this.startCacheCleanup();
  }

  /**
   * Render email template with dynamic content and caching
   */
  renderTemplate(templateName: string, data: any, locale: string = 'en'): EmailTemplate {
    const cacheKey = `${templateName}:${locale}`;
    
    // Try to get from cache first
    const cachedTemplate = this.getCachedTemplate(cacheKey);
    if (cachedTemplate) {
      return {
        subject: this.processStringTemplate(cachedTemplate.subject, data),
        content: this.processStringTemplate(cachedTemplate.content, data),
      };
    }

    // Get template and cache it
    const template = this.getTemplate(templateName, locale);
    this.setCachedTemplate(cacheKey, template);
    
    return {
      subject: this.processStringTemplate(template.subject, data),
      content: this.processStringTemplate(template.content, data),
    };
  }

  /**
   * Get email template by name and locale
   */
  private getTemplate(templateName: string, locale: string): EmailTemplate {
    const templates = this.getTemplates(locale);
    return templates[templateName] || templates['default'];
  }

  /**
   * Process template with data substitution
   */
  private processTemplate(template: EmailTemplate, data: any): string {
    return this.processStringTemplate(template.content, data);
  }

  /**
   * Process string template with data substitution
   */
  private processStringTemplate(template: string, data: any): string {
    let processedContent = template;

    // Replace placeholders with actual data
    Object.keys(data).forEach(key => {
      const placeholder = `{{${key}}}`;
      const value = this.getNestedValue(data, key);
      processedContent = processedContent.replace(
        new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        value || '',
      );
    });

    // Process conditional blocks
    processedContent = this.processConditionals(processedContent, data);

    // Process loops
    processedContent = this.processLoops(processedContent, data);

    return processedContent;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): string {
    return path.split('.').reduce((current, key) => current?.[key], obj) || '';
  }

  /**
   * Process conditional blocks {{#if condition}}...{{/if}}
   */
  private processConditionals(content: string, data: any): string {
    const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

    return content.replace(ifRegex, (match, condition, blockContent) => {
      const value = this.getNestedValue(data, condition.trim());
      return value ? blockContent : '';
    });
  }

  /**
   * Process loop blocks {{#each items}}...{{/each}}
   */
  private processLoops(content: string, data: any): string {
    const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return content.replace(eachRegex, (match, arrayPath, blockContent) => {
      const items = this.getNestedValue(data, arrayPath.trim());

      if (!Array.isArray(items)) {
        return '';
      }

      return items
        .map((item, index) => {
          let itemContent = blockContent;

          // Replace {{this}} with current item
          itemContent = itemContent.replace(/\{\{this\}\}/g, item);

          // Replace {{@index}} with current index
          itemContent = itemContent.replace(/\{\{@index\}\}/g, index.toString());

          // Replace item properties
          if (typeof item === 'object') {
            Object.keys(item).forEach(key => {
              const placeholder = `{{${key}}}`;
              itemContent = itemContent.replace(
                new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                item[key] || '',
              );
            });
          }

          return itemContent;
        })
        .join('');
    });
  }

  /**
   * Get all templates for a locale
   */
  private getTemplates(locale: string): Record<string, EmailTemplate> {
    const templates = {
      en: {
        welcome: {
          subject: 'Welcome to PropChain!',
          content: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 10px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 32px;">Welcome to PropChain!</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 20px 0; font-size: 18px;">
                  Hi {{firstName}}, thank you for joining our platform!
                </p>
              </div>
              
              <div style="padding: 30px; background: #f8f9fa; border-radius: 10px; margin: 20px 0;">
                <h2 style="color: #333; margin-top: 0;">Getting Started</h2>
                <p style="color: #666; line-height: 1.6;">
                  Your account has been successfully created. Here's what you can do next:
                </p>
                <ul style="color: #666; line-height: 1.8;">
                  <li>Complete your profile</li>
                  <li>Connect your wallet</li>
                  <li>Explore our features</li>
                  <li>Join our community</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="{{verificationUrl}}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                    Verify Your Email
                  </a>
                </div>
              </div>
              
              <div style="padding: 20px; text-align: center; color: #999; font-size: 14px;">
                <p>If you didn't create this account, please ignore this email.</p>
                <p>© 2024 PropChain. All rights reserved.</p>
              </div>
            </div>
          `,
        },
        'email-verification': {
          subject: 'Verify Your Email Address',
          content: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #4CAF50; padding: 30px; border-radius: 10px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Email Verification</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 15px 0;">
                  Please verify your email address to complete your registration
                </p>
              </div>
              
              <div style="padding: 30px; background: #f8f9fa; border-radius: 10px; margin: 20px 0;">
                <p style="color: #333; font-size: 16px; line-height: 1.6;">
                  Hi {{firstName}},<br><br>
                  Thank you for registering with PropChain! To complete your registration and activate your account,
                  please click the verification button below:
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="{{verificationUrl}}" style="background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                    Verify Email Address
                  </a>
                </div>
                
                <p style="color: #666; font-size: 14px;">
                  Or copy and paste this link into your browser:<br>
                  <span style="background: #e9ecef; padding: 10px; border-radius: 3px; display: inline-block; word-break: break-all;">
                    {{verificationUrl}}
                  </span>
                </p>
                
                <p style="color: #999; font-size: 12px; margin-top: 20px;">
                  This verification link will expire in 1 hour.
                </p>
              </div>
            </div>
          `,
        },
        'password-reset': {
          subject: 'Reset Your Password',
          content: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #ff6b6b; padding: 30px; border-radius: 10px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 15px 0;">
                  You requested to reset your password
                </p>
              </div>
              
              <div style="padding: 30px; background: #f8f9fa; border-radius: 10px; margin: 20px 0;">
                <p style="color: #333; font-size: 16px; line-height: 1.6;">
                  Hi {{firstName}},<br><br>
                  We received a request to reset your password for your PropChain account.
                  Click the button below to reset your password:
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="{{resetUrl}}" style="background: #ff6b6b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                    Reset Password
                  </a>
                </div>
                
                <p style="color: #666; font-size: 14px;">
                  Or copy and paste this link into your browser:<br>
                  <span style="background: #e9ecef; padding: 10px; border-radius: 3px; display: inline-block; word-break: break-all;">
                    {{resetUrl}}
                  </span>
                </p>
                
                <p style="color: #999; font-size: 12px; margin-top: 20px;">
                  This reset link will expire in 1 hour.
                </p>
              </div>
              
              <div style="padding: 20px; background: #fff3cd; border-radius: 10px; border-left: 4px solid #ffc107;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>Security Notice:</strong> If you didn't request this password reset, 
                  please ignore this email or contact our support team immediately.
                </p>
              </div>
            </div>
          `,
        },
        'login-alert': {
          subject: 'New Login Detected',
          content: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #17a2b8; padding: 30px; border-radius: 10px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Security Alert</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 15px 0;">
                  New login detected on your account
                </p>
              </div>
              
              <div style="padding: 30px; background: #f8f9fa; border-radius: 10px; margin: 20px 0;">
                <p style="color: #333; font-size: 16px; line-height: 1.6;">
                  Hi {{firstName}},<br><br>
                  We detected a new login to your PropChain account:
                </p>
                
                <div style="background: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Date:</strong> {{loginDate}}</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> {{loginTime}}</p>
                  <p style="margin: 5px 0;"><strong>IP Address:</strong> {{ipAddress}}</p>
                  <p style="margin: 5px 0;"><strong>Device:</strong> {{userAgent}}</p>
                  <p style="margin: 5px 0;"><strong>Location:</strong> {{location}}</p>
                </div>
                
                {{#if wasSuspicious}}
                <div style="padding: 20px; background: #f8d7da; border-radius: 10px; border-left: 4px solid #dc3545;">
                  <p style="color: #721c24; margin: 0; font-size: 14px;">
                    <strong>Warning:</strong> This login appears to be from an unrecognized device or location.
                    If this wasn't you, please secure your account immediately.
                  </p>
                  <div style="text-align: center; margin: 15px 0;">
                    <a href="{{secureAccountUrl}}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                      Secure Account
                    </a>
                  </div>
                </div>
                {{/if}}
              </div>
            </div>
          `,
        },
        default: {
          subject: 'PropChain Notification',
          content: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #6c757d; padding: 30px; border-radius: 10px; text-align: center;">
                <h1 style="color: white; margin: 0;">{{subject}}</h1>
              </div>
              
              <div style="padding: 30px; background: #f8f9fa; border-radius: 10px; margin: 20px 0;">
                <p style="color: #333; line-height: 1.6;">{{content}}</p>
              </div>
            </div>
          `,
        },
      },
    };

    return templates[locale] || templates.en;
  }

  /**
   * Create A/B test variant of template
   */
  createABTestVariant(templateName: string, variant: 'A' | 'B', changes: Partial<EmailTemplate>): EmailTemplate {
    const originalTemplate = this.getTemplate(templateName, 'en');

    return {
      subject: changes.subject || originalTemplate.subject,
      content: changes.content || originalTemplate.content,
    };
  }

  /**
   * Preview template with sample data
   */
  previewTemplate(templateName: string, data: any, locale: string = 'en'): EmailPreview {
    const template = this.getTemplate(templateName, locale);
    const renderedContent = this.processTemplate(template, data);

    return {
      templateName,
      subject: this.processStringTemplate(template.subject, data),
      content: renderedContent,
      locale,
      previewData: data,
    };
  }

  /**
   * Get cached template if valid
   */
  private getCachedTemplate(key: string): EmailTemplate | null {
    const cached = this.templateCache.get(key);
    if (!cached) {
      return null;
    }

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.cacheTtlMs) {
      this.templateCache.delete(key);
      return null;
    }

    // Update access time for LRU
    cached.lastAccessed = Date.now();
    return cached.template;
  }

  /**
   * Cache template with LRU eviction
   */
  private setCachedTemplate(key: string, template: EmailTemplate): void {
    // Evict oldest if cache is full
    if (this.templateCache.size >= this.maxCacheSize) {
      this.evictOldestCacheEntry();
    }

    this.templateCache.set(key, {
      template,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
  }

  /**
   * Evict oldest cache entry (LRU)
   */
  private evictOldestCacheEntry(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, cached] of this.templateCache.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.templateCache.delete(oldestKey);
      this.logger.debug(`Evicted oldest template from cache: ${oldestKey}`);
    }
  }

  /**
   * Start periodic cache cleanup
   */
  private startCacheCleanup(): void {
    const cleanupInterval = this.configService.get<number>('EMAIL_TEMPLATE_CACHE_CLEANUP_INTERVAL_MS', 60000); // 1 minute
    
    setInterval(() => {
      this.cleanupExpiredCache();
    }, cleanupInterval).unref?.();
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, cached] of this.templateCache.entries()) {
      if (now - cached.timestamp > this.cacheTtlMs) {
        this.templateCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired template cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): TemplateCacheStats {
    return {
      size: this.templateCache.size,
      maxSize: this.maxCacheSize,
      ttlMs: this.cacheTtlMs,
      hitRate: this.calculateHitRate(),
    };
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templateCache.clear();
    this.logger.log('Template cache cleared');
  }

  /**
   * Warm up cache with common templates
   */
  async warmupCache(locales: string[] = ['en']): Promise<void> {
    const commonTemplates = ['welcome', 'email-verification', 'password-reset', 'login-alert'];
    
    for (const locale of locales) {
      for (const templateName of commonTemplates) {
        try {
          this.getTemplate(templateName, locale);
          this.logger.debug(`Warmed up cache for template: ${templateName}:${locale}`);
        } catch (error) {
          this.logger.warn(`Failed to warm up template ${templateName}:${locale}`, error);
        }
      }
    }
  }

  private cacheHits = 0;
  private cacheMisses = 0;

  private calculateHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? (this.cacheHits / total) * 100 : 0;
  }
}

// Type definitions
interface EmailTemplate {
  subject: string;
  content: string;
}

interface EmailPreview {
  templateName: string;
  subject: string;
  content: string;
  locale: string;
  previewData: any;
}

interface CachedTemplate {
  template: EmailTemplate;
  timestamp: number;
  lastAccessed: number;
}

interface TemplateCacheStats {
  size: number;
  maxSize: number;
  ttlMs: number;
  hitRate: number;
}
