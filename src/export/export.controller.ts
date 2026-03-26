import { 
  Controller, 
  Get, 
  Post, 
  Delete, 
  Param, 
  Query, 
  Body, 
  UseGuards, 
  Request,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { ExportService } from './export.service';
import { CreateExportJobDto, ExportJobResponseDto } from './dto/export.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiStandardErrorResponse } from '../common/errors/api-standard-error-response.decorator';

@ApiTags('export')
@Controller('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new data export job',
    description: 'Request an export of user data in various formats for compliance purposes'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Export job created successfully and queued for processing',
    type: ExportJobResponseDto 
  })
  @ApiStandardErrorResponse([400, 401, 403])
  async createExportJob(@Body() createExportJobDto: CreateExportJobDto, @Request() req) {
    return this.exportService.createExportJob(req.user.id, createExportJobDto);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get user export jobs',
    description: 'Retrieve a paginated list of export jobs for the current user'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Export jobs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        jobs: {
          type: 'array',
          items: { $ref: '#/components/schemas/ExportJobResponseDto' }
        },
        total: { type: 'number' }
      }
    }
  })
  @ApiStandardErrorResponse([401])
  async getExportJobs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    return this.exportService.getExportJobs(req.user.id, pageNum, limitNum);
  }

  @Get(':jobId')
  @ApiOperation({ 
    summary: 'Get export job details',
    description: 'Retrieve detailed information about a specific export job'
  })
  @ApiParam({ name: 'jobId', description: 'Export job ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Export job details retrieved successfully',
    type: ExportJobResponseDto 
  })
  @ApiStandardErrorResponse([401, 404])
  async getExportJob(@Param('jobId') jobId: string, @Request() req) {
    return this.exportService.getExportJob(req.user.id, jobId);
  }

  @Post(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Cancel an export job',
    description: 'Cancel a pending or processing export job'
  })
  @ApiParam({ name: 'jobId', description: 'Export job ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Export job cancelled successfully',
    type: ExportJobResponseDto 
  })
  @ApiStandardErrorResponse([400, 401, 404])
  async cancelExportJob(@Param('jobId') jobId: string, @Request() req) {
    return this.exportService.cancelExportJob(req.user.id, jobId);
  }

  @Get(':jobId/download')
  @ApiOperation({ 
    summary: 'Download exported data file',
    description: 'Download the generated export file when the job is completed'
  })
  @ApiParam({ name: 'jobId', description: 'Export job ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'File download started',
    type: 'stream'
  })
  @ApiStandardErrorResponse([401, 404])
  async downloadExportFile(
    @Param('jobId') jobId: string,
    @Request() req,
    @Res({ passthrough: true }) res: Response
  ) {
    const { filePath, fileName } = await this.exportService.getExportFile(req.user.id, jobId);
    
    const fs = require('fs');
    const file = fs.createReadStream(filePath);
    
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    
    return new StreamableFile(file);
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Delete export job',
    description: 'Delete an export job and its associated file'
  })
  @ApiParam({ name: 'jobId', description: 'Export job ID' })
  @ApiResponse({ 
    status: 204, 
    description: 'Export job deleted successfully'
  })
  @ApiStandardErrorResponse([401, 404])
  async deleteExportJob(@Param('jobId') jobId: string, @Request() req) {
    await this.exportService.deleteExportJob(req.user.id, jobId);
  }

  @Get('formats/available')
  @ApiOperation({ 
    summary: 'Get available export formats',
    description: 'Retrieve list of supported export formats'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Available export formats',
    schema: {
      type: 'object',
      properties: {
        formats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              label: { type: 'string' },
              description: { type: 'string' }
            }
          }
        }
      }
    }
  })
  @ApiStandardErrorResponse([401])
  async getAvailableFormats() {
    return {
      formats: [
        {
          value: 'csv',
          label: 'CSV',
          description: 'Comma-separated values format, suitable for spreadsheet applications'
        },
        {
          value: 'json',
          label: 'JSON',
          description: 'JavaScript Object Notation, suitable for programmatic processing'
        },
        {
          value: 'xml',
          label: 'XML',
          description: 'eXtensible Markup Language, suitable for structured data exchange'
        },
        {
          value: 'xlsx',
          label: 'Excel',
          description: 'Microsoft Excel format, suitable for data analysis and reporting'
        }
      ]
    };
  }

  @Get('data-types/available')
  @ApiOperation({ 
    summary: 'Get available data types for export',
    description: 'Retrieve list of data types that can be exported'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Available data types',
    schema: {
      type: 'object',
      properties: {
        dataTypes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              label: { type: 'string' },
              description: { type: 'string' },
              adminOnly: { type: 'boolean' }
            }
          }
        }
      }
    }
  })
  @ApiStandardErrorResponse([401])
  async getAvailableDataTypes(@Request() req) {
    const isAdmin = req.user.role === 'ADMIN';
    
    const dataTypes = [
      {
        value: 'users',
        label: 'Users',
        description: 'User account information and profile data',
        adminOnly: true
      },
      {
        value: 'properties',
        label: 'Properties',
        description: 'Property listings and related information',
        adminOnly: false
      },
      {
        value: 'transactions',
        label: 'Transactions',
        description: 'Transaction records and payment history',
        adminOnly: false
      },
      {
        value: 'user_activity',
        label: 'User Activity',
        description: 'User activity logs and interaction history',
        adminOnly: true
      },
      {
        value: 'audit_logs',
        label: 'Audit Logs',
        description: 'System audit logs and compliance records',
        adminOnly: true
      },
      {
        value: 'all',
        label: 'All Data',
        description: 'Complete data export (admin only)',
        adminOnly: true
      }
    ];

    return {
      dataTypes: isAdmin ? dataTypes : dataTypes.filter(type => !type.adminOnly)
    };
  }
}
