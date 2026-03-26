import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditService, AuditReportFilters } from './audit.service';
import { AuditAction } from './entities/audit-log.entity';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Paginated audit log' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({ name: 'actor', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('from') from = new Date(Date.now() - 30 * 86_400_000).toISOString(),
    @Query('to') to = new Date().toISOString(),
    @Query('action') action?: AuditAction,
    @Query('actor') actor?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const filters: AuditReportFilters = {
      from: new Date(from),
      to: new Date(to),
      action,
      actorAddress: actor,
    };
    return this.auditService.findAll(filters, Number(page), Number(limit));
  }

  @Get('report')
  @ApiOperation({ summary: 'Aggregated audit report' })
  report(
    @Query('from') from = new Date(Date.now() - 30 * 86_400_000).toISOString(),
    @Query('to') to = new Date().toISOString(),
  ) {
    return this.auditService.generateReport({
      from: new Date(from),
      to: new Date(to),
    });
  }
}
