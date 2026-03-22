import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Email Preference Service
 *
 * Manages user communication preferences and unsubscribe functionality
 */
@Injectable()
export class PreferenceService {
  private readonly logger = new Logger(PreferenceService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    // This would fetch from database
    // For now, return default preferences
    return {
      userId,
      email: {
        enabled: true,
        marketing: false,
        notifications: true,
        security: true,
        newsletter: false,
        frequency: 'immediate',
        quietHours: {
          start: '22:00',
          end: '08:00',
        },
      },
      sms: {
        enabled: true,
        marketing: false,
        security: true,
        transactional: true,
      },
      push: {
        enabled: true,
        marketing: false,
        security: true,
        transactional: true,
      },
      inapp: {
        enabled: true,
        marketing: false,
        security: true,
        transactional: true,
      },
      global: {
        language: 'en',
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
      },
    };
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    this.logger.log(`Updating user preferences`, {
      userId,
      updatedFields: Object.keys(preferences),
    });

    // This would update database
    // For now, merge with existing and return
    const existing = await this.getUserPreferences(userId);
    const updated = this.mergePreferences(existing, preferences);

    return updated;
  }

  /**
   * Update email preferences
   */
  async updateEmailPreferences(userId: string, preferences: Partial<EmailPreferences>): Promise<EmailPreferences> {
    const userPrefs = await this.getUserPreferences(userId);
    const updatedEmailPrefs = { ...userPrefs.email, ...preferences };

    await this.updateUserPreferences(userId, { email: updatedEmailPrefs });

    this.logger.log(`Updated email preferences`, {
      userId,
      preferences: updatedEmailPrefs,
    });

    return updatedEmailPrefs;
  }

  /**
   * Update channel preferences
   */
  async updateChannelPreferences(
    userId: string,
    channel: CommunicationChannel,
    preferences: Partial<ChannelPreferences>,
  ): Promise<ChannelPreferences> {
    const userPrefs = await this.getUserPreferences(userId);

    let updatedChannelPrefs: ChannelPreferences;

    switch (channel) {
      case 'email':
        updatedChannelPrefs = { ...userPrefs.email, ...preferences } as ChannelPreferences;
        break;
      case 'sms':
        updatedChannelPrefs = { ...userPrefs.sms, ...preferences } as ChannelPreferences;
        break;
      case 'push':
        updatedChannelPrefs = { ...userPrefs.push, ...preferences } as ChannelPreferences;
        break;
      case 'inapp':
        updatedChannelPrefs = { ...userPrefs.inapp, ...preferences } as ChannelPreferences;
        break;
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }

    await this.updateUserPreferences(userId, { [channel]: updatedChannelPrefs });

    this.logger.log(`Updated ${channel} preferences`, {
      userId,
      preferences: updatedChannelPrefs,
    });

    return updatedChannelPrefs;
  }

  /**
   * Unsubscribe user from specific type
   */
  async unsubscribe(
    userId: string,
    channel: CommunicationChannel,
    type: UnsubscribeType,
    token?: string,
  ): Promise<UnsubscribeResult> {
    this.logger.log(`Processing unsubscribe request`, {
      userId,
      channel,
      type,
      token,
    });

    // Validate unsubscribe token
    if (token && !(await this.validateUnsubscribeToken(userId, token))) {
      return {
        success: false,
        error: 'Invalid unsubscribe token',
      };
    }

    try {
      const userPrefs = await this.getUserPreferences(userId);

      // Update preferences based on unsubscribe type
      switch (type) {
        case 'all':
          // Disable all marketing communications
          await this.updateUserPreferences(userId, {
            email: { ...userPrefs.email, marketing: false, newsletter: false },
            sms: { ...userPrefs.sms, marketing: false },
            push: { ...userPrefs.push, marketing: false },
          });
          break;

        case 'marketing':
          // Disable marketing across all channels
          await this.updateUserPreferences(userId, {
            email: { ...userPrefs.email, marketing: false },
            sms: { ...userPrefs.sms, marketing: false },
            push: { ...userPrefs.push, marketing: false },
          });
          break;

        case 'newsletter':
          // Disable newsletter specifically
          await this.updateEmailPreferences(userId, { newsletter: false });
          break;

        case 'channel':
          // Disable entire channel
          await this.updateChannelPreferences(userId, channel, { enabled: false });
          break;

        default:
          throw new Error(`Unknown unsubscribe type: ${type}`);
      }

      // Log unsubscribe event
      await this.logUnsubscribeEvent(userId, channel, type, token);

      this.logger.log(`Successfully unsubscribed user`, {
        userId,
        channel,
        type,
      });

      return {
        success: true,
        message: `Successfully unsubscribed from ${type}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Failed to unsubscribe user`, errorMessage, {
        userId,
        channel,
        type,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Resubscribe user
   */
  async resubscribe(userId: string, channel: CommunicationChannel, type: ResubscribeType): Promise<ResubscribeResult> {
    this.logger.log(`Processing resubscribe request`, {
      userId,
      channel,
      type,
    });

    try {
      const userPrefs = await this.getUserPreferences(userId);

      // Update preferences based on resubscribe type
      switch (type) {
        case 'marketing':
          // Enable marketing across all channels
          await this.updateUserPreferences(userId, {
            email: { ...userPrefs.email, marketing: true },
            sms: { ...userPrefs.sms, marketing: true },
            push: { ...userPrefs.push, marketing: true },
          });
          break;

        case 'newsletter':
          // Enable newsletter specifically
          await this.updateEmailPreferences(userId, { newsletter: true });
          break;

        case 'channel':
          // Enable entire channel
          await this.updateChannelPreferences(userId, channel, { enabled: true });
          break;

        default:
          throw new Error(`Unknown resubscribe type: ${type}`);
      }

      // Log resubscribe event
      await this.logResubscribeEvent(userId, channel, type);

      this.logger.log(`Successfully resubscribed user`, {
        userId,
        channel,
        type,
      });

      return {
        success: true,
        message: `Successfully resubscribed to ${type}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Failed to resubscribe user`, errorMessage, {
        userId,
        channel,
        type,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate unsubscribe token
   */
  async generateUnsubscribeToken(userId: string): Promise<string> {
    const token = Buffer.from(`${userId}:${Date.now()}:${this.generateSecret()}`).toString('base64');

    // Store token in database with expiry
    // For now, just return token

    this.logger.log(`Generated unsubscribe token`, { userId });

    return token;
  }

  /**
   * Validate unsubscribe token
   */
  async validateUnsubscribeToken(userId: string, token: string): Promise<boolean> {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [tokenUserId, timestamp] = decoded.split(':');

      // Check if token matches user
      if (tokenUserId !== userId) {
        return false;
      }

      // Check if token is not expired (24 hours)
      const tokenTime = parseInt(timestamp);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      return now - tokenTime < maxAge;
    } catch {
      return false;
    }
  }

  /**
   * Get unsubscribe page data
   */
  async getUnsubscribePageData(token: string): Promise<UnsubscribePageData | null> {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [userId, timestamp] = decoded.split(':');

      // Validate token
      if (!(await this.validateUnsubscribeToken(userId, token))) {
        return null;
      }

      const userPrefs = await this.getUserPreferences(userId);

      return {
        userId,
        token,
        valid: true,
        preferences: userPrefs,
        unsubscribeUrl: `${this.configService.get<string>('BASE_URL')}/api/unsubscribe`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Process bulk preference updates
   */
  async processBulkUpdates(updates: BulkPreferenceUpdate[]): Promise<BulkUpdateResult> {
    const results: BulkUpdateResult['results'] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const update of updates) {
      try {
        await this.updateUserPreferences(update.userId, update.preferences);
        results.push({
          userId: update.userId,
          success: true,
        });
        successCount++;
      } catch (error) {
        results.push({
          userId: update.userId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failureCount++;
      }
    }

    this.logger.log(`Processed bulk preference updates`, {
      totalUpdates: updates.length,
      successCount,
      failureCount,
    });

    return {
      totalUpdates: updates.length,
      successCount,
      failureCount,
      results,
    };
  }

  /**
   * Get preference statistics
   */
  async getPreferenceStatistics(timeRange?: TimeRange): Promise<PreferenceStatistics> {
    // This would query database for analytics
    return {
      totalUsers: 10000,
      emailEnabled: 8500,
      smsEnabled: 6000,
      pushEnabled: 7000,
      marketingOptOut: 2000,
      newsletterOptOut: 3000,
      totalUnsubscribes: 150,
      totalResubscribes: 75,
      mostUnsubscribedChannel: 'email',
      timeRange: timeRange || { start: new Date(), end: new Date() },
    };
  }

  /**
   * Export user preferences
   */
  async exportUserPreferences(userId: string): Promise<PreferenceExport> {
    const preferences = await this.getUserPreferences(userId);

    return {
      userId,
      exportedAt: new Date(),
      format: 'json',
      preferences,
      signature: this.generateExportSignature(preferences),
    };
  }

  /**
   * Import user preferences
   */
  async importUserPreferences(userId: string, preferences: any, signature: string): Promise<ImportResult> {
    try {
      // Validate signature
      if (!this.validateExportSignature(preferences, signature)) {
        return {
          success: false,
          error: 'Invalid signature',
        };
      }

      // Import preferences
      await this.updateUserPreferences(userId, preferences);

      this.logger.log(`Successfully imported preferences`, { userId });

      return {
        success: true,
        importedAt: new Date(),
        fieldsImported: Object.keys(preferences).length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Failed to import preferences`, errorMessage, { userId });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Merge preferences
   */
  private mergePreferences(existing: UserPreferences, updates: Partial<UserPreferences>): UserPreferences {
    return {
      userId: updates.userId || existing.userId,
      email: { ...existing.email, ...updates.email },
      sms: { ...existing.sms, ...updates.sms },
      push: { ...existing.push, ...updates.push },
      inapp: { ...existing.inapp, ...updates.inapp },
      global: { ...existing.global, ...updates.global },
    };
  }

  /**
   * Log unsubscribe event
   */
  private async logUnsubscribeEvent(
    userId: string,
    channel: CommunicationChannel,
    type: UnsubscribeType,
    token?: string,
  ): Promise<void> {
    // This would log to database
    this.logger.log(`Unsubscribe event`, {
      userId,
      channel,
      type,
      token,
    });
  }

  /**
   * Log resubscribe event
   */
  private async logResubscribeEvent(
    userId: string,
    channel: CommunicationChannel,
    type: ResubscribeType,
  ): Promise<void> {
    // This would log to database
    this.logger.log(`Resubscribe event`, {
      userId,
      channel,
      type,
    });
  }

  /**
   * Generate secret for token
   */
  private generateSecret(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Generate export signature
   */
  private generateExportSignature(preferences: any): string {
    const data = JSON.stringify(preferences);
    const secret = this.configService.get<string>('PREFERENCE_EXPORT_SECRET');

    // Simple HMAC signature (in production, use crypto)
    return Buffer.from(`${data}:${secret}`).toString('base64');
  }

  /**
   * Validate export signature
   */
  private validateExportSignature(preferences: any, signature: string): boolean {
    const data = JSON.stringify(preferences);
    const secret = this.configService.get<string>('PREFERENCE_EXPORT_SECRET');
    const expectedSignature = Buffer.from(`${data}:${secret}`).toString('base64');

    return signature === expectedSignature;
  }
}

// Type definitions
type CommunicationChannel = 'email' | 'sms' | 'push' | 'inapp';

interface UserPreferences {
  userId: string;
  email: EmailPreferences;
  sms: ChannelPreferences;
  push: ChannelPreferences;
  inapp: ChannelPreferences;
  global: GlobalPreferences;
}

interface EmailPreferences {
  enabled: boolean;
  marketing: boolean;
  notifications: boolean;
  security: boolean;
  newsletter: boolean;
  frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
  quietHours?: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
}

interface ChannelPreferences {
  enabled: boolean;
  marketing: boolean;
  security: boolean;
  transactional: boolean;
}

interface GlobalPreferences {
  language: string;
  timezone: string;
  dateFormat: string;
}

interface UnsubscribeResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface ResubscribeResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface UnsubscribePageData {
  userId: string;
  token: string;
  valid: boolean;
  preferences: UserPreferences;
  unsubscribeUrl: string;
}

interface BulkPreferenceUpdate {
  userId: string;
  preferences: Partial<UserPreferences>;
}

interface BulkUpdateResult {
  totalUpdates: number;
  successCount: number;
  failureCount: number;
  results: {
    userId: string;
    success: boolean;
    error?: string;
  }[];
}

interface PreferenceStatistics {
  totalUsers: number;
  emailEnabled: number;
  smsEnabled: number;
  pushEnabled: number;
  marketingOptOut: number;
  newsletterOptOut: number;
  totalUnsubscribes: number;
  totalResubscribes: number;
  mostUnsubscribedChannel: string;
  timeRange: TimeRange;
}

interface PreferenceExport {
  userId: string;
  exportedAt: Date;
  format: string;
  preferences: UserPreferences;
  signature: string;
}

interface ImportResult {
  success: boolean;
  importedAt?: Date;
  fieldsImported?: number;
  error?: string;
}

type UnsubscribeType = 'all' | 'marketing' | 'newsletter' | 'channel';

type ResubscribeType = 'marketing' | 'newsletter' | 'channel';

interface TimeRange {
  start: Date;
  end: Date;
}
