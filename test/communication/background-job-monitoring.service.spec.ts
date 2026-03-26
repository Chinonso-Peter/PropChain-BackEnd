import { BackgroundJobMonitoringService } from '../../src/communication/jobs/background-job-monitoring.service';

describe('BackgroundJobMonitoringService', () => {
  const createRedisMock = () => {
    const state = new Map<string, string>();

    return {
      get: jest.fn(async (key: string) => state.get(key) ?? null),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => {
        state.set(key, value);
      }),
    };
  };

  const createConfigMock = () => ({
    get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
  });

  const createQueueMock = () => ({
    getAllQueueStats: jest.fn(async () => ({
      default: { queueName: 'default', waiting: 0, active: 0, completed: 1, failed: 1, total: 1 },
      priority: { queueName: 'priority', waiting: 0, active: 0, completed: 0, failed: 0, total: 0 },
      batch: { queueName: 'batch', waiting: 0, active: 0, completed: 0, failed: 0, total: 0 },
      total: { queueName: 'total', waiting: 0, active: 0, completed: 1, failed: 1, total: 1 },
    })),
    retryFailedJobs: jest.fn(async () => 1),
    getFailedJobs: jest.fn(async () => [
      {
        id: 'job-1',
        queueName: 'default',
        name: 'single',
        failedReason: 'boom',
        attemptsMade: 3,
        maxAttempts: 3,
        timestamp: new Date().toISOString(),
      },
    ]),
  });

  it('creates alerts when failed jobs are recorded', async () => {
    const service = new BackgroundJobMonitoringService(
      createRedisMock() as any,
      createConfigMock() as any,
      createQueueMock() as any,
    );

    await service.recordQueueEvent(
      'default',
      'failed',
      {
        id: 'job-1',
        name: 'single',
        attemptsMade: 3,
        opts: { attempts: 3 },
        timestamp: Date.now(),
        processedOn: Date.now() - 1000,
        finishedOn: Date.now(),
        data: { type: 'single' },
      } as any,
      {
        message: 'boom',
      },
    );

    const alerts = await service.getAlerts(false);
    const dashboard = await service.getDashboard();

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('job_failed');
    expect(dashboard.alerts.unresolved).toBe(1);
  });
});
