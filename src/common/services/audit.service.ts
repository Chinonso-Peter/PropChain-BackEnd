import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export enum AuditOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  READ = 'READ',
}

export interface AuditLogEntry {
  tableName: string;
  operation: AuditOperation;
  oldData?: Record<string, any>;
  newData?: Record<string, any>;
  userId?: string;
  timestamp?: Date;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async logAction(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tableName: entry.tableName,
          operation: entry.operation,
          oldData: entry.oldData ? this.sanitizeData(entry.oldData) : null,
          newData: entry.newData ? this.sanitizeData(entry.newData) : null,
          userId: entry.userId,
          timestamp: entry.timestamp || new Date(),
        },
      });
    } catch (error) {
      console.error('Error logging audit action:', error);
      // Don't throw error to avoid breaking main operations
    }
  }

  /**
   * Creates an audit log for a create operation
   */
  async logCreate<T>(
    tableName: string,
    newData: T,
    userId?: string,
  ): Promise<void> {
    await this.logAction({
      tableName,
      operation: AuditOperation.CREATE,
      newData: newData as Record<string, any>,
      userId,
    });
  }

  /**
   * Creates an audit log for an update operation
   */
  async logUpdate<T>(
    tableName: string,
    oldData: T,
    newData: T,
    userId?: string,
  ): Promise<void> {
    await this.logAction({
      tableName,
      operation: AuditOperation.UPDATE,
      oldData: oldData as Record<string, any>,
      newData: newData as Record<string, any>,
      userId,
    });
  }

  /**
   * Creates an audit log for a delete operation
   */
  async logDelete<T>(
    tableName: string,
    oldData: T,
    userId?: string,
  ): Promise<void> {
    await this.logAction({
      tableName,
      operation: AuditOperation.DELETE,
      oldData: oldData as Record<string, any>,
      userId,
    });
  }

  /**
   * Sanitizes sensitive data before logging
   */
  private sanitizeData(data: Record<string, any>): Record<string, any> {
    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'apiKey',
      'privateKey',
      'encrypted',
      'salt',
      'hash'
    ];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  /**
   * Get audit logs for a specific table
   */
  async getTableLogs(
    tableName: string,
    limit: number = 100,
    offset: number = 0,
  ) {
    return await this.prisma.auditLog.findMany({
      where: { tableName },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserLogs(
    userId: string,
    limit: number = 100,
    offset: number = 0,
  ) {
    return await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get audit logs by operation type
   */
  async getLogsByOperation(
    operation: AuditOperation,
    limit: number = 100,
    offset: number = 0,
  ) {
    return await this.prisma.auditLog.findMany({
      where: { operation },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get audit logs within a date range
   */
  async getLogsByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100,
    offset: number = 0,
  ) {
    return await this.prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get count of audit logs by operation type
   */
  async getLogCounts(): Promise<Record<AuditOperation, number>> {
    const counts = await Promise.all([
      this.prisma.auditLog.count({ where: { operation: AuditOperation.CREATE } }),
      this.prisma.auditLog.count({ where: { operation: AuditOperation.UPDATE } }),
      this.prisma.auditLog.count({ where: { operation: AuditOperation.DELETE } }),
      this.prisma.auditLog.count({ where: { operation: AuditOperation.READ } }),
    ]);

    return {
      [AuditOperation.CREATE]: counts[0],
      [AuditOperation.UPDATE]: counts[1],
      [AuditOperation.DELETE]: counts[2],
      [AuditOperation.READ]: counts[3],
    };
  }

  /**
   * Get a specific audit log by ID
   */
  async getAuditLogById(id: string) {
    return await this.prisma.auditLog.findUnique({
      where: { id },
    });
  }

  /**
   * Get total count of audit logs with optional filtering
   */
  async getAuditLogCount(
    tableName?: string,
    operation?: AuditOperation,
    userId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number> {
    const where: any = {};
    
    if (tableName) where.tableName = tableName;
    if (operation) where.operation = operation;
    if (userId) where.userId = userId;
    
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    return await this.prisma.auditLog.count({ where });
  }
}