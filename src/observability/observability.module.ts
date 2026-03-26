import { Module, OnModuleInit } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerService } from '../common/logger/logger.service';
import { LoggingInterceptor } from '../common/logger/logging.interceptor';
import { MetricsInterceptor } from './metrics.interceptor';
import { TracingService } from './tracing.service';
import { PerformanceMonitorService } from './performance-monitor.service';
import { ObservabilityController } from './observability.controller';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
        config: {
          labels: {
            app: 'propchain-backend',
            version: process.env.npm_package_version || '1.0.0',
          },
        },
      },
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [ObservabilityController],
  providers: [
    LoggerService,
    TracingService,
    PerformanceMonitorService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [LoggerService, TracingService, PerformanceMonitorService],
})
export class ObservabilityModule implements OnModuleInit {
  constructor(
    private readonly tracingService: TracingService,
    private readonly performanceMonitorService: PerformanceMonitorService,
  ) {}

  async onModuleInit() {
    await this.tracingService.init();
  }
}
