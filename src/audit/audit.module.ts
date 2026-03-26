import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Injectable as Inj, Logger as Log } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditLog } from './entities/audit-log.entity';

@Inj()
class AuditRetentionTask {
  private readonly logger = new Log(AuditRetentionTask.name);
  constructor(private readonly auditService: AuditService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run() {
    this.logger.log('Running audit retention policy…');
    await this.auditService.applyRetentionPolicy();
  }
}

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor, AuditRetentionTask],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
