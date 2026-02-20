import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService, AuditOperation } from './audit.service';

export interface RetentionPolicy {
  tableName: string;
  retentionPeriodDays: number; // Number of days to retain data
  condition?: string; // Additional conditions for deletion
}

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Default retention policies for different data types
   */
  private readonly defaultPolicies: RetentionPolicy[] = [
    {
      tableName: 'audit_logs',
      retentionPeriodDays: 365, // Keep audit logs for 1 year
    },
    {
      tableName: 'system_logs',
      retentionPeriodDays: 90, // Keep system logs for 3 months
    },
    {
      tableName: 'documents',
      retentionPeriodDays: 1825, // Keep documents for 5 years (financial requirement)
    },
    {
      tableName: 'transactions',
      retentionPeriodDays: 1825, // Keep transaction records for 5 years
    },
    {
      tableName: 'properties',
      retentionPeriodDays: 1825, // Keep property records for 5 years
    },
    {
      tableName: 'role_change_logs',
      retentionPeriodDays: 365, // Keep role change logs for 1 year
    },
  ];

  /**
   * Get the retention policy for a specific table
   */
  getPolicy(tableName: string): RetentionPolicy | undefined {
    return this.defaultPolicies.find(policy => policy.tableName === tableName);
  }

  /**
   * Get all retention policies
   */
  getAllPolicies(): RetentionPolicy[] {
    return this.defaultPolicies;
  }

  /**
   * Clean up expired data based on retention policies
   */
  async cleanupExpiredData(
    tableName?: string,
    batchSize: number = 1000,
    dryRun: boolean = false,
  ): Promise<{ deletedCount: number; tableName: string; batchSize: number }> {
    const policies = tableName 
      ? this.defaultPolicies.filter(p => p.tableName === tableName)
      : this.defaultPolicies;

    if (policies.length === 0) {
      throw new Error(`No retention policy found for table: ${tableName}`);
    }

    let totalDeleted = 0;

    for (const policy of policies) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

      this.logger.log(
        `Cleaning up ${policy.tableName} data older than ${cutoffDate.toISOString()}`
      );

      // Calculate how many records would be affected
      const countResult = await this.getDeletableRecordCount(policy, cutoffDate);
      
      if (countResult === 0) {
        this.logger.log(`No records to delete for ${policy.tableName}`);
        continue;
      }

      if (dryRun) {
        this.logger.log(
          `[DRY RUN] Would delete ${countResult} records from ${policy.tableName}`
        );
        totalDeleted += countResult;
        continue;
      }

      // Actually perform the deletion in batches
      const deletedCount = await this.deleteInBatches(policy, cutoffDate, batchSize);
      
      totalDeleted += deletedCount;
      
      this.logger.log(`Deleted ${deletedCount} records from ${policy.tableName}`);

      // Log the cleanup action
      await this.auditService.logAction({
        tableName: 'data_retention',
        operation: AuditOperation.DELETE,
        newData: {
          action: 'DATA_CLEANUP',
          tableName: policy.tableName,
          retentionPeriodDays: policy.retentionPeriodDays,
          deletedCount,
          cutoffDate,
        },
      });
    }

    return {
      deletedCount: totalDeleted,
      tableName: tableName || 'ALL',
      batchSize,
    };
  }

  /**
   * Calculate how many records would be deleted for a given policy
   */
  async getDeletableRecordCount(
    policy: RetentionPolicy,
    cutoffDate: Date,
  ): Promise<number> {
    switch (policy.tableName) {
      case 'audit_logs':
        return this.prisma.auditLog.count({
          where: {
            timestamp: { lt: cutoffDate },
          },
        });

      case 'system_logs':
        return this.prisma.systemLog.count({
          where: {
            timestamp: { lt: cutoffDate },
          },
        });

      case 'documents':
        return this.prisma.document.count({
          where: {
            createdAt: { lt: cutoffDate },
            expiresAt: { lt: cutoffDate },
          },
        });

      case 'transactions':
        return this.prisma.transaction.count({
          where: {
            createdAt: { lt: cutoffDate },
          },
        });

      case 'properties':
        return this.prisma.property.count({
          where: {
            createdAt: { lt: cutoffDate },
          },
        });

      case 'role_change_logs':
        return this.prisma.roleChangeLog.count({
          where: {
            createdAt: { lt: cutoffDate },
          },
        });

      default:
        throw new Error(`Unknown table for retention policy: ${policy.tableName}`);
    }
  }

  /**
   * Delete records in batches to avoid locking issues
   */
  private async deleteInBatches(
    policy: RetentionPolicy,
    cutoffDate: Date,
    batchSize: number,
  ): Promise<number> {
    let totalDeleted = 0;
    let batchDeleted = 0;

    do {
      batchDeleted = await this.deleteBatch(policy, cutoffDate, batchSize);
      totalDeleted += batchDeleted;
    } while (batchDeleted > 0); // Continue until no more records are deleted

    return totalDeleted;
  }

  /**
   * Delete a single batch of records
   */
  private async deleteBatch(
    policy: RetentionPolicy,
    cutoffDate: Date,
    batchSize: number,
  ): Promise<number> {
    // Use Prisma transaction to ensure data consistency
    return this.prisma.$transaction(async (tx) => {
      let deletedCount = 0;

      switch (policy.tableName) {
        case 'audit_logs':
          const auditLogs = await tx.auditLog.findMany({
            where: {
              timestamp: { lt: cutoffDate },
            },
            take: batchSize,
            select: { id: true },
          });
          
          if (auditLogs.length > 0) {
            await tx.auditLog.deleteMany({
              where: {
                id: { in: auditLogs.map(log => log.id) },
              },
            });
            deletedCount = auditLogs.length;
          }
          break;

        case 'system_logs':
          const systemLogs = await tx.systemLog.findMany({
            where: {
              timestamp: { lt: cutoffDate },
            },
            take: batchSize,
            select: { id: true },
          });
          
          if (systemLogs.length > 0) {
            await tx.systemLog.deleteMany({
              where: {
                id: { in: systemLogs.map(log => log.id) },
              },
            });
            deletedCount = systemLogs.length;
          }
          break;

        case 'documents':
          const documents = await tx.document.findMany({
            where: {
              AND: [
                { createdAt: { lt: cutoffDate } },
                { expiresAt: { lt: cutoffDate } },
              ],
            },
            take: batchSize,
            select: { id: true },
          });
          
          if (documents.length > 0) {
            await tx.document.deleteMany({
              where: {
                id: { in: documents.map(doc => doc.id) },
              },
            });
            deletedCount = documents.length;
          }
          break;

        case 'transactions':
          const transactions = await tx.transaction.findMany({
            where: {
              createdAt: { lt: cutoffDate },
            },
            take: batchSize,
            select: { id: true },
          });
          
          if (transactions.length > 0) {
            await tx.transaction.deleteMany({
              where: {
                id: { in: transactions.map(tx => tx.id) },
              },
            });
            deletedCount = transactions.length;
          }
          break;

        case 'properties':
          const properties = await tx.property.findMany({
            where: {
              createdAt: { lt: cutoffDate },
            },
            take: batchSize,
            select: { id: true },
          });
          
          if (properties.length > 0) {
            await tx.property.deleteMany({
              where: {
                id: { in: properties.map(prop => prop.id) },
              },
            });
            deletedCount = properties.length;
          }
          break;

        case 'role_change_logs':
          const roleChangeLogs = await tx.roleChangeLog.findMany({
            where: {
              createdAt: { lt: cutoffDate },
            },
            take: batchSize,
            select: { id: true },
          });
          
          if (roleChangeLogs.length > 0) {
            await tx.roleChangeLog.deleteMany({
              where: {
                id: { in: roleChangeLogs.map(log => log.id) },
              },
            });
            deletedCount = roleChangeLogs.length;
          }
          break;

        default:
          throw new Error(`Unknown table for retention policy: ${policy.tableName}`);
      }

      return deletedCount;
    });
  }

  /**
   * Schedule automated cleanup job
   */
  async scheduleCleanup(cronExpression: string = '0 2 * * *'): Promise<void> {
    // In a real implementation, you would integrate with a job scheduler
    // For now, we'll just log that scheduling is requested
    this.logger.log(`Scheduled data cleanup with cron: ${cronExpression}`);
  }

  /**
   * Get statistics about data retention compliance
   */
  async getRetentionStats(): Promise<{
    tableName: string;
    totalRecords: number;
    expiredRecords: number;
    compliancePercentage: number;
  }[]> {
    const stats = [];

    for (const policy of this.defaultPolicies) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

      const [totalRecords, expiredRecords] = await Promise.all([
        this.getTableRecordCount(policy.tableName),
        this.getDeletableRecordCount(policy, cutoffDate),
      ]);

      const compliancePercentage = totalRecords > 0 
        ? ((totalRecords - expiredRecords) / totalRecords) * 100
        : 100;

      stats.push({
        tableName: policy.tableName,
        totalRecords,
        expiredRecords,
        compliancePercentage: parseFloat(compliancePercentage.toFixed(2)),
      });
    }

    return stats;
  }

  /**
   * Get total record count for a table
   */
  private async getTableRecordCount(tableName: string): Promise<number> {
    switch (tableName) {
      case 'audit_logs':
        return this.prisma.auditLog.count();
      case 'system_logs':
        return this.prisma.systemLog.count();
      case 'documents':
        return this.prisma.document.count();
      case 'transactions':
        return this.prisma.transaction.count();
      case 'properties':
        return this.prisma.property.count();
      case 'role_change_logs':
        return this.prisma.roleChangeLog.count();
      default:
        throw new Error(`Unknown table: ${tableName}`);
    }
  }

  /**
   * Force cleanup of a specific record type
   */
  async forceCleanup(
    tableName: string,
    cutoffDate: Date,
    batchSize: number = 1000,
    dryRun: boolean = false,
  ): Promise<number> {
    const policy = this.getPolicy(tableName);
    if (!policy) {
      throw new Error(`No retention policy found for table: ${tableName}`);
    }

    if (dryRun) {
      const count = await this.getDeletableRecordCount(policy, cutoffDate);
      this.logger.log(`[DRY RUN] Would delete ${count} records from ${tableName}`);
      return count;
    }

    const deletedCount = await this.deleteInBatches(policy, cutoffDate, batchSize);
    
    await this.auditService.logAction({
      tableName: 'data_retention',
      operation: AuditOperation.DELETE,
      newData: {
        action: 'FORCE_CLEANUP',
        tableName,
        cutoffDate,
        deletedCount,
      },
    });

    return deletedCount;
  }
}