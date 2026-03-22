import { Module } from '@nestjs/common';
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

@Module({
  imports: [ConfigModule],
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
  ],
  controllers: [
    // Controllers will be added separately
  ],
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
  ],
})
export class CommunicationModule {}
