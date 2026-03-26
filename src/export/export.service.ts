import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CreateExportJobDto, ExportJobResponseDto, ExportDataType, ExportFormat, ExportStatus } from './dto/export.dto';
import { AuditService } from '../common/audit/audit.service';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('export-queue') private readonly exportQueue: Queue,
    private readonly auditService: AuditService,
  ) {}

  async createExportJob(userId: string, createExportJobDto: CreateExportJobDto): Promise<ExportJobResponseDto> {
    // Validate the export request
    await this.validateExportRequest(userId, createExportJobDto);

    // Create export job record
    const exportJob = await this.prisma.exportJob.create({
      data: {
        userId,
        dataType: createExportJobDto.dataType,
        format: createExportJobDto.format,
        startDate: createExportJobDto.startDate ? new Date(createExportJobDto.startDate) : null,
        endDate: createExportJobDto.endDate ? new Date(createExportJobDto.endDate) : null,
        fields: createExportJobDto.fields || null,
        filters: createExportJobDto.filters || null,
      },
    });

    // Add job to queue for processing
    await this.exportQueue.add('process-export', {
      jobId: exportJob.id,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    // Log the export request for compliance
    await this.auditService.log({
      userId,
      action: 'EXPORT_REQUESTED',
      resourceType: 'DATA_EXPORT',
      resourceId: exportJob.id,
      metadata: {
        dataType: createExportJobDto.dataType,
        format: createExportJobDto.format,
        startDate: createExportJobDto.startDate,
        endDate: createExportJobDto.endDate,
      },
    });

    return this.mapToResponseDto(exportJob);
  }

  async getExportJobs(userId: string, page = 1, limit = 10): Promise<{ jobs: ExportJobResponseDto[], total: number }> {
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.exportJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.exportJob.count({
        where: { userId },
      }),
    ]);

    return {
      jobs: jobs.map(job => this.mapToResponseDto(job)),
      total,
    };
  }

  async getExportJob(userId: string, jobId: string): Promise<ExportJobResponseDto> {
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id: jobId,
        userId,
      },
    });

    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    return this.mapToResponseDto(job);
  }

  async cancelExportJob(userId: string, jobId: string): Promise<ExportJobResponseDto> {
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id: jobId,
        userId,
      },
    });

    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    if (job.status !== ExportStatus.PENDING && job.status !== ExportStatus.PROCESSING) {
      throw new BadRequestException('Cannot cancel export job in current status');
    }

    // Try to remove from queue
    try {
      const queueJobs = await this.exportQueue.getJobs(['waiting', 'active']);
      const queueJob = queueJobs.find(j => j.data.jobId === jobId);
      if (queueJob) {
        await queueJob.remove();
      }
    } catch (error) {
      // Log error but continue with status update
      console.error('Error removing job from queue:', error);
    }

    const updatedJob = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: ExportStatus.CANCELLED,
        completedAt: new Date(),
      },
    });

    // Log cancellation for compliance
    await this.auditService.log({
      userId,
      action: 'EXPORT_CANCELLED',
      resourceType: 'DATA_EXPORT',
      resourceId: jobId,
    });

    return this.mapToResponseDto(updatedJob);
  }

  async getExportFile(userId: string, jobId: string): Promise<{ filePath: string, fileName: string }> {
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id: jobId,
        userId,
        status: ExportStatus.COMPLETED,
      },
    });

    if (!job) {
      throw new NotFoundException('Export file not found or not ready for download');
    }

    if (!job.downloadUrl) {
      throw new NotFoundException('Download URL not available');
    }

    const fileName = `${job.dataType}_${job.id}.${job.format}`;
    const filePath = `exports/${fileName}`;

    // Log download for compliance
    await this.auditService.log({
      userId,
      action: 'EXPORT_DOWNLOADED',
      resourceType: 'DATA_EXPORT',
      resourceId: jobId,
    });

    return { filePath, fileName };
  }

  async deleteExportJob(userId: string, jobId: string): Promise<void> {
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id: jobId,
        userId,
      },
    });

    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    // Delete the file if it exists
    if (job.downloadUrl && job.status === ExportStatus.COMPLETED) {
      try {
        const fileName = `${job.dataType}_${job.id}.${job.format}`;
        const filePath = `exports/${fileName}`;
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error('Error deleting export file:', error);
      }
    }

    // Delete database record
    await this.prisma.exportJob.delete({
      where: { id: jobId },
    });

    // Log deletion for compliance
    await this.auditService.log({
      userId,
      action: 'EXPORT_DELETED',
      resourceType: 'DATA_EXPORT',
      resourceId: jobId,
    });
  }

  private async validateExportRequest(userId: string, dto: CreateExportJobDto): Promise<void> {
    // Check if user has permission to export this data type
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Add role-based validation if needed
    if (dto.dataType === ExportDataType.ALL && user.role !== 'ADMIN') {
      throw new BadRequestException('Only administrators can export all data types');
    }

    // Validate date range
    if (dto.startDate && dto.endDate) {
      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);
      
      if (start > end) {
        throw new BadRequestException('Start date must be before end date');
      }

      // Limit export range to 1 year for non-admin users
      const maxRange = user.role === 'ADMIN' ? 365 * 5 : 365; // 5 years for admin, 1 year for others
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff > maxRange) {
        throw new BadRequestException(`Date range cannot exceed ${maxRange} days`);
      }
    }

    // Check for existing pending exports of the same type
    const existingExports = await this.prisma.exportJob.count({
      where: {
        userId,
        dataType: dto.dataType,
        status: {
          in: [ExportStatus.PENDING, ExportStatus.PROCESSING],
        },
      },
    });

    if (existingExports >= 3) {
      throw new BadRequestException('Too many pending exports. Please wait for existing exports to complete');
    }
  }

  private mapToResponseDto(job: any): ExportJobResponseDto {
    return {
      id: job.id,
      dataType: job.dataType,
      format: job.format,
      status: job.status,
      downloadUrl: job.downloadUrl,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      totalRecords: job.totalRecords,
      fileSize: job.fileSize,
      userId: job.userId,
    };
  }
}
