import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailService } from '../email/email.service';
import { MultichannelService } from '../multichannel/multichannel.service';
import { PreferenceService } from '../preferences/preference.service';

/**
 * Email Automation and Workflow Service
 *
 * Handles automated email workflows and triggers
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);
  private workflows: Map<string, Workflow> = new Map();
  private triggers: Map<string, Trigger[]> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly multichannelService: MultichannelService,
    private readonly preferenceService: PreferenceService,
  ) {
    this.initializeWorkflows();
    this.initializeTriggers();
  }

  /**
   * Execute workflow by ID
   */
  async executeWorkflow(workflowId: string, context: WorkflowContext): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    this.logger.log(`Executing workflow: ${workflowId}`, {
      userId: context.userId,
      trigger: context.trigger,
    });

    const startTime = Date.now();
    const results: StepResult[] = [];

    try {
      // Execute workflow steps
      for (const step of workflow.steps) {
        const stepResult = await this.executeStep(step, context);
        results.push(stepResult);

        // Check if step failed and workflow should stop
        if (!stepResult.success && step.stopOnFailure) {
          break;
        }

        // Update context with step results
        context = { ...context, ...stepResult.context };
      }

      const executionTime = Date.now() - startTime;

      // Log workflow execution
      await this.logWorkflowExecution(workflowId, context.userId, {
        success: true,
        executionTime,
        steps: results,
      });

      return {
        workflowId,
        success: true,
        executionTime,
        steps: results,
        context,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log workflow failure
      await this.logWorkflowExecution(workflowId, context.userId, {
        success: false,
        executionTime,
        error: errorMessage,
      });

      return {
        workflowId,
        success: false,
        executionTime,
        error: errorMessage,
        steps: results,
        context,
      };
    }
  }

  /**
   * Trigger workflows based on event
   */
  async triggerWorkflows(event: WorkflowEvent): Promise<TriggerResult[]> {
    const applicableTriggers = this.findTriggersForEvent(event);
    const results: TriggerResult[] = [];

    for (const trigger of applicableTriggers) {
      try {
        const shouldExecute = await this.evaluateTriggerCondition(trigger, event);

        if (shouldExecute) {
          // Build workflow context
          const context: WorkflowContext = {
            userId: event.userId,
            trigger: trigger.id,
            event,
            data: { ...event.data, ...trigger.context },
          };

          // Execute workflow
          const workflowResult = await this.executeWorkflow(trigger.workflowId, context);

          results.push({
            triggerId: trigger.id,
            workflowId: trigger.workflowId,
            success: workflowResult.success,
            executionTime: workflowResult.executionTime,
          });

          this.logger.log(`Triggered workflow: ${trigger.workflowId}`, {
            triggerId: trigger.id,
            userId: event.userId,
            success: workflowResult.success,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        results.push({
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          success: false,
          error: errorMessage,
        });

        this.logger.error(`Failed to trigger workflow: ${trigger.workflowId}`, errorMessage, {
          triggerId: trigger.id,
          userId: event.userId,
        });
      }
    }

    return results;
  }

  /**
   * Create custom workflow
   */
  async createWorkflow(workflow: CreateWorkflowRequest): Promise<Workflow> {
    const newWorkflow: Workflow = {
      id: this.generateWorkflowId(),
      name: workflow.name,
      description: workflow.description,
      enabled: workflow.enabled !== false,
      steps: workflow.steps,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };

    this.workflows.set(newWorkflow.id, newWorkflow);

    this.logger.log(`Created workflow: ${newWorkflow.id}`, {
      name: newWorkflow.name,
      stepsCount: newWorkflow.steps.length,
    });

    return newWorkflow;
  }

  /**
   * Update workflow
   */
  async updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<Workflow> {
    const existing = this.workflows.get(workflowId);

    if (!existing) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const updated: Workflow = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
      version: existing.version + 1,
    };

    this.workflows.set(workflowId, updated);

    this.logger.log(`Updated workflow: ${workflowId}`, {
      name: updated.name,
      updatedFields: Object.keys(updates),
    });

    return updated;
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    const deleted = this.workflows.delete(workflowId);

    if (deleted) {
      this.logger.log(`Deleted workflow: ${workflowId}`);
    } else {
      this.logger.warn(`Workflow not found for deletion: ${workflowId}`);
    }
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * List all workflows
   */
  async listWorkflows(filters?: WorkflowFilters): Promise<Workflow[]> {
    let workflows = Array.from(this.workflows.values());

    // Apply filters
    if (filters) {
      if (filters.enabled !== undefined) {
        workflows = workflows.filter(w => w.enabled === filters.enabled);
      }

      if (filters.name) {
        const nameFilter = filters.name.toLowerCase();
        workflows = workflows.filter(w => w.name.toLowerCase().includes(nameFilter));
      }

      if (filters.category) {
        workflows = workflows.filter(w => w.category === filters.category);
      }
    }

    return workflows;
  }

  /**
   * Get workflow execution history
   */
  async getWorkflowHistory(workflowId?: string, userId?: string, timeRange?: TimeRange): Promise<WorkflowExecution[]> {
    // This would query database
    // For now, return mock data
    return [
      {
        id: 'exec_1',
        workflowId: workflowId || 'welcome_series',
        userId: userId || 'user_123',
        trigger: 'user_registered',
        success: true,
        executionTime: 2500,
        steps: [
          {
            stepId: 'send_welcome_email',
            type: 'email',
            success: true,
            executionTime: 1200,
            context: {},
          },
        ],
        executedAt: new Date(),
      },
    ];
  }

  /**
   * Execute workflow step
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now();

    try {
      this.logger.log(`Executing step: ${step.id}`, {
        stepType: step.type,
      });

      let result: any;

      switch (step.type) {
        case 'send_email':
          result = await this.executeEmailStep(step, context);
          break;

        case 'send_sms':
          result = await this.executeSMSStep(step, context);
          break;

        case 'send_push':
          result = await this.executePushStep(step, context);
          break;

        case 'delay':
          result = await this.executeDelayStep(step, context);
          break;

        case 'condition':
          result = await this.executeConditionStep(step, context);
          break;

        case 'webhook':
          result = await this.executeWebhookStep(step, context);
          break;

        case 'script':
          result = await this.executeScriptStep(step, context);
          break;

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        stepId: step.id,
        type: step.type,
        success: true,
        executionTime,
        result,
        context: result.context || {},
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        stepId: step.id,
        type: step.type,
        success: false,
        executionTime,
        error: errorMessage,
        context: {},
      };
    }
  }

  /**
   * Execute email step
   */
  private async executeEmailStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const templateData = this.resolveTemplateData(step.config.templateData, context);

    const result = await this.emailService.sendTemplatedEmail(
      step.config.to || context.userId,
      step.config.templateName,
      templateData,
      {
        priority: step.config.priority,
        attachments: step.config.attachments,
      },
    );

    return {
      emailId: result.emailId,
      messageId: result.messageId,
      status: result.status,
    };
  }

  /**
   * Execute SMS step
   */
  private async executeSMSStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const message = this.resolveTemplateData(step.config.message, context);

    const result = await this.multichannelService.sendSMS(step.config.to || context.userId, message, {
      priority: step.config.priority,
    });

    return {
      messageId: result.messageId,
      status: result.status,
      cost: result.cost,
    };
  }

  /**
   * Execute push notification step
   */
  private async executePushStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const notification = this.resolveTemplateData(step.config.notification, context);

    const result = await this.multichannelService.sendPushNotification(context.userId, notification, {
      priority: step.config.priority,
    });

    return {
      messageId: result.messageId,
      status: result.status,
      deviceCount: result.deviceCount,
    };
  }

  /**
   * Execute delay step
   */
  private async executeDelayStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const delay = this.resolveTemplateData(step.config.duration, context);
    const delayMs = typeof delay === 'number' ? delay : this.parseDuration(delay);

    await this.delay(delayMs);

    return {
      delayed: true,
      duration: delayMs,
    };
  }

  /**
   * Execute condition step
   */
  private async executeConditionStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const condition = this.resolveTemplateData(step.config.condition, context);
    const result = this.evaluateCondition(condition, context);

    return {
      condition,
      result,
    };
  }

  /**
   * Execute webhook step
   */
  private async executeWebhookStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const payload = this.resolveTemplateData(step.config.payload, context);

    const result = await this.multichannelService.sendWebhook(step.config.url, payload, {
      method: step.config.method,
      headers: step.config.headers,
      timeout: step.config.timeout,
    });

    return {
      url: step.config.url,
      statusCode: result.statusCode,
      response: result.response,
    };
  }

  /**
   * Execute script step
   */
  private async executeScriptStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const script = this.resolveTemplateData(step.config.script, context);

    // In production, this would execute in a sandboxed environment
    // For now, simulate script execution
    this.logger.log(`Executing script`, {
      script: script.toString(),
    });

    try {
      // Simple script evaluation (DANGEROUS - use proper sandbox in production)
      const func = new Function('context', 'data', script);
      const result = func(context, this.resolveTemplateData(step.config.data || {}, context));

      return {
        scriptResult: result,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Script execution failed',
      };
    }
  }

  /**
   * Find triggers for event
   */
  private findTriggersForEvent(event: WorkflowEvent): Trigger[] {
    const triggers = Array.from(this.triggers.values())
      .flat()
      .filter(trigger => {
        // Check if trigger matches event type
        if (trigger.event !== event.type) {
          return false;
        }

        // Check if trigger conditions are met
        return this.evaluateTriggerConditions(trigger.conditions, event);
      });

    return triggers;
  }

  /**
   * Evaluate trigger condition
   */
  private async evaluateTriggerCondition(trigger: Trigger, event: WorkflowEvent): Promise<boolean> {
    // Simple condition evaluation
    if (trigger.condition) {
      return this.evaluateCondition(trigger.condition, {
        event,
        user: { id: event.userId },
      });
    }

    return true;
  }

  /**
   * Evaluate trigger conditions
   */
  private evaluateTriggerConditions(conditions: TriggerCondition[], event: WorkflowEvent): boolean {
    return conditions.every(condition => {
      const conditionString = `${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}`;
      return this.evaluateCondition(conditionString, { event, user: { id: event.userId } });
    });
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(condition: string, context: any): boolean {
    // Simple condition evaluation (use proper expression parser in production)
    try {
      // Replace variables with actual values
      let evalCondition = condition;
      Object.keys(context).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        evalCondition = evalCondition.replace(regex, JSON.stringify(context[key]));
      });

      return eval(evalCondition);
    } catch {
      return false;
    }
  }

  /**
   * Resolve template data with context
   */
  private resolveTemplateData(template: any, context: WorkflowContext): any {
    if (typeof template === 'string') {
      // Replace variables in template string
      let resolved = template;
      Object.keys(context).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        resolved = resolved.replace(regex, String(context[key]));
      });
      return resolved;
    }

    return template;
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 0;
    }

    const [, amount, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

    return parseInt(amount) * (multipliers[unit] || 1000);
  }

  /**
   * Log workflow execution
   */
  private async logWorkflowExecution(workflowId: string, userId: string, result: any): Promise<void> {
    // This would log to database
    this.logger.log(`Workflow execution logged`, {
      workflowId,
      userId,
      success: result.success,
      executionTime: result.executionTime,
    });
  }

  /**
   * Initialize default workflows
   */
  private initializeWorkflows(): void {
    // Welcome series workflow
    const welcomeWorkflow: Workflow = {
      id: 'welcome_series',
      name: 'Welcome Email Series',
      description: 'Send welcome emails to new users',
      category: 'onboarding',
      enabled: true,
      steps: [
        {
          id: 'send_welcome_email',
          type: 'send_email',
          name: 'Send Welcome Email',
          config: {
            templateName: 'welcome',
            priority: 'high',
          },
          order: 1,
        },
        {
          id: 'wait_1_day',
          type: 'delay',
          name: 'Wait 1 Day',
          config: {
            duration: '1d',
          },
          order: 2,
        },
        {
          id: 'send_followup_email',
          type: 'send_email',
          name: 'Send Follow-up Email',
          config: {
            templateName: 'email-verification',
            priority: 'normal',
          },
          order: 3,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };

    this.workflows.set(welcomeWorkflow.id, welcomeWorkflow);

    // Abandoned cart recovery workflow
    const cartRecoveryWorkflow: Workflow = {
      id: 'cart_recovery',
      name: 'Cart Recovery',
      description: 'Recover abandoned shopping carts',
      category: 'ecommerce',
      enabled: true,
      steps: [
        {
          id: 'check_cart_status',
          type: 'condition',
          name: 'Check if cart is abandoned',
          config: {
            condition: 'context.event.data.cartStatus === "abandoned"',
          },
          order: 1,
        },
        {
          id: 'send_recovery_email',
          type: 'send_email',
          name: 'Send Recovery Email',
          config: {
            templateName: 'cart_recovery',
            priority: 'high',
          },
          order: 2,
        },
        {
          id: 'wait_2_hours',
          type: 'delay',
          name: 'Wait 2 Hours',
          config: {
            duration: '2h',
          },
          order: 3,
        },
        {
          id: 'send_final_reminder',
          type: 'send_email',
          name: 'Send Final Reminder',
          config: {
            templateName: 'cart_final_reminder',
            priority: 'normal',
          },
          order: 4,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };

    this.workflows.set(cartRecoveryWorkflow.id, cartRecoveryWorkflow);
  }

  /**
   * Initialize default triggers
   */
  private initializeTriggers(): void {
    // User registration trigger
    const userRegistrationTrigger: Trigger = {
      id: 'user_registered',
      name: 'User Registration',
      workflowId: 'welcome_series',
      event: 'user_registered',
      conditions: [],
      enabled: true,
    };

    // Cart abandoned trigger
    const cartAbandonedTrigger: Trigger = {
      id: 'cart_abandoned',
      name: 'Cart Abandoned',
      workflowId: 'cart_recovery',
      event: 'cart_abandoned',
      conditions: [
        {
          field: 'event.data.cartValue',
          operator: '>',
          value: 50,
        },
      ],
      enabled: true,
    };

    this.triggers.set('user_registered', [userRegistrationTrigger]);
    this.triggers.set('cart_abandoned', [cartAbandonedTrigger]);
  }

  /**
   * Generate workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Scheduled workflow execution
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledWorkflowExecution(): Promise<void> {
    this.logger.log('Running scheduled workflow execution');

    // This would check for scheduled workflows and execute them
    // For now, just log
  }
}

// Type definitions
interface Workflow {
  id: string;
  name: string;
  description: string;
  category?: string;
  enabled: boolean;
  steps: WorkflowStep[];
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface WorkflowStep {
  id: string;
  type: 'send_email' | 'send_sms' | 'send_push' | 'delay' | 'condition' | 'webhook' | 'script';
  name: string;
  config: any;
  order: number;
  stopOnFailure?: boolean;
}

interface Trigger {
  id: string;
  name: string;
  workflowId: string;
  event: string;
  conditions?: TriggerCondition[];
  condition?: string;
  context?: any;
  enabled: boolean;
}

interface TriggerCondition {
  field: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: any;
}

interface WorkflowContext {
  userId: string;
  trigger: string;
  event?: WorkflowEvent;
  data: any;
}

interface WorkflowResult {
  workflowId: string;
  success: boolean;
  executionTime: number;
  steps: StepResult[];
  context: WorkflowContext;
  error?: string;
}

interface StepResult {
  stepId: string;
  type: string;
  success: boolean;
  executionTime: number;
  result?: any;
  context: any;
  error?: string;
}

interface TriggerResult {
  triggerId: string;
  workflowId: string;
  success: boolean;
  executionTime?: number;
  error?: string;
}

interface WorkflowEvent {
  type: string;
  userId: string;
  data: any;
  timestamp: Date;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  userId: string;
  trigger: string;
  success: boolean;
  executionTime: number;
  steps: StepResult[];
  executedAt: Date;
}

interface CreateWorkflowRequest {
  name: string;
  description: string;
  enabled?: boolean;
  steps: WorkflowStep[];
}

interface WorkflowFilters {
  enabled?: boolean;
  name?: string;
  category?: string;
}

interface TimeRange {
  start: Date;
  end: Date;
}
