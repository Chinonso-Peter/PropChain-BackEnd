import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../../src/health/health.controller';
import { HealthCheckService } from '@nestjs/terminus';
import { HttpService } from '@nestjs/axios';
import { DatabaseHealthIndicator } from '../../src/health/indicators/database.health';
import { RedisHealthIndicator } from '../../src/health/indicators/redis.health';
import { BlockchainHealthIndicator } from '../../src/health/indicators/blockchain.health';
import { MemoryHealthIndicator } from '../../src/health/indicators/memory.health';
import { CpuHealthIndicator } from '../../src/health/indicators/cpu.health';
import { DiskHealthIndicator } from '../../src/health/indicators/disk.health';
import { DependenciesHealthIndicator } from '../../src/health/indicators/dependencies.health';
import { HealthAnalyticsService } from '../../src/health/health-analytics.service';
import { HealthSchedulerService } from '../../src/health/health-scheduler.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let healthAnalyticsService: HealthAnalyticsService;
  let healthSchedulerService: HealthSchedulerService;

  const mockHealthCheckService = {
    check: jest.fn(),
  };

  const mockHealthAnalyticsService = {
    recordHealthCheck: jest.fn(),
    getAnalytics: jest.fn(),
    clearMetrics: jest.fn(),
  };

  const mockHealthSchedulerService = {
    triggerManualHealthCheck: jest.fn(),
  };

  const mockDatabaseHealthIndicator = {
    isHealthy: jest.fn(),
  };

  const mockRedisHealthIndicator = {
    isHealthy: jest.fn(),
  };

  const mockBlockchainHealthIndicator = {
    isHealthy: jest.fn(),
  };

  const mockMemoryHealthIndicator = {
    isHealthy: jest.fn(),
  };

  const mockCpuHealthIndicator = {
    isHealthy: jest.fn(),
  };

  const mockDiskHealthIndicator = {
    isHealthy: jest.fn(),
  };

  const mockDependenciesHealthIndicator = {
    isHealthy: jest.fn(),
    getDependencies: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: HealthAnalyticsService,
          useValue: mockHealthAnalyticsService,
        },
        {
          provide: HealthSchedulerService,
          useValue: mockHealthSchedulerService,
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: mockDatabaseHealthIndicator,
        },
        {
          provide: RedisHealthIndicator,
          useValue: mockRedisHealthIndicator,
        },
        {
          provide: BlockchainHealthIndicator,
          useValue: mockBlockchainHealthIndicator,
        },
        {
          provide: MemoryHealthIndicator,
          useValue: mockMemoryHealthIndicator,
        },
        {
          provide: CpuHealthIndicator,
          useValue: mockCpuHealthIndicator,
        },
        {
          provide: DiskHealthIndicator,
          useValue: mockDiskHealthIndicator,
        },
        {
          provide: DependenciesHealthIndicator,
          useValue: mockDependenciesHealthIndicator,
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    healthAnalyticsService = module.get<HealthAnalyticsService>(HealthAnalyticsService);
    healthSchedulerService = module.get<HealthSchedulerService>(HealthSchedulerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return healthy status', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockResolvedValue(mockHealthResult);

      const result = await controller.check();

      expect(result).toEqual(mockHealthResult);
      expect(mockHealthAnalyticsService.recordHealthCheck).toHaveBeenCalledWith('basic', 'healthy', expect.any(Number));
    });

    it('should handle unhealthy status', async () => {
      const mockError = new Error('Database connection failed');
      mockHealthCheckService.check.mockRejectedValue(mockError);

      await expect(controller.check()).rejects.toThrow('Database connection failed');
      expect(mockHealthAnalyticsService.recordHealthCheck).toHaveBeenCalledWith('basic', 'unhealthy', expect.any(Number));
    });
  });

  describe('checkDetailed', () => {
    it('should return detailed health status', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
          blockchain: { status: 'up' },
          memory: { status: 'up' },
          cpu: { status: 'up' },
          disk: { status: 'up' },
          dependencies: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockResolvedValue(mockHealthResult);

      const result = await controller.checkDetailed();

      expect(result).toEqual(mockHealthResult);
      expect(mockHealthAnalyticsService.recordHealthCheck).toHaveBeenCalledWith('detailed', 'healthy', expect.any(Number));
    });
  });

  describe('checkComprehensive', () => {
    it('should return comprehensive health status with analytics', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
          blockchain: { status: 'up' },
          memory: { status: 'up' },
          cpu: { status: 'up' },
          disk: { status: 'up' },
          dependencies: { status: 'up' },
        },
      };

      const mockAnalytics = {
        totalChecks: 100,
        healthyChecks: 95,
        unhealthyChecks: 5,
        averageResponseTime: 150,
        lastCheck: new Date(),
        serviceHealth: {},
      };

      mockHealthCheckService.check.mockResolvedValue(mockHealthResult);
      mockHealthAnalyticsService.getAnalytics.mockReturnValue(mockAnalytics);

      const result = await controller.checkComprehensive();

      expect(result).toEqual({
        ...mockHealthResult,
        analytics: mockAnalytics,
        systemInfo: expect.any(Object),
      });
      expect(mockHealthAnalyticsService.recordHealthCheck).toHaveBeenCalledWith('comprehensive', 'healthy', expect.any(Number));
    });

    it('should handle errors in comprehensive check', async () => {
      const mockError = new Error('Service unavailable');
      mockHealthCheckService.check.mockRejectedValue(mockError);
      
      const mockAnalytics = {
        totalChecks: 100,
        healthyChecks: 95,
        unhealthyChecks: 5,
        averageResponseTime: 150,
        lastCheck: new Date(),
        serviceHealth: {},
      };

      mockHealthAnalyticsService.getAnalytics.mockReturnValue(mockAnalytics);

      const result = await controller.checkComprehensive();

      expect(result).toEqual({
        status: 'error',
        error: 'Service unavailable',
        analytics: mockAnalytics,
        systemInfo: expect.any(Object),
        responseTime: expect.any(String),
      });
      expect(mockHealthAnalyticsService.recordHealthCheck).toHaveBeenCalledWith('comprehensive', 'unhealthy', expect.any(Number));
    });
  });

  describe('liveness', () => {
    it('should return liveness status', () => {
      const result = controller.liveness();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        nodeVersion: expect.any(String),
        platform: expect.any(String),
      });
    });
  });

  describe('readiness', () => {
    it('should return readiness status', async () => {
      const mockHealthResult = {
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockResolvedValue(mockHealthResult);

      const result = await controller.readiness();

      expect(result).toEqual(mockHealthResult);
      expect(mockHealthAnalyticsService.recordHealthCheck).toHaveBeenCalledWith('readiness', 'healthy', expect.any(Number));
    });
  });

  describe('getAnalytics', () => {
    it('should return health analytics', () => {
      const mockAnalytics = {
        totalChecks: 100,
        healthyChecks: 95,
        unhealthyChecks: 5,
        averageResponseTime: 150,
        lastCheck: new Date(),
        serviceHealth: {},
      };

      mockHealthAnalyticsService.getAnalytics.mockReturnValue(mockAnalytics);

      const result = controller.getAnalytics();

      expect(result).toEqual(mockAnalytics);
      expect(mockHealthAnalyticsService.getAnalytics).toHaveBeenCalled();
    });
  });

  describe('clearAnalytics', () => {
    it('should clear analytics', () => {
      const result = controller.clearAnalytics();

      expect(result).toEqual({ message: 'Health check analytics cleared successfully' });
      expect(mockHealthAnalyticsService.clearMetrics).toHaveBeenCalled();
    });
  });

  describe('getDependencies', () => {
    it('should return dependencies', () => {
      const mockDependencies = [
        {
          name: 'test-service',
          url: 'https://test-service.com/health',
          timeout: 5000,
        },
      ];

      mockDependenciesHealthIndicator.getDependencies.mockReturnValue(mockDependencies);

      const result = controller.getDependencies();

      expect(result).toEqual({ dependencies: mockDependencies });
      expect(mockDependenciesHealthIndicator.getDependencies).toHaveBeenCalled();
    });
  });

  describe('triggerManualHealthCheck', () => {
    it('should trigger manual health check', async () => {
      const mockResult = {
        success: true,
        result: { status: 'ok' },
        responseTime: 100,
      };

      mockHealthSchedulerService.triggerManualHealthCheck.mockResolvedValue(mockResult);

      const result = await controller.triggerManualHealthCheck('basic');

      expect(result).toEqual(mockResult);
      expect(mockHealthSchedulerService.triggerManualHealthCheck).toHaveBeenCalledWith('basic');
    });

    it('should trigger manual health check with default type', async () => {
      const mockResult = {
        success: true,
        result: { status: 'ok' },
        responseTime: 100,
      };

      mockHealthSchedulerService.triggerManualHealthCheck.mockResolvedValue(mockResult);

      const result = await controller.triggerManualHealthCheck();

      expect(result).toEqual(mockResult);
      expect(mockHealthSchedulerService.triggerManualHealthCheck).toHaveBeenCalledWith('basic');
    });
  });
});
