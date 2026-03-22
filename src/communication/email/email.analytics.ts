import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Email Analytics Service
 *
 * Tracks email delivery, engagement, and performance metrics
 */
@Injectable()
export class EmailAnalyticsService {
  private readonly logger = new Logger(EmailAnalyticsService.name);
  private analytics: Map<string, EmailAnalytics> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Track email sent event
   */
  async trackEmailSent(data: EmailSentEvent): Promise<void> {
    const key = `email:${data.emailId}`;
    const existing = this.analytics.get(key) || {
      emailId: data.emailId,
      templateName: data.templateName,
      sentAt: new Date(),
      events: [],
    };

    existing.events.push({
      type: 'sent',
      timestamp: new Date(),
      data: {
        recipientCount: data.recipientCount,
        provider: data.provider,
        deliveryTime: data.deliveryTime,
        success: data.success,
        error: data.error,
      },
    });

    this.analytics.set(key, existing);
    await this.persistAnalytics(key, existing);
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
   * Determine A/B test winner
   */
  private determineABTestWinner(results: Record<string, ABTestVariant>): string {
    let winner = 'control';
    let bestScore = 0;

    Object.entries(results).forEach(([variant, data]) => {
      // Calculate score based on open rate and click rate
      const openRate = data.delivered > 0 ? (data.opened / data.delivered) * 100 : 0;
      const clickRate = data.opened > 0 ? (data.clicked / data.opened) * 100 : 0;
      const score = openRate * 0.6 + clickRate * 0.4; // Weighted score

      if (score > bestScore) {
        bestScore = score;
        winner = variant;
      }
    });

    return winner;
  }
}

// Type definitions
interface EmailAnalytics {
  emailId?: string;
  batchId?: string;
  templateName?: string;
  sentAt: Date;
  events: EmailEvent[];
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
