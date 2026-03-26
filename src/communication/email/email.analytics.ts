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
   * Track email delivery event
   */
  async trackEmailDelivery(emailId: string, deliveryData: EmailDeliveryEvent): Promise<void> {
    const key = `email:${emailId}`;
    const existing = this.analytics.get(key);

    if (!existing) {
      this.logger.warn(`Received delivery event for unknown email: ${emailId}`);
      return;
    }

    existing.events.push({
      type: 'delivered',
      timestamp: new Date(),
      data: deliveryData,
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
  }

  /**
   * Track email open event
   */
  async trackEmailOpen(emailId: string, openData: EmailOpenEvent): Promise<void> {
    const key = `email:${emailId}`;
    const existing = this.analytics.get(key);

    if (!existing) {
      this.logger.warn(`Received open event for unknown email: ${emailId}`);
      return;
    }

    existing.events.push({
      type: 'opened',
      timestamp: new Date(),
      data: openData,
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
  }

  /**
   * Track email click event
   */
  async trackEmailClick(emailId: string, clickData: EmailClickEvent): Promise<void> {
    const key = `email:${emailId}`;
    const existing = this.analytics.get(key);

    if (!existing) {
      this.logger.warn(`Received click event for unknown email: ${emailId}`);
      return;
    }

    existing.events.push({
      type: 'clicked',
      timestamp: new Date(),
      data: clickData,
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
  }

  /**
   * Track email bounce event
   */
  async trackEmailBounce(emailId: string, bounceData: EmailBounceEvent): Promise<void> {
    const key = `email:${emailId}`;
    const existing = this.analytics.get(key);

    if (!existing) {
      this.logger.warn(`Received bounce event for unknown email: ${emailId}`);
      return;
    }

    existing.events.push({
      type: 'bounced',
      timestamp: new Date(),
      data: bounceData,
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
  }

  /**
   * Track email complaint event
   */
  async trackEmailComplaint(emailId: string, complaintData: EmailComplaintEvent): Promise<void> {
    const key = `email:${emailId}`;
    const existing = this.analytics.get(key);

    if (!existing) {
      this.logger.warn(`Received complaint event for unknown email: ${emailId}`);
      return;
    }

    existing.events.push({
      type: 'complained',
      timestamp: new Date(),
      data: complaintData,
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
  }

  /**
   * Track email unsubscribe event
   */
  async trackEmailUnsubscribe(emailId: string, unsubscribeData: EmailUnsubscribeEvent): Promise<void> {
    const key = `email:${emailId}`;
    const existing = this.analytics.get(key);

    if (!existing) {
      this.logger.warn(`Received unsubscribe event for unknown email: ${emailId}`);
      return;
    }

    existing.events.push({
      type: 'unsubscribed',
      timestamp: new Date(),
      data: unsubscribeData,
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
  }

  /**
   * Track batch email event
   */
  async trackBatchEmail(data: BatchEmailEvent): Promise<void> {
    const key = `batch:${data.batchId}`;
    const existing = this.analytics.get(key) || {
      batchId: data.batchId,
      startedAt: new Date(),
      sentAt: new Date(),
      events: [],
    };

    existing.events.push({
      type: 'batch_completed',
      timestamp: new Date(),
      data: {
        totalEmails: data.totalEmails,
        successCount: data.successCount,
        failureCount: data.failureCount,
        totalTime: data.totalTime,
        averageTime: data.totalTime / data.totalEmails,
      },
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
  }

  /**
   * Get email analytics
   */
  async getEmailAnalytics(emailId: string): Promise<EmailAnalytics | null> {
    return this.analytics.get(`email:${emailId}`) || null;
  }

  /**
   * Get batch analytics
   */
  async getBatchAnalytics(batchId: string): Promise<BatchAnalytics | null> {
    const analytics = this.analytics.get(`batch:${batchId}`);
    if (!analytics) {
      return null;
    }

    const batchEvents = analytics.events.filter(e => e.type === 'batch_completed');
    const latestEvent = batchEvents[batchEvents.length - 1];

    return latestEvent ? (latestEvent.data as any) : null;
  }

  /**
   * Get template performance analytics
   */
  async getTemplatePerformance(templateName: string, timeRange?: TimeRange): Promise<TemplatePerformance> {
    const allAnalytics = Array.from(this.analytics.values());
    const filteredAnalytics = timeRange
      ? allAnalytics.filter(a => this.isInTimeRange(a.sentAt, timeRange))
      : allAnalytics;

    const templateEmails = filteredAnalytics.filter(a => a.templateName === templateName);

    if (templateEmails.length === 0) {
      return {
        templateName,
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalComplained: 0,
        deliveryRate: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0,
        complaintRate: 0,
      };
    }

    const metrics = templateEmails.reduce(
      (acc, email) => {
        const events = email.events;

        acc.totalSent++;
        acc.totalDelivered += events.filter(e => e.type === 'delivered').length;
        acc.totalOpened += events.filter(e => e.type === 'opened').length;
        acc.totalClicked += events.filter(e => e.type === 'clicked').length;
        acc.totalBounced += events.filter(e => e.type === 'bounced').length;
        acc.totalComplained += events.filter(e => e.type === 'complained').length;

        return acc;
      },
      {
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalComplained: 0,
      },
    );

    return {
      templateName,
      ...metrics,
      deliveryRate: metrics.totalSent > 0 ? (metrics.totalDelivered / metrics.totalSent) * 100 : 0,
      openRate: metrics.totalDelivered > 0 ? (metrics.totalOpened / metrics.totalDelivered) * 100 : 0,
      clickRate: metrics.totalOpened > 0 ? (metrics.totalClicked / metrics.totalOpened) * 100 : 0,
      bounceRate: metrics.totalSent > 0 ? (metrics.totalBounced / metrics.totalSent) * 100 : 0,
      complaintRate: metrics.totalSent > 0 ? (metrics.totalComplained / metrics.totalSent) * 100 : 0,
    };
  }

  /**
   * Get overall email statistics
   */
  async getOverallStatistics(timeRange?: TimeRange): Promise<OverallEmailStatistics> {
    const allAnalytics = Array.from(this.analytics.values());
    const filteredAnalytics = timeRange
      ? allAnalytics.filter(a => this.isInTimeRange(a.sentAt, timeRange))
      : allAnalytics;

    const stats = filteredAnalytics.reduce(
      (acc, email) => {
        const events = email.events;

        acc.totalSent++;
        acc.totalDelivered += events.filter(e => e.type === 'delivered').length;
        acc.totalOpened += events.filter(e => e.type === 'opened').length;
        acc.totalClicked += events.filter(e => e.type === 'clicked').length;
        acc.totalBounced += events.filter(e => e.type === 'bounced').length;
        acc.totalComplained += events.filter(e => e.type === 'complained').length;

        // Calculate delivery times
        const sentEvent = events.find(e => e.type === 'sent');
        const deliveredEvent = events.find(e => e.type === 'delivered');

        if (sentEvent && deliveredEvent && sentEvent.data?.deliveryTime) {
          acc.totalDeliveryTime += sentEvent.data.deliveryTime;
          acc.deliveryTimeCount++;
        }

        return acc;
      },
      {
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalComplained: 0,
        totalDeliveryTime: 0,
        deliveryTimeCount: 0,
      },
    );

    return {
      ...stats,
      averageDeliveryTime: stats.deliveryTimeCount > 0 ? stats.totalDeliveryTime / stats.deliveryTimeCount : 0,
      deliveryRate: stats.totalSent > 0 ? (stats.totalDelivered / stats.totalSent) * 100 : 0,
      openRate: stats.totalDelivered > 0 ? (stats.totalOpened / stats.totalDelivered) * 100 : 0,
      clickRate: stats.totalOpened > 0 ? (stats.totalClicked / stats.totalOpened) * 100 : 0,
      bounceRate: stats.totalSent > 0 ? (stats.totalBounced / stats.totalSent) * 100 : 0,
      complaintRate: stats.totalSent > 0 ? (stats.totalComplained / stats.totalSent) * 100 : 0,
    };
  }

  /**
   * Get A/B test results
   */
  async getABTestResults(testId: string): Promise<ABTestResults> {
    const allAnalytics = Array.from(this.analytics.values());
    const testEmails = allAnalytics.filter(a => a.events.some(e => e.data?.abTestVariant));

    const results = testEmails.reduce(
      (acc, email) => {
        const sentEvent = email.events.find(e => e.type === 'sent');
        const variant = sentEvent?.data?.abTestVariant || 'control';

        if (!acc[variant]) {
          acc[variant] = {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
          };
        }

        acc[variant].sent++;
        acc[variant].delivered += email.events.filter(e => e.type === 'delivered').length;
        acc[variant].opened += email.events.filter(e => e.type === 'opened').length;
        acc[variant].clicked += email.events.filter(e => e.type === 'clicked').length;

        return acc;
      },
      {} as Record<string, ABTestVariant>,
    );

    return {
      testId,
      variants: results,
      winner: this.determineABTestWinner(results),
    };
  }

  /**
   * Generate tracking pixel for email opens
   */
  generateTrackingPixel(emailId: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL');
    return `<img src="${baseUrl}/api/email/track/open/${emailId}" width="1" height="1" style="display:none;" />`;
  }

  /**
   * Generate tracking URL for email clicks
   */
  generateTrackingUrl(emailId: string, url: string, linkId?: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL');
    const params = new URLSearchParams({
      emailId,
      url: encodeURIComponent(url),
    });

    if (linkId) {
      params.set('linkId', linkId);
    }

    return `${baseUrl}/api/email/track/click?${params.toString()}`;
  }

  /**
   * Persist analytics to storage
   */
  private async persistAnalytics(key: string, analytics: EmailAnalytics): Promise<void> {
    // In production, this would persist to database
    // For now, just log
    this.logger.debug(`Persisting analytics for ${key}`, {
      eventsCount: analytics.events.length,
    });
  }

  /**
   * Check if date is in time range
   */
  private isInTimeRange(date: Date, range: TimeRange): boolean {
    return date >= range.start && date <= range.end;
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

interface EmailAnalytics {
  emailId?: string;
  batchId?: string;
  templateName?: string;
  sentAt: Date;
  events: EmailEvent[];
}
}

interface EmailEvent {
  type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed' | 'batch_completed';
  timestamp: Date;
  data: any;
}

interface EmailSentEvent {
  emailId: string;
  templateName?: string;
  recipientCount: number;
  provider: string;
  deliveryTime: number;
  success: boolean;
  error?: string;
  abTestVariant?: 'A' | 'B' | 'control';
}

interface EmailDeliveryEvent {
  timestamp: string;
  provider: string;
  response: string;
  ip: string;
}

interface EmailOpenEvent {
  timestamp: string;
  ip: string;
  userAgent: string;
  location?: {
    country: string;
    city: string;
  };
}

interface EmailClickEvent {
  timestamp: string;
  ip: string;
  userAgent: string;
  linkId?: string;
  url: string;
  location?: {
    country: string;
    city: string;
  };
}

interface EmailBounceEvent {
  timestamp: string;
  reason: string;
  type: 'hard' | 'soft';
  provider: string;
}

interface EmailComplaintEvent {
  timestamp: string;
  reason: string;
  type: 'spam' | 'abuse';
  provider: string;
}

interface EmailUnsubscribeEvent {
  timestamp: string;
  reason?: string;
  ip: string;
  userAgent: string;
}

interface BatchEmailEvent {
  batchId: string;
  totalEmails: number;
  successCount: number;
  failureCount: number;
  totalTime: number;
}

interface BatchAnalytics {
  batchId: string;
  totalEmails: number;
  successCount: number;
  failureCount: number;
  totalTime: number;
  averageTime: number;
}

interface TemplatePerformance {
  templateName: string;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalComplained: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}

interface OverallEmailStatistics {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalComplained: number;
  totalDeliveryTime: number;
  deliveryTimeCount: number;
  averageDeliveryTime: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}

interface TimeRange {
  start: Date;
  end: Date;
}

interface ABTestResults {
  testId: string;
  variants: Record<string, ABTestVariant>;
  winner: string;
}

interface ABTestVariant {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}
