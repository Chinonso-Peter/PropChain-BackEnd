import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { ExportDataType, ExportFormat, ExportStatus } from './dto/export.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
@Processor('export-queue')
export class ExportProcessor {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Process('process-export')
  async processExportJob(job: Job<{ jobId: string }>): Promise<void> {
    const { jobId } = job.data;
    try {
      // Update job status to processing
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: ExportStatus.PROCESSING,
          startedAt: new Date(),
        },
      });

      const job = await this.prisma.exportJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new NotFoundException(`Export job ${jobId} not found`);
      }

      // Generate the export file
      const filePath = await this.generateExportFile(job);

      // Update job with completion details
      const fileStats = fs.statSync(filePath);
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: ExportStatus.COMPLETED,
          completedAt: new Date(),
          downloadUrl: `/api/v1/export/download/${jobId}`,
          fileSize: fileStats.size,
        },
      });

      // Clean up old files (older than 7 days)
      await this.cleanupOldFiles();
    } catch (error) {
      // Update job with error details
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: ExportStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error.message,
        },
      });
      throw error;
    }
  }

  private async generateExportFile(job: any): Promise<string> {
    const exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const fileName = `${job.dataType}_${job.id}.${job.format}`;
    const filePath = path.join(exportDir, fileName);

    // Fetch data based on type
    let data: any[] = [];
    switch (job.dataType) {
      case ExportDataType.USERS:
        data = await this.fetchUsersData(job);
        break;
      case ExportDataType.PROPERTIES:
        data = await this.fetchPropertiesData(job);
        break;
      case ExportDataType.TRANSACTIONS:
        data = await this.fetchTransactionsData(job);
        break;
      case ExportDataType.AUDIT_LOGS:
        data = await this.fetchAuditLogsData(job);
        break;
      case ExportDataType.USER_ACTIVITY:
        data = await this.fetchUserActivityData(job);
        break;
      case ExportDataType.ALL:
        data = await this.fetchAllData(job);
        break;
      default:
        throw new BadRequestException(`Unsupported data type: ${job.dataType}`);
    }

    // Update total records count
    await this.prisma.exportJob.update({
      where: { id: job.id },
      data: { totalRecords: data.length },
    });

    // Generate file based on format
    switch (job.format) {
      case ExportFormat.CSV:
        await this.generateCSV(filePath, data, job.fields as string[]);
        break;
      case ExportFormat.JSON:
        await this.generateJSON(filePath, data);
        break;
      case ExportFormat.XML:
        await this.generateXML(filePath, data, job.dataType);
        break;
      case ExportFormat.XLSX:
        await this.generateXLSX(filePath, data, job.fields as string[]);
        break;
      default:
        throw new BadRequestException(`Unsupported format: ${job.format}`);
    }

    return filePath;
  }

  private async fetchUsersData(job: any): Promise<any[]> {
    const whereClause: any = {};
    
    if (job.startDate || job.endDate) {
      whereClause.createdAt = {};
      if (job.startDate) whereClause.createdAt.gte = new Date(job.startDate);
      if (job.endDate) whereClause.createdAt.lte = new Date(job.endDate);
    }

    // Apply additional filters
    if (job.filters) {
      Object.assign(whereClause, job.filters);
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      select: this.getSelectFields(job.fields as string[], 'user'),
    });

    return users.map(user => this.sanitizeData(user));
  }

  private async fetchPropertiesData(job: any): Promise<any[]> {
    const whereClause: any = {};
    
    if (job.startDate || job.endDate) {
      whereClause.createdAt = {};
      if (job.startDate) whereClause.createdAt.gte = new Date(job.startDate);
      if (job.endDate) whereClause.createdAt.lte = new Date(job.endDate);
    }

    if (job.filters) {
      Object.assign(whereClause, job.filters);
    }

    const properties = await this.prisma.property.findMany({
      where: whereClause,
      select: this.getSelectFields(job.fields as string[], 'property'),
    });

    return properties.map(property => this.sanitizeData(property));
  }

  private async fetchTransactionsData(job: any): Promise<any[]> {
    const whereClause: any = {};
    
    if (job.startDate || job.endDate) {
      whereClause.createdAt = {};
      if (job.startDate) whereClause.createdAt.gte = new Date(job.startDate);
      if (job.endDate) whereClause.createdAt.lte = new Date(job.endDate);
    }

    if (job.filters) {
      Object.assign(whereClause, job.filters);
    }

    const transactions = await this.prisma.transaction.findMany({
      where: whereClause,
      select: this.getSelectFields(job.fields as string[], 'transaction'),
    });

    return transactions.map(transaction => this.sanitizeData(transaction));
  }

  private async fetchAuditLogsData(job: any): Promise<any[]> {
    // This would need to be implemented based on your audit logging structure
    return [];
  }

  private async fetchUserActivityData(job: any): Promise<any[]> {
    const whereClause: any = {};
    
    if (job.startDate || job.endDate) {
      whereClause.createdAt = {};
      if (job.startDate) whereClause.createdAt.gte = new Date(job.startDate);
      if (job.endDate) whereClause.createdAt.lte = new Date(job.endDate);
    }

    if (job.filters) {
      Object.assign(whereClause, job.filters);
    }

    const activities = await this.prisma.userActivity.findMany({
      where: whereClause,
      select: this.getSelectFields(job.fields as string[], 'userActivity'),
    });

    return activities.map(activity => this.sanitizeData(activity));
  }

  private async fetchAllData(job: any): Promise<any[]> {
    const allData = {
      users: await this.fetchUsersData(job),
      properties: await this.fetchPropertiesData(job),
      transactions: await this.fetchTransactionsData(job),
      userActivities: await this.fetchUserActivityData(job),
    };

    return [allData];
  }

  private getSelectFields(fields: string[] | null, entityType: string): any {
    if (!fields || fields.length === 0) {
      return undefined; // Return all fields
    }

    const select: any = {};
    fields.forEach(field => {
      select[field] = true;
    });

    return select;
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    // Remove sensitive information
    const sanitized = { ...data };
    delete sanitized.password;
    delete sanitized.passwordHash;
    
    return sanitized;
  }

  private async generateCSV(filePath: string, data: any[], fields?: string[]): Promise<void> {
    const csv = require('csv-writer');
    
    if (!fields || fields.length === 0) {
      fields = Object.keys(data[0] || {});
    }

    const csvWriter = csv.createObjectCsvWriter({
      path: filePath,
      header: fields.map(field => ({ id: field, title: field })),
    });

    await csvWriter.writeRecords(data);
  }

  private async generateJSON(filePath: string, data: any[]): Promise<void> {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData, 'utf8');
  }

  private async generateXML(filePath: string, data: any[], dataType: string): Promise<void> {
    const xml2js = require('xml2js');
    const builder = new xml2js.Builder();
    
    const xmlData = {
      [dataType]: data
    };
    
    const xml = builder.buildObject(xmlData);
    fs.writeFileSync(filePath, xml, 'utf8');
  }

  private async generateXLSX(filePath: string, data: any[], fields?: string[]): Promise<void> {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Export Data');

    if (!fields || fields.length === 0) {
      fields = Object.keys(data[0] || {});
    }

    // Add headers
    worksheet.addRow(fields);

    // Add data
    data.forEach(row => {
      const rowData = fields.map(field => row[field] || '');
      worksheet.addRow(rowData);
    });

    await workbook.xlsx.writeFile(filePath);
  }

  private async cleanupOldFiles(): Promise<void> {
    const exportDir = path.join(process.cwd(), 'exports');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      const files = fs.readdirSync(exportDir);
      
      for (const file of files) {
        const filePath = path.join(exportDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < sevenDaysAgo) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      // Log error but don't fail the process
      console.error('Error cleaning up old export files:', error);
    }
  }
}
