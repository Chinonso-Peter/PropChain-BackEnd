import { IsString, IsEnum, IsOptional, IsDateString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  XML = 'xml',
  XLSX = 'xlsx',
}

export enum ExportDataType {
  USERS = 'users',
  PROPERTIES = 'properties',
  TRANSACTIONS = 'transactions',
  AUDIT_LOGS = 'audit_logs',
  USER_ACTIVITY = 'user_activity',
  ALL = 'all',
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export class CreateExportJobDto {
  @ApiProperty({
    description: 'Type of data to export',
    enum: ExportDataType,
  })
  @IsEnum(ExportDataType)
  dataType: ExportDataType;

  @ApiProperty({
    description: 'Export format',
    enum: ExportFormat,
  })
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @ApiPropertyOptional({
    description: 'Start date for data filtering (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for data filtering (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Specific fields to include in export',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];

  @ApiPropertyOptional({
    description: 'Filters to apply to the data',
  })
  @IsOptional()
  filters?: Record<string, any>;
}

export class ExportJobResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the export job',
  })
  id: string;

  @ApiProperty({
    description: 'Type of data being exported',
    enum: ExportDataType,
  })
  dataType: ExportDataType;

  @ApiProperty({
    description: 'Export format',
    enum: ExportFormat,
  })
  format: ExportFormat;

  @ApiProperty({
    description: 'Current status of the export job',
    enum: ExportStatus,
  })
  status: ExportStatus;

  @ApiPropertyOptional({
    description: 'Download URL when export is completed',
  })
  downloadUrl?: string;

  @ApiProperty({
    description: 'Date when the export job was created',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Date when the export job was completed',
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    description: 'Error message if export failed',
  })
  errorMessage?: string;

  @ApiProperty({
    description: 'Total records processed',
  })
  totalRecords: number;

  @ApiPropertyOptional({
    description: 'File size in bytes',
  })
  fileSize?: number;

  @ApiProperty({
    description: 'User who requested the export',
  })
  userId: string;
}
