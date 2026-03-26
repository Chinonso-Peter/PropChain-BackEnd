import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';

// Email Services
import { EmailTemplateService } from './email/email.template';
import { EmailService } from './email/email.service';
import { EmailAnalyticsService } from './email/email.analytics';
import { EmailQueueService } from './email/email.queue';

// Multi-channel Services
import { MultichannelService } from './multichannel/multichannel.service';

// Preference Services
import { PreferenceService } from './preferences/preference.service';

// Automation Services
import { WorkflowService } from './automation/workflow.service';

// Deliverability Services
import { DeliverabilityService } from './deliverability/deliverability.service';
import { BackgroundJobMonitoringService } from './jobs/background-job-monitoring.service';
import {
  BatchEmailQueueProcessor,
  DefaultEmailQueueProcessor,
  PriorityEmailQueueProcessor,
} from './jobs/email-queue.processor';
import { BackgroundJobsController } from './jobs/background-jobs.controller';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      {
        name: 'email',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      },
      {
        name: 'email-batch',
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 2000,
          },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      },
      {
        name: 'email-priority',
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 500,
          },
          removeOnComplete: 150,
          removeOnFail: 75,
        },
      },
    ),
  ],
  providers: [
    // Email Services
    EmailTemplateService,
    EmailService,
    EmailAnalyticsService,
    EmailQueueService,

    // Multi-channel Services
    MultichannelService,

    // Preference Services
    PreferenceService,

    // Automation Services
    WorkflowService,

    // Deliverability Services
    DeliverabilityService,

    // Background job monitoring
    BackgroundJobMonitoringService,
    DefaultEmailQueueProcessor,
    PriorityEmailQueueProcessor,
    BatchEmailQueueProcessor,
  ],
  controllers: [BackgroundJobsController],
  exports: [
    // Email Services
    EmailTemplateService,
    EmailService,
    EmailAnalyticsService,
    EmailQueueService,

    // Multi-channel Services
    MultichannelService,

    // Preference Services
    PreferenceService,

    // Automation Services
    WorkflowService,

    // Deliverability Services
    DeliverabilityService,

    // Background job monitoring
    BackgroundJobMonitoringService,
  ],
})
export class CommunicationModule {}
