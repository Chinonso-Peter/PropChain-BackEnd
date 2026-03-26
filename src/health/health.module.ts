import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { BlockchainHealthIndicator } from './indicators/blockchain.health';
import { MemoryHealthIndicator } from './indicators/memory.health';
import { CpuHealthIndicator } from './indicators/cpu.health';
import { DiskHealthIndicator } from './indicators/disk.health';
import { DependenciesHealthIndicator } from './indicators/dependencies.health';
import { HealthAnalyticsService } from './health-analytics.service';
import { HealthSchedulerService } from './health-scheduler.service';

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    BlockchainHealthIndicator,
    MemoryHealthIndicator,
    CpuHealthIndicator,
    DiskHealthIndicator,
    DependenciesHealthIndicator,
    HealthAnalyticsService,
    HealthSchedulerService,
  ],
  exports: [
    HealthAnalyticsService,
    DependenciesHealthIndicator,
    HealthSchedulerService,
  ],
})
export class HealthModule {}
