import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../common/audit/audit.module';

@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}