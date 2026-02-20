import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../auth/guards/rbac.guard';
import { AuditService, AuditOperation } from '../services/audit.service';
import { ComplianceReportingService } from '../services/compliance-reporting.service';
import { DataRetentionService } from '../services/data-retention.service';
import { GdprService, UserDataExport } from '../services/gdpr.service';
import { EncryptionService } from '../services/encryption.service';
import { RbacService } from '../../rbac/rbac.service';
import { Resource } from '../../rbac/enums/resource.enum';
import { Action } from '../../rbac/enums/action.enum';
import { RequireScopes } from '../decorators/require-scopes.decorator';
import { AuditInterceptor } from '../interceptors/audit.interceptor';

@ApiTags('Audit & Compliance')
@Controller('audit')
@UseGuards(JwtAuthGuard, RbacGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly complianceReportingService: ComplianceReportingService,
    private readonly dataRetentionService: DataRetentionService,
    private readonly gdprService: GdprService,
    private readonly encryptionService: EncryptionService,
    private readonly rbacService: RbacService,
  ) {}

  @Get('logs')
  @ApiOperation({ summary: 'Get audit logs with pagination' })
  @ApiResponse({ status: 200, description: 'List of audit logs.' })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async getAuditLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('operation') operation?: string,
    @Query('tableName') tableName?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const skip = (page - 1) * limit;

    // Use audit service methods instead of direct prisma access
    let logs;
    if (tableName) {
      logs = await this.auditService.getTableLogs(tableName, limit, skip);
    } else {
      // We'll need to enhance the audit service to handle more complex queries
      // For now, default to getting all logs for the specified table
      logs = await this.auditService.getTableLogs('', limit, skip);
    }

    // Since we can't get total count easily without changing the audit service,
    // we'll return the logs as-is
    return {
      data: logs,
      meta: {
        page,
        limit,
        // totalCount would need to be calculated separately
        // We'll need to add a method to the audit service for this
      },
    };
  }

  @Get('logs/:id')
  @ApiOperation({ summary: 'Get specific audit log entry' })
  @ApiParam({ name: 'id', description: 'Audit log ID' })
  @ApiResponse({ status: 200, description: 'Audit log entry.' })
  @ApiResponse({ status: 404, description: 'Audit log not found.' })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async getAuditLog(@Param('id') id: string) {
    // We'll need to add a method to the audit service to get a single log
    // For now, we'll throw an error indicating this limitation
    throw new Error('Single audit log retrieval not implemented in service layer');
  }

  @Get('compliance/report')
  @ApiOperation({ summary: 'Generate compliance report' })
  @ApiResponse({ status: 200, description: 'Compliance report.' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async generateComplianceReport(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format. Use ISO 8601 format.');
    }

    return await this.complianceReportingService.generateComplianceReport(start, end);
  }

  @Post('compliance/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export compliance report in specified format' })
  @ApiResponse({ status: 200, description: 'Compliance report export.' })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async exportComplianceReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('format') format: 'json' | 'csv' | 'pdf' = 'json',
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format. Use ISO 8601 format.');
    }

    const report = await this.complianceReportingService.generateComplianceReport(start, end);
    const exportData = await this.complianceReportingService.exportReport(report, format);

    return {
      report,
      exportData,
      format,
      filename: `compliance_report_${start.toISOString()}_${end.toISOString()}.${format}`,
    };
  }

  @Get('retention/status')
  @ApiOperation({ summary: 'Get data retention compliance status' })
  @ApiResponse({ status: 200, description: 'Data retention compliance status.' })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async getRetentionStatus() {
    return await this.dataRetentionService.getRetentionStats();
  }

  @Post('retention/cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean up expired data based on retention policies' })
  @ApiResponse({ status: 200, description: 'Cleanup result.' })
  @RequireScopes(Resource.AUDIT, Action.DELETE)
  @UseInterceptors(AuditInterceptor)
  async cleanupExpiredData(
    @Query('table') table?: string,
    @Query('batchSize') batchSize: number = 1000,
    @Query('dryRun') dryRun: boolean = false,
  ) {
    return await this.dataRetentionService.cleanupExpiredData(table, batchSize, dryRun);
  }

  @Post('gdpr/export/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export user data for GDPR compliance' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User data export.' })
  @RequireScopes(Resource.USER, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async exportUserData(@Param('userId') userId: string): Promise<UserDataExport> {
    return await this.gdprService.exportUserData(userId);
  }

  @Delete('gdpr/delete/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user data for GDPR compliance' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User data deletion result.' })
  @RequireScopes(Resource.USER, Action.DELETE)
  @UseInterceptors(AuditInterceptor)
  async deleteUser(@Param('userId') userId: string) {
    await this.gdprService.deleteUser(userId);
    return { success: true, userId, message: 'User data anonymized for GDPR compliance' };
  }

  @Get('analytics/trends')
  @ApiOperation({ summary: 'Get compliance trends over time' })
  @ApiResponse({ status: 200, description: 'Compliance trends.' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  @ApiQuery({ name: 'interval', enum: ['daily', 'weekly', 'monthly'] })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async getComplianceTrends(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('interval') interval: 'daily' | 'weekly' | 'monthly' = 'weekly',
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format. Use ISO 8601 format.');
    }

    return await this.complianceReportingService.getComplianceTrends(start, end, interval);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get audit statistics' })
  @ApiResponse({ status: 200, description: 'Audit statistics.' })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async getAuditStats() {
    const logCounts = await this.auditService.getLogCounts();

    return {
      totalLogs: Object.values(logCounts).reduce((sum, count) => sum + count, 0),
      byOperation: logCounts,
    };
  }

  @Get('encryption/test')
  @ApiOperation({ summary: 'Test encryption functionality' })
  @ApiResponse({ status: 200, description: 'Encryption test result.' })
  @RequireScopes(Resource.AUDIT, Action.READ)
  @UseInterceptors(AuditInterceptor)
  async testEncryption() {
    if (!this.encryptionService.isEncryptionConfigured()) {
      return {
        status: 'warning',
        message: 'Encryption is not properly configured. ENCRYPTION_KEY is missing.',
      };
    }

    try {
      const testData = 'This is a test of the encryption system';
      const encrypted = this.encryptionService.encrypt(testData);
      const decrypted = this.encryptionService.decrypt(encrypted);

      return {
        status: 'success',
        testPassed: testData === decrypted,
        encryptedSample: `${encrypted.encrypted.substring(0, 20)}...`,
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Encryption test failed',
        error: error.message,
      };
    }
  }
}
