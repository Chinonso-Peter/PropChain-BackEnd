import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Email Delivery Tracking Service
 *
 * Enhanced tracking for email delivery status with real-time updates
 */
@Injectable()
export class EmailDeliveryTrackingService {
  private readonly logger = new Logger(EmailDeliveryTrackingService.name);
  private readonly deliveryStatus: Map<string, DeliveryStatus> = new Map();
  private readonly trackingCallbacks: Map<string, TrackingCallback[]> = new Map();
  private readonly maxTrackingAge: number;
  private readonly cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.maxTrackingAge = this.configService.get<number>('EMAIL_DELIVERY_TRACKING_MAX_AGE_MS', 7 * 24 * 60 * 60 * 1000); // 7 days
    this.startCleanupTask();
  }

  /**
   * Initialize email delivery tracking
   */
  initializeTracking(emailId: string, provider: string, recipients: string[]): void {
    const status: DeliveryStatus = {
      emailId,
      provider,
      recipients: recipients.map(email => ({
        email,
        status: 'pending',
        events: [],
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
      overallStatus: 'pending',
    };

    this.deliveryStatus.set(emailId, status);
    this.logger.debug(`Initialized tracking for email: ${emailId}`);
  }

  /**
   * Update delivery status for a recipient
   */
  updateDeliveryStatus(
    emailId: string,
    recipientEmail: string,
    status: DeliveryEvent['type'],
    metadata?: any,
  ): void {
    const tracking = this.deliveryStatus.get(emailId);
    if (!tracking) {
      this.logger.warn(`Tracking not found for email: ${emailId}`);
      return;
    }

    const recipient = tracking.recipients.find(r => r.email === recipientEmail);
    if (!recipient) {
      this.logger.warn(`Recipient not found: ${recipientEmail} for email: ${emailId}`);
      return;
    }

    const event: DeliveryEvent = {
      type: status,
      timestamp: new Date(),
      metadata: metadata || {},
    };

    recipient.events.push(event);
    recipient.status = this.determineRecipientStatus(recipient.events);
    tracking.updatedAt = new Date();
    tracking.overallStatus = this.determineOverallStatus(tracking.recipients);

    // Trigger callbacks
    this.triggerCallbacks(emailId, recipientEmail, event);

    this.logger.debug(`Updated delivery status`, {
      emailId,
      recipient: recipientEmail,
      status,
      overallStatus: tracking.overallStatus,
    });
  }

  /**
   * Get delivery status for an email
   */
  getDeliveryStatus(emailId: string): DeliveryStatus | null {
    return this.deliveryStatus.get(emailId) || null;
  }

  /**
   * Get delivery status for a specific recipient
   */
  getRecipientStatus(emailId: string, recipientEmail: string): RecipientStatus | null {
    const tracking = this.deliveryStatus.get(emailId);
    if (!tracking) {
      return null;
    }

    return tracking.recipients.find(r => r.email === recipientEmail) || null;
  }

  /**
   * Register callback for delivery events
   */
  onDeliveryEvent(
    emailId: string,
    callback: (recipientEmail: string, event: DeliveryEvent) => void,
  ): void {
    if (!this.trackingCallbacks.has(emailId)) {
      this.trackingCallbacks.set(emailId, []);
    }

    this.trackingCallbacks.get(emailId)!.push(callback);
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(timeRange?: TimeRange): DeliveryStats {
    const allTracking = Array.from(this.deliveryStatus.values());
    const filteredTracking = timeRange
      ? allTracking.filter(t => this.isInTimeRange(t.createdAt, timeRange))
      : allTracking;

    const stats = filteredTracking.reduce(
      (acc, tracking) => {
        acc.totalEmails++;
        acc.totalRecipients += tracking.recipients.length;

        tracking.recipients.forEach(recipient => {
          switch (recipient.status) {
            case 'delivered':
              acc.delivered++;
              break;
            case 'bounced':
              acc.bounced++;
              break;
            case 'complained':
              acc.complained++;
              break;
            case 'failed':
              acc.failed++;
              break;
            case 'pending':
              acc.pending++;
              break;
          }
        });

        return acc;
      },
      {
        totalEmails: 0,
        totalRecipients: 0,
        delivered: 0,
        bounced: 0,
        complained: 0,
        failed: 0,
        pending: 0,
      },
    );

    return {
      ...stats,
      deliveryRate: stats.totalRecipients > 0 ? (stats.delivered / stats.totalRecipients) * 100 : 0,
      bounceRate: stats.totalRecipients > 0 ? (stats.bounced / stats.totalRecipients) * 100 : 0,
      complaintRate: stats.totalRecipients > 0 ? (stats.complained / stats.totalRecipients) * 100 : 0,
    };
  }

  /**
   * Retry failed deliveries
   */
  async retryFailedDeliveries(emailId: string): Promise<RetryResult> {
    const tracking = this.deliveryStatus.get(emailId);
    if (!tracking) {
      throw new Error(`Tracking not found for email: ${emailId}`);
    }

    const failedRecipients = tracking.recipients.filter(r => 
      r.status === 'failed' || r.status === 'bounced'
    );

    if (failedRecipients.length === 0) {
      return {
        totalRetried: 0,
        successful: 0,
        failed: 0,
      };
    }

    // In a real implementation, this would trigger email resend
    // For now, just update the tracking
    let successful = 0;
    let failed = 0;

    for (const recipient of failedRecipients) {
      try {
        // Simulate retry logic
        await this.simulateRetry(recipient.email);
        this.updateDeliveryStatus(emailId, recipient.email, 'sent', { retry: true });
        successful++;
      } catch (error) {
        this.updateDeliveryStatus(emailId, recipient.email, 'failed', { 
          retry: true, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        failed++;
      }
    }

    this.logger.log(`Retried failed deliveries`, {
      emailId,
      totalRetried: failedRecipients.length,
      successful,
      failed,
    });

    return {
      totalRetried: failedRecipients.length,
      successful,
      failed,
    };
  }

  /**
   * Determine recipient status based on events
   */
  private determineRecipientStatus(events: DeliveryEvent[]): RecipientStatus['status'] {
    if (events.length === 0) {
      return 'pending';
    }

    const latestEvent = events[events.length - 1];
    
    // Priority order for status determination
    if (latestEvent.type === 'complained') return 'complained';
    if (latestEvent.type === 'bounced') return 'bounced';
    if (latestEvent.type === 'failed') return 'failed';
    if (latestEvent.type === 'delivered') return 'delivered';
    if (latestEvent.type === 'sent') return 'sent';
    
    return 'pending';
  }

  /**
   * Determine overall email status
   */
  private determineOverallStatus(recipients: RecipientStatus[]): DeliveryStatus['overallStatus'] {
    if (recipients.every(r => r.status === 'delivered')) {
      return 'delivered';
    }

    if (recipients.some(r => r.status === 'complained')) {
      return 'complained';
    }

    if (recipients.some(r => r.status === 'bounced')) {
      return 'bounced';
    }

    if (recipients.some(r => r.status === 'failed')) {
      return 'failed';
    }

    if (recipients.some(r => r.status === 'sent' || r.status === 'delivered')) {
      return 'partial';
    }

    return 'pending';
  }

  /**
   * Trigger registered callbacks
   */
  private triggerCallbacks(emailId: string, recipientEmail: string, event: DeliveryEvent): void {
    const callbacks = this.trackingCallbacks.get(emailId);
    if (!callbacks) {
      return;
    }

    callbacks.forEach(callback => {
      try {
        callback(recipientEmail, event);
      } catch (error) {
        this.logger.error(`Callback error for email: ${emailId}`, error);
      }
    });
  }

  /**
   * Check if date is in time range
   */
  private isInTimeRange(date: Date, range: TimeRange): boolean {
    return date >= range.start && date <= range.end;
  }

  /**
   * Simulate retry logic (placeholder)
   */
  private async simulateRetry(email: string): Promise<void> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    // Simulate 80% success rate
    if (Math.random() > 0.8) {
      throw new Error('Simulated retry failure');
    }
  }

  /**
   * Start cleanup task
   */
  private startCleanupTask(): void {
    const cleanupInterval = this.configService.get<number>('EMAIL_DELIVERY_TRACKING_CLEANUP_INTERVAL_MS', 3600000); // 1 hour
    
    setInterval(() => {
      this.cleanupOldTracking();
    }, cleanupInterval).unref?.();
  }

  /**
   * Clean up old tracking data
   */
  private cleanupOldTracking(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [emailId, tracking] of this.deliveryStatus.entries()) {
      if (now - tracking.createdAt.getTime() > this.maxTrackingAge) {
        this.deliveryStatus.delete(emailId);
        this.trackingCallbacks.delete(emailId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old delivery tracking entries`);
    }
  }
}

// Type definitions
interface DeliveryStatus {
  emailId: string;
  provider: string;
  recipients: RecipientStatus[];
  createdAt: Date;
  updatedAt: Date;
  overallStatus: 'pending' | 'sent' | 'partial' | 'delivered' | 'failed' | 'bounced' | 'complained';
}

interface RecipientStatus {
  email: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained';
  events: DeliveryEvent[];
}

interface DeliveryEvent {
  type: 'sent' | 'delivered' | 'failed' | 'bounced' | 'complained';
  timestamp: Date;
  metadata: any;
}

interface TrackingCallback {
  (recipientEmail: string, event: DeliveryEvent): void;
}

interface DeliveryStats {
  totalEmails: number;
  totalRecipients: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  pending: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
}

interface RetryResult {
  totalRetried: number;
  successful: number;
  failed: number;
}

interface TimeRange {
  start: Date;
  end: Date;
}
