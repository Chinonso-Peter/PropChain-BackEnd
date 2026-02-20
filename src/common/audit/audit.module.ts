import { Module } from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { DatabaseModule } from '../../database/database.module';
import { ComplianceReportingService } from '../services/compliance-reporting.service';
import { DataRetentionService } from '../services/data-retention.service';
import { GdprService } from '../services/gdpr.service';
import { EncryptionService } from '../services/encryption.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    AuditService,
    ComplianceReportingService,
    DataRetentionService,
    GdprService,
    EncryptionService,
  ],
  exports: [
    AuditService,
    ComplianceReportingService,
    DataRetentionService,
    GdprService,
    EncryptionService,
  ],
})
export class AuditModule {}