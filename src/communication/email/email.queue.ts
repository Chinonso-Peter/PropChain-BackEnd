import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bull from 'bull';
import { getQueueToken } from '@nestjs/bull';

/**
 * Email Queue Service
 *
 * Handles email queuing, scheduling, and batch processing
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);
  private emailQueue: Bull.Queue;
  private batchQueue: Bull.Queue;
  private priorityQueue: Bull.Queue;

  constructor(private readonly configService: ConfigService) {
    this.initializeQueues();
  }

  /**
   * Add email to queue
   */
  async add<T = any>(queueName: string, data: T, options?: any): Promise<string> {
    const queue = this.getQueue(queueName);

    try {
      const job = await queue.add(data, {
        attempts: options?.attempts || 3,
        backoff: options?.backoff || 'exponential',
        delay: options?.delay || 0,
        priority: options?.priority || 0,
        removeOnComplete: options?.removeOnComplete !== false,
        removeOnFail: options?.removeOnFail !== false,
      });

      this.logger.log(`Added job to ${queueName} queue`, {
        jobId: job.id,
        queueName,
        data: typeof data === 'object' ? Object.keys(data) : data,
      });

      return job.id?.toString() || '';
    } catch (error) {
      this.logger.error(`Failed to add job to ${queueName} queue`, error);
      throw error;
    }
  }

  /**
   * Add high priority email
   */
  async addHighPriority(emailData: any): Promise<string> {
    return this.add('priority', emailData, {
      priority: 10,
      attempts: 5,
    });
  }

  /**
   * Add scheduled email
   */
  async addScheduled(emailData: any, scheduledFor: Date): Promise<string> {
    const delay = scheduledFor.getTime() - Date.now();

    if (delay <= 0) {
      return this.add('default', emailData);
    }

    return this.add('default', emailData, {
      delay,
      attempts: 3,
    });
  }

  /**
   * Add batch email job
   */
  async addBatch(batchData: BatchEmailJobData): Promise<string> {
    return this.add('batch', batchData, {
      attempts: 2,
      backoff: 'fixed',
      delay: 0,
    });
  }

  /**
   * Process email job
   */
  async processEmailJob(job: any): Promise<EmailJobResult> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing email job`, {
        jobId: job.id,
        type: job.data.type,
      });

      let result: EmailJobResult;

      switch (job.data.type) {
        case 'single':
          result = await this.processSingleEmail(job.data);
          break;
        case 'batch':
          result = await this.processBatchEmail(job.data);
          break;
        case 'scheduled':
          result = await this.processScheduledEmail(job.data);
          break;
        default:
          throw new Error(`Unknown job type: ${job.data.type}`);
      }

      const processingTime = Date.now() - startTime;

      this.logger.log(`Email job completed successfully`, {
        jobId: job.id,
        processingTime,
        result: result.success ? 'success' : 'failed',
      });

      return {
        ...result,
        processingTime,
        jobId: job.id,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(`Email job failed`, errorMessage, {
        jobId: job.id,
        processingTime,
      });

      return {
        success: false,
        error: errorMessage,
        processingTime,
        jobId: job.id,
      };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<QueueStats> {
    const queue = this.getQueue(queueName);

    try {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      return {
        queueName,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue stats for ${queueName}`, error);
      return {
        queueName,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        total: 0,
      };
    }
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<AllQueueStats> {
    const [defaultStats, priorityStats, batchStats] = await Promise.all([
      this.getQueueStats('default'),
      this.getQueueStats('priority'),
      this.getQueueStats('batch'),
    ]);

    return {
      default: defaultStats,
      priority: priorityStats,
      batch: batchStats,
      total: {
        queueName: 'total',
        waiting: defaultStats.waiting + priorityStats.waiting + batchStats.waiting,
        active: defaultStats.active + priorityStats.active + batchStats.active,
        completed: defaultStats.completed + priorityStats.completed + batchStats.completed,
        failed: defaultStats.failed + priorityStats.failed + batchStats.failed,
        total: defaultStats.total + priorityStats.total + batchStats.total,
      },
    };
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    this.logger.log(`Paused ${queueName} queue`);
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    this.logger.log(`Resumed ${queueName} queue`);
  }

  /**
   * Clear queue
   */
  async clearQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.clean(0, 'completed');
    await queue.clean(0, 'failed');
    this.logger.log(`Cleared ${queueName} queue`);
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(queueName: string): Promise<number> {
    const queue = this.getQueue(queueName);
    const failed = await queue.getFailed();

    let retryCount = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retryCount++;
      } catch (error) {
        this.logger.error(`Failed to retry job ${job.id}`, error);
      }
    }

    this.logger.log(`Retried ${retryCount} failed jobs in ${queueName} queue`);
    return retryCount;
  }

  /**
   * Get job by ID
   */
  async getJob(queueName: string, jobId: string): Promise<any> {
    const queue = this.getQueue(queueName);
    return await queue.getJob(jobId);
  }

  /**
   * Remove job
   */
  async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.getQueue(queueName);

    try {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.log(`Removed job ${jobId} from ${queueName} queue`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to remove job ${jobId} from ${queueName} queue`, error);
      return false;
    }
  }

  /**
   * Process single email job
   */
  private async processSingleEmail(jobData: SingleEmailJobData): Promise<EmailJobResult> {
    // This would integrate with EmailService
    // For now, simulate processing
    await this.delay(Math.random() * 1000 + 500); // 500-1500ms

    return {
      success: true,
      emailId: this.generateEmailId(),
      provider: 'smtp',
      messageId: `msg_${Date.now()}`,
    };
  }

  /**
   * Process batch email job
   */
  private async processBatchEmail(jobData: BatchEmailJobData): Promise<EmailJobResult> {
    const { emails, options } = jobData;
    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const email of emails) {
      try {
        // Process each email with rate limiting
        const result = await this.processSingleEmail({ type: 'single', data: email });
        results.push(result);

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }

        // Rate limiting between batch sends
        if (options?.rateLimit) {
          await this.delay(options.rateLimit);
        }
      } catch (error) {
        failureCount++;
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: true,
      batchId: this.generateBatchId(),
      results,
      successCount,
      failureCount,
    };
  }

  /**
   * Process scheduled email job
   */
  private async processScheduledEmail(jobData: ScheduledEmailJobData): Promise<EmailJobResult> {
    // Check if still scheduled for future
    if (jobData.scheduledFor && jobData.scheduledFor > new Date()) {
      // Reschedule if still in future
      const delay = jobData.scheduledFor.getTime() - Date.now();
      await this.add('default', jobData.data, { delay });

      return {
        success: true,
        rescheduled: true,
        newJobId: 'rescheduled',
      };
    }

    // Process the email
    return await this.processSingleEmail(jobData.data);
  }

  /**
   * Get queue by name
   */
  private getQueue(queueName: string): Bull.Queue {
    switch (queueName) {
      case 'priority':
        return this.priorityQueue;
      case 'batch':
        return this.batchQueue;
      default:
        return this.emailQueue;
    }
  }

  /**
   * Initialize queues
   */
  private initializeQueues(): void {
    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
    };

    // Default email queue
    this.emailQueue = new Bull('email', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    // High priority queue
    this.priorityQueue = new Bull('email-priority', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    // Batch email queue
    this.batchQueue = new Bull('email-batch', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    // Set up processors
    this.emailQueue.process(5, this.processEmailJob.bind(this));
    this.priorityQueue.process(2, this.processEmailJob.bind(this));
    this.batchQueue.process(1, this.processEmailJob.bind(this));

    // Set up event listeners
    this.setupEventListeners();

    this.logger.log('Email queues initialized successfully');
  }

  /**
   * Set up queue event listeners
   */
  private setupEventListeners(): void {
    // Default queue events
    this.emailQueue.on('completed', (job, result) => {
      this.logger.debug(`Email job completed`, {
        jobId: job.id,
        result,
      });
    });

    this.emailQueue.on('failed', (job, error) => {
      this.logger.error(`Email job failed`, error, {
        jobId: job.id,
        data: job.data,
      });
    });

    this.emailQueue.on('stalled', job => {
      this.logger.warn(`Email job stalled`, {
        jobId: job.id,
        data: job.data,
      });
    });

    // Priority queue events
    this.priorityQueue.on('completed', (job, result) => {
      this.logger.debug(`Priority email job completed`, {
        jobId: job.id,
        result,
      });
    });

    this.priorityQueue.on('failed', (job, error) => {
      this.logger.error(`Priority email job failed`, error, {
        jobId: job.id,
        data: job.data,
      });
    });

    // Batch queue events
    this.batchQueue.on('completed', (job, result) => {
      this.logger.debug(`Batch email job completed`, {
        jobId: job.id,
        result,
      });
    });

    this.batchQueue.on('failed', (job, error) => {
      this.logger.error(`Batch email job failed`, error, {
        jobId: job.id,
        data: job.data,
      });
    });
  }

  /**
   * Generate email ID
   */
  private generateEmailId(): string {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing email queues...');

    await Promise.all([this.emailQueue.close(), this.priorityQueue.close(), this.batchQueue.close()]);

    this.logger.log('Email queues closed successfully');
  }
}

// Type definitions
interface EmailJobResult {
  success: boolean;
  emailId?: string;
  provider?: string;
  messageId?: string;
  batchId?: string;
  results?: any[];
  successCount?: number;
  failureCount?: number;
  error?: string;
  processingTime?: number;
  jobId?: string;
  rescheduled?: boolean;
  newJobId?: string;
}

interface SingleEmailJobData {
  type: 'single';
  data: any;
}

interface BatchEmailJobData {
  type: 'batch';
  emails: any[];
  options?: {
    rateLimit?: number;
    maxConcurrency?: number;
  };
}

interface ScheduledEmailJobData {
  type: 'scheduled';
  data: SingleEmailJobData;
  scheduledFor: Date;
}

interface QueueStats {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

interface AllQueueStats {
  default: QueueStats;
  priority: QueueStats;
  batch: QueueStats;
  total: QueueStats;
}
