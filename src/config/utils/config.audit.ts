import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface ConfigAuditLog {
  id: string;
  timestamp: Date;
  action: 'create' | 'update' | 'delete' | 'rollback' | 'access';
  key?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  versionId?: string;
  description: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ConfigAuditService {
  private readonly logger = new Logger(ConfigAuditService.name);
  private readonly auditDir = './config/audit';
  private readonly maxAuditFiles = 100; // Keep last 100 audit files
  private currentLogFile: string;

  constructor(private readonly configService: ConfigService) {
    this.ensureAuditDirectory();
    this.currentLogFile = this.getCurrentLogFile();
  }

  /**
   * Log configuration access
   */
  async logAccess(key: string, userId?: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.writeAuditLog({
      action: 'access',
      key,
      userId,
      ipAddress,
      userAgent,
      description: `Configuration key ${key} was accessed`,
    });
  }

  /**
   * Log configuration creation
   */
  async logCreate(key: string, value: string, userId?: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.writeAuditLog({
      action: 'create',
      key,
      newValue: this.maskSensitiveValue(key, value),
      userId,
      ipAddress,
      userAgent,
      description: `Configuration key ${key} was created`,
    });
  }

  /**
   * Log configuration update
   */
  async logUpdate(
    key: string,
    oldValue: string,
    newValue: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.writeAuditLog({
      action: 'update',
      key,
      oldValue: this.maskSensitiveValue(key, oldValue),
      newValue: this.maskSensitiveValue(key, newValue),
      userId,
      ipAddress,
      userAgent,
      description: `Configuration key ${key} was updated`,
    });
  }

  /**
   * Log configuration deletion
   */
  async logDelete(
    key: string,
    oldValue: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.writeAuditLog({
      action: 'delete',
      key,
      oldValue: this.maskSensitiveValue(key, oldValue),
      userId,
      ipAddress,
      userAgent,
      description: `Configuration key ${key} was deleted`,
    });
  }

  /**
   * Log configuration rollback
   */
  async logRollback(
    versionId: string,
    changes: Array<{ key: string; oldValue: string; newValue: string }>,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.writeAuditLog({
      action: 'rollback',
      versionId,
      userId,
      ipAddress,
      userAgent,
      description: `Configuration rolled back to version ${versionId}`,
      metadata: {
        changesCount: changes.length,
        changes: changes.map(change => ({
          key: change.key,
          oldValue: this.maskSensitiveValue(change.key, change.oldValue),
          newValue: this.maskSensitiveValue(change.key, change.newValue),
        })),
      },
    });
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(
    options: {
      startDate?: Date;
      endDate?: Date;
      action?: string;
      key?: string;
      userId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ConfigAuditLog[]> {
    const logs: ConfigAuditLog[] = [];
    const auditFiles = this.getAuditFiles();

    for (const file of auditFiles) {
      const fileLogs = await this.readAuditFile(file);

      for (const log of fileLogs) {
        // Apply filters
        if (options.startDate && new Date(log.timestamp) < options.startDate) {
          continue;
        }
        if (options.endDate && new Date(log.timestamp) > options.endDate) {
          continue;
        }
        if (options.action && log.action !== options.action) {
          continue;
        }
        if (options.key && log.key !== options.key) {
          continue;
        }
        if (options.userId && log.userId !== options.userId) {
          continue;
        }

        logs.push(log);
      }
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return logs.slice(offset, offset + limit);
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(): Promise<{
    totalLogs: number;
    actionsCount: Record<string, number>;
    mostAccessedKeys: Array<{ key: string; count: number }>;
    recentActivity: ConfigAuditLog[];
  }> {
    const allLogs = await this.getAuditLogs({ limit: 10000 });

    const actionsCount: Record<string, number> = {};
    const keyAccessCount: Record<string, number> = {};

    for (const log of allLogs) {
      // Count actions
      actionsCount[log.action] = (actionsCount[log.action] || 0) + 1;

      // Count key access
      if (log.key) {
        keyAccessCount[log.key] = (keyAccessCount[log.key] || 0) + 1;
      }
    }

    // Get most accessed keys
    const mostAccessedKeys = Object.entries(keyAccessCount)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get recent activity (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivity = allLogs.filter(log => new Date(log.timestamp) > oneDayAgo).slice(0, 50);

    return {
      totalLogs: allLogs.length,
      actionsCount,
      mostAccessedKeys,
      recentActivity,
    };
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    outputPath: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      format?: 'json' | 'csv';
    } = {},
  ): Promise<void> {
    const logs = await this.getAuditLogs(options);
    const format = options.format || 'json';

    if (format === 'csv') {
      const csv = this.convertToCSV(logs);
      fs.writeFileSync(outputPath, csv);
    } else {
      const json = JSON.stringify(logs, null, 2);
      fs.writeFileSync(outputPath, json);
    }

    this.logger.log(`Exported ${logs.length} audit logs to ${outputPath}`);
  }

  /**
   * Write audit log
   */
  private async writeAuditLog(logData: Omit<ConfigAuditLog, 'id' | 'timestamp'>): Promise<void> {
    const log: ConfigAuditLog = {
      id: this.generateLogId(),
      timestamp: new Date(),
      ...logData,
    };

    const logEntry = `${JSON.stringify(log)}\n`;
    fs.appendFileSync(this.currentLogFile, logEntry);

    // Rotate log file if it gets too large
    await this.rotateLogFileIfNeeded();
  }

  /**
   * Read audit file
   */
  private async readAuditFile(filePath: string): Promise<ConfigAuditLog[]> {
    const logs: ConfigAuditLog[] = [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const log = JSON.parse(line) as ConfigAuditLog;
          log.timestamp = new Date(log.timestamp);
          logs.push(log);
        } catch (error) {
          this.logger.warn(`Failed to parse audit log line: ${line}`);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to read audit file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    return logs;
  }

  /**
   * Get audit files
   */
  private getAuditFiles(): string[] {
    try {
      const files = fs.readdirSync(this.auditDir);
      return files
        .filter(file => file.startsWith('audit-') && file.endsWith('.log'))
        .map(file => path.join(this.auditDir, file))
        .sort()
        .reverse(); // Newest first
    } catch (error) {
      this.logger.warn('Failed to read audit directory:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * Get current log file
   */
  private getCurrentLogFile(): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.auditDir, `audit-${today}.log`);
  }

  /**
   * Ensure audit directory exists
   */
  private ensureAuditDirectory(): void {
    if (!fs.existsSync(this.auditDir)) {
      fs.mkdirSync(this.auditDir, { recursive: true });
    }
  }

  /**
   * Generate log ID
   */
  private generateLogId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Mask sensitive values
   */
  private maskSensitiveValue(key: string, value: string): string {
    const sensitiveKeys = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'PRIVATE_KEY',
      'REDIS_PASSWORD',
      'SESSION_SECRET',
      'SMTP_PASS',
      'API_KEY',
      'ETHERSCAN_API_KEY',
      'WEB3_STORAGE_TOKEN',
      'IPFS_PROJECT_SECRET',
      'S3_SECRET_ACCESS_KEY',
    ];

    if (sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
      if (value && value.length > 8) {
        return `${value.substring(0, 4)}${'*'.repeat(value.length - 8)}${value.substring(value.length - 4)}`;
      } else if (value) {
        return '****';
      }
    }

    return value;
  }

  /**
   * Rotate log file if needed
   */
  private async rotateLogFileIfNeeded(): Promise<void> {
    try {
      const stats = fs.statSync(this.currentLogFile);
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (stats.size > maxSize) {
        // Create a new log file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const newLogFile = path.join(this.auditDir, `audit-${timestamp}.log`);
        fs.renameSync(this.currentLogFile, newLogFile);

        // Update current log file
        this.currentLogFile = this.getCurrentLogFile();

        // Clean up old files
        await this.cleanupOldAuditFiles();
      }
    } catch (error) {
      this.logger.warn('Failed to rotate audit log file:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Clean up old audit files
   */
  private async cleanupOldAuditFiles(): Promise<void> {
    const files = this.getAuditFiles();

    if (files.length <= this.maxAuditFiles) {
      return;
    }

    const filesToDelete = files.slice(this.maxAuditFiles);

    for (const file of filesToDelete) {
      try {
        fs.unlinkSync(file);
        this.logger.debug(`Deleted old audit file: ${file}`);
      } catch (error) {
        this.logger.warn(
          `Failed to delete audit file ${file}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    this.logger.log(`Cleaned up ${filesToDelete.length} old audit files`);
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: ConfigAuditLog[]): string {
    const headers = [
      'ID',
      'Timestamp',
      'Action',
      'Key',
      'Old Value',
      'New Value',
      'User ID',
      'IP Address',
      'User Agent',
      'Version ID',
      'Description',
    ];

    const rows = logs.map(log => [
      log.id,
      log.timestamp.toISOString(),
      log.action,
      log.key || '',
      log.oldValue || '',
      log.newValue || '',
      log.userId || '',
      log.ipAddress || '',
      log.userAgent || '',
      log.versionId || '',
      log.description,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');

    return csvContent;
  }
}
