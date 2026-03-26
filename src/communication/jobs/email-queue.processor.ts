import { OnQueueActive, OnQueueCompleted, OnQueueFailed, OnQueueStalled, Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { EmailQueueService } from '../email/email.queue';
import { BackgroundJobMonitoringService, JobQueueName } from './background-job-monitoring.service';

abstract class BaseEmailQueueProcessor {
  protected constructor(
    private readonly queueName: JobQueueName,
    protected readonly emailQueueService: EmailQueueService,
    protected readonly jobMonitoringService: BackgroundJobMonitoringService,
  ) {}

  async process(job: Job<any>) {
    return this.emailQueueService.processEmailJob(job);
  }

  async onActive(job: Job<any>) {
    await this.jobMonitoringService.recordQueueEvent(this.queueName, 'active', job);
  }

  async onCompleted(job: Job<any>, result: unknown) {
    await this.jobMonitoringService.recordQueueEvent(this.queueName, 'completed', job, {
      metadata: {
        result: result as Record<string, unknown>,
      },
    });
  }

  async onFailed(job: Job<any>, error: Error) {
    await this.jobMonitoringService.recordQueueEvent(this.queueName, 'failed', job, {
      message: error.message,
      metadata: {
        stack: error.stack,
      },
    });
  }

  async onStalled(job: Job<any>) {
    await this.jobMonitoringService.recordQueueEvent(this.queueName, 'stalled', job);
  }
}

@Processor('email')
export class DefaultEmailQueueProcessor extends BaseEmailQueueProcessor {
  constructor(emailQueueService: EmailQueueService, jobMonitoringService: BackgroundJobMonitoringService) {
    super('default', emailQueueService, jobMonitoringService);
  }

  @Process()
  async handle(job: Job<any>) {
    return this.process(job);
  }

  @OnQueueActive()
  async handleActive(job: Job<any>) {
    await this.onActive(job);
  }

  @OnQueueCompleted()
  async handleCompleted(job: Job<any>, result: unknown) {
    await this.onCompleted(job, result);
  }

  @OnQueueFailed()
  async handleFailed(job: Job<any>, error: Error) {
    await this.onFailed(job, error);
  }

  @OnQueueStalled()
  async handleStalled(job: Job<any>) {
    await this.onStalled(job);
  }
}

@Processor('email-priority')
export class PriorityEmailQueueProcessor extends BaseEmailQueueProcessor {
  constructor(emailQueueService: EmailQueueService, jobMonitoringService: BackgroundJobMonitoringService) {
    super('priority', emailQueueService, jobMonitoringService);
  }

  @Process()
  async handle(job: Job<any>) {
    return this.process(job);
  }

  @OnQueueActive()
  async handleActive(job: Job<any>) {
    await this.onActive(job);
  }

  @OnQueueCompleted()
  async handleCompleted(job: Job<any>, result: unknown) {
    await this.onCompleted(job, result);
  }

  @OnQueueFailed()
  async handleFailed(job: Job<any>, error: Error) {
    await this.onFailed(job, error);
  }

  @OnQueueStalled()
  async handleStalled(job: Job<any>) {
    await this.onStalled(job);
  }
}

@Processor('email-batch')
export class BatchEmailQueueProcessor extends BaseEmailQueueProcessor {
  constructor(emailQueueService: EmailQueueService, jobMonitoringService: BackgroundJobMonitoringService) {
    super('batch', emailQueueService, jobMonitoringService);
  }

  @Process()
  async handle(job: Job<any>) {
    return this.process(job);
  }

  @OnQueueActive()
  async handleActive(job: Job<any>) {
    await this.onActive(job);
  }

  @OnQueueCompleted()
  async handleCompleted(job: Job<any>, result: unknown) {
    await this.onCompleted(job, result);
  }

  @OnQueueFailed()
  async handleFailed(job: Job<any>, error: Error) {
    await this.onFailed(job, error);
  }

  @OnQueueStalled()
  async handleStalled(job: Job<any>) {
    await this.onStalled(job);
  }
}
