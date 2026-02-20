import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService, AuditOperation } from './audit.service';
import { DataRetentionService } from './data-retention.service';

export interface ComplianceReport {
  reportId: string;
  reportDate: Date;
  periodStart: Date;
  periodEnd: Date;
  summary: ReportSummary;
  details: ReportDetails;
  recommendations: string[];
}

export interface ReportSummary {
  totalAudits: number;
  totalUsers: number;
  totalProperties: number;
  totalTransactions: number;
  gdprRequests: number;
  securityIncidents: number;
  complianceRate: number;
}

export interface ReportDetails {
  auditTrail: AuditTrailSummary;
  userActivity: UserActivitySummary;
  dataRetention: DataRetentionSummary;
  gdprCompliance: GdprComplianceSummary;
  securityMetrics: SecurityMetricsSummary;
}

export interface AuditTrailSummary {
  totalActions: number;
  createActionCount: number;
  updateActionCount: number;
  deleteActionCount: number;
  readActionCount: number;
  topTables: { tableName: string; count: number }[];
}

export interface UserActivitySummary {
  activeUsers: number;
  newUsers: number;
  roleChanges: number;
  loginAttempts: number;
}

export interface DataRetentionSummary {
  compliantTables: string[];
  nonCompliantTables: string[];
  expiredRecords: number;
}

export interface GdprComplianceSummary {
  dataExports: number;
  deletions: number;
  consentUpdates: number;
  complianceRate: number;
}

export interface SecurityMetricsSummary {
  failedLogins: number;
  suspiciousActivities: number;
  apiKeyUsage: number;
}

@Injectable()
export class ComplianceReportingService {
  private readonly logger = new Logger(ComplianceReportingService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private dataRetentionService: DataRetentionService,
  ) {}

  /**
   * Generate a comprehensive compliance report
   */
  async generateComplianceReport(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ComplianceReport> {
    this.logger.log(
      `Generating compliance report for period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`
    );

    // Get all report components
    const [
      auditTrailSummary,
      userActivitySummary,
      dataRetentionSummary,
      gdprComplianceSummary,
      securityMetricsSummary,
      totalUsers,
      totalProperties,
      totalTransactions,
    ] = await Promise.all([
      this.getAuditTrailSummary(periodStart, periodEnd),
      this.getUserActivitySummary(periodStart, periodEnd),
      this.getDataRetentionSummary(),
      this.getGdprComplianceSummary(periodStart, periodEnd),
      this.getSecurityMetricsSummary(periodStart, periodEnd),
      this.getTotalUsers(),
      this.getTotalProperties(),
      this.getTotalTransactions(),
    ]);

    // Calculate overall compliance rate
    const totalAudits = auditTrailSummary.totalActions;
    const gdprRequests = gdprComplianceSummary.dataExports + 
                        gdprComplianceSummary.deletions + 
                        gdprComplianceSummary.consentUpdates;

    const complianceRate = this.calculateComplianceRate(
      auditTrailSummary,
      gdprComplianceSummary,
      securityMetricsSummary
    );

    const report: ComplianceReport = {
      reportId: `COMPLIANCE-${Date.now()}`,
      reportDate: new Date(),
      periodStart,
      periodEnd,
      summary: {
        totalAudits,
        totalUsers,
        totalProperties,
        totalTransactions,
        gdprRequests,
        securityIncidents: securityMetricsSummary.failedLogins,
        complianceRate,
      },
      details: {
        auditTrail: auditTrailSummary,
        userActivity: userActivitySummary,
        dataRetention: dataRetentionSummary,
        gdprCompliance: gdprComplianceSummary,
        securityMetrics: securityMetricsSummary,
      },
      recommendations: this.generateRecommendations(
        auditTrailSummary,
        gdprComplianceSummary,
        securityMetricsSummary
      ),
    };

    // Log the report generation
    await this.auditService.logAction({
      tableName: 'compliance_reports',
      operation: AuditOperation.CREATE,
      newData: {
        action: 'GENERATE_COMPLIANCE_REPORT',
        reportId: report.reportId,
        periodStart,
        periodEnd,
      },
    });

    return report;
  }

  /**
   * Get audit trail summary for the specified period
   */
  private async getAuditTrailSummary(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<AuditTrailSummary> {
    const audits = await this.prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    const createActionCount = audits.filter(a => a.operation === 'CREATE').length;
    const updateActionCount = audits.filter(a => a.operation === 'UPDATE').length;
    const deleteActionCount = audits.filter(a => a.operation === 'DELETE').length;
    const readActionCount = audits.filter(a => a.operation === 'READ').length;

    // Group by table name
    const tableCounts: { [key: string]: number } = {};
    audits.forEach(audit => {
      if (tableCounts[audit.tableName] === undefined) {
        tableCounts[audit.tableName] = 0;
      }
      tableCounts[audit.tableName]++;
    });

    // Convert to sorted array
    const topTables = Object.entries(tableCounts)
      .map(([tableName, count]) => ({ tableName, count: Number(count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 tables

    return {
      totalActions: audits.length,
      createActionCount,
      updateActionCount,
      deleteActionCount,
      readActionCount,
      topTables,
    };
  }

  /**
   * Get user activity summary for the specified period
   */
  private async getUserActivitySummary(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UserActivitySummary> {
    const [activeUsers, newUsers, roleChanges, loginAttempts] = await Promise.all([
      this.prisma.user.count({
        where: {
          updatedAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
      this.prisma.roleChangeLog.count({
        where: {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
      // Assuming we have a way to track login attempts (maybe in audit logs)
      this.prisma.auditLog.count({
        where: {
          AND: [
            { tableName: 'auth_attempts' },
            { timestamp: { gte: periodStart, lte: periodEnd } },
          ],
        },
      }),
    ]);

    return {
      activeUsers,
      newUsers,
      roleChanges,
      loginAttempts,
    };
  }

  /**
   * Get data retention compliance summary
   */
  private async getDataRetentionSummary(): Promise<DataRetentionSummary> {
    const retentionStats = await this.dataRetentionService.getRetentionStats();

    const compliantTables = retentionStats
      .filter(stat => stat.compliancePercentage >= 95) // 95% or higher is compliant
      .map(stat => stat.tableName);

    const nonCompliantTables = retentionStats
      .filter(stat => stat.compliancePercentage < 95)
      .map(stat => stat.tableName);

    const expiredRecords = retentionStats.reduce(
      (sum, stat) => sum + stat.expiredRecords,
      0
    );

    return {
      compliantTables,
      nonCompliantTables,
      expiredRecords,
    };
  }

  /**
   * Get GDPR compliance summary
   */
  private async getGdprComplianceSummary(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<GdprComplianceSummary> {
    // In a real implementation, these would come from GDPR-specific logs
    // For now, we'll count GDPR-related audit logs
    const [dataExports, deletions, consentUpdates] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          AND: [
            { operation: 'READ' },
            { tableName: 'users' },
            { 
              newData: { 
                path: ['action'], 
                string_contains: 'GDPR_DATA_EXPORT' 
              } 
            },
            { timestamp: { gte: periodStart, lte: periodEnd } },
          ],
        },
      }),
      this.prisma.auditLog.count({
        where: {
          AND: [
            { operation: 'GDPR_DELETE' },
            { timestamp: { gte: periodStart, lte: periodEnd } },
          ],
        },
      }),
      this.prisma.auditLog.count({
        where: {
          AND: [
            { tableName: 'consents' },
            { timestamp: { gte: periodStart, lte: periodEnd } },
          ],
        },
      }),
    ]);

    const totalActions = dataExports + deletions + consentUpdates;
    const complianceRate = totalActions > 0 ? 100 : 0; // If there were GDPR actions, we're compliant

    return {
      dataExports,
      deletions,
      consentUpdates,
      complianceRate,
    };
  }

  /**
   * Get security metrics summary
   */
  private async getSecurityMetricsSummary(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<SecurityMetricsSummary> {
    // These would typically come from security logs
    // For now, we'll use audit logs to approximate
    const [failedLogins, suspiciousActivities, apiKeyUsage] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          AND: [
            { tableName: 'auth' },
            { operation: 'FAILED_LOGIN' },
            { timestamp: { gte: periodStart, lte: periodEnd } },
          ],
        },
      }),
      this.prisma.auditLog.count({
        where: {
          AND: [
            { tableName: 'security' },
            { operation: 'SUSPICIOUS_ACTIVITY' },
            { timestamp: { gte: periodStart, lte: periodEnd } },
          ],
        },
      }),
      this.prisma.apiKey.count({
        where: {
          lastUsedAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
    ]);

    return {
      failedLogins,
      suspiciousActivities,
      apiKeyUsage,
    };
  }

  /**
   * Get total number of users
   */
  private async getTotalUsers(): Promise<number> {
    return this.prisma.user.count();
  }

  /**
   * Get total number of properties
   */
  private async getTotalProperties(): Promise<number> {
    return this.prisma.property.count();
  }

  /**
   * Get total number of transactions
   */
  private async getTotalTransactions(): Promise<number> {
    return this.prisma.transaction.count();
  }

  /**
   * Calculate overall compliance rate
   */
  private calculateComplianceRate(
    auditSummary: AuditTrailSummary,
    gdprSummary: GdprComplianceSummary,
    securitySummary: SecurityMetricsSummary,
  ): number {
    // Base compliance on several factors:
    // 1. Proper audit logging (should have audit logs)
    // 2. GDPR compliance (should handle GDPR requests)
    // 3. Security incidents (lower is better)
    
    let score = 100;

    // Deduct points for lack of audit logs
    if (auditSummary.totalActions === 0) {
      score -= 30; // Significant deduction for no audit logs
    }

    // Deduct points for high security incidents
    if (securitySummary.failedLogins > 100) {
      score -= 20;
    } else if (securitySummary.failedLogins > 50) {
      score -= 10;
    }

    // Deduct points for poor GDPR compliance
    if (gdprSummary.dataExports === 0 && gdprSummary.deletions === 0) {
      score -= 10; // No GDPR requests might indicate poor tracking
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendations based on the report
   */
  private generateRecommendations(
    auditSummary: AuditTrailSummary,
    gdprSummary: GdprComplianceSummary,
    securitySummary: SecurityMetricsSummary,
  ): string[] {
    const recommendations: string[] = [];

    if (auditSummary.totalActions === 0) {
      recommendations.push(
        'Implement comprehensive audit logging for all data changes'
      );
    }

    if (securitySummary.failedLogins > 50) {
      recommendations.push(
        'Review authentication security and implement additional measures'
      );
    }

    if (gdprSummary.dataExports === 0 && gdprSummary.deletions === 0) {
      recommendations.push(
        'Verify GDPR compliance features are properly tracked and logged'
      );
    }

    if (auditSummary.topTables.length > 0) {
      const mostChangedTable = auditSummary.topTables[0];
      if (mostChangedTable.count > 1000) {
        recommendations.push(
          `Consider optimizing access patterns for ${mostChangedTable.tableName} table`
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue current compliance monitoring practices');
    }

    return recommendations;
  }

  /**
   * Export compliance report in various formats
   */
  async exportReport(
    report: ComplianceReport,
    format: 'json' | 'csv' | 'pdf' = 'json',
  ): Promise<string | Buffer> {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      
      case 'csv':
        return this.convertToCsv(report);
      
      case 'pdf':
        return this.convertToPdf(report);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert report to CSV format
   */
  private convertToCsv(report: ComplianceReport): string {
    // This is a simplified CSV conversion
    // In a real implementation, you'd want more sophisticated formatting
    let csv = 'Metric,Value\n';
    csv += `Total Audits,${report.summary.totalAudits}\n`;
    csv += `Total Users,${report.summary.totalUsers}\n`;
    csv += `Total Properties,${report.summary.totalProperties}\n`;
    csv += `Total Transactions,${report.summary.totalTransactions}\n`;
    csv += `GDPR Requests,${report.summary.gdprRequests}\n`;
    csv += `Security Incidents,${report.summary.securityIncidents}\n`;
    csv += `Compliance Rate,${report.summary.complianceRate}%\n`;
    
    return csv;
  }

  /**
   * Convert report to PDF format
   */
  private convertToPdf(report: ComplianceReport): Buffer {
    // This would require a PDF generation library like pdfkit or puppeteer
    // For now, return a placeholder
    return Buffer.from(`Compliance Report\n\nReport ID: ${report.reportId}\nGenerated: ${report.reportDate}\n\n${JSON.stringify(report, null, 2)}`, 'utf-8');
  }

  /**
   * Get compliance trend over time
   */
  async getComplianceTrends(
    startDate: Date,
    endDate: Date,
    interval: 'daily' | 'weekly' | 'monthly' = 'weekly',
  ): Promise<{
    dates: Date[];
    complianceRates: number[];
    auditVolumes: number[];
  }> {
    // This would typically aggregate compliance data over time
    // For now, we'll return mock data showing the concept
    const dates: Date[] = [];
    const complianceRates: number[] = [];
    const auditVolumes: number[] = [];

    // Calculate intervals
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));

      // Mock calculation based on audit volume
      const periodEnd = new Date(currentDate);
      if (interval === 'daily') {
        periodEnd.setDate(periodEnd.getDate() + 1);
      } else if (interval === 'weekly') {
        periodEnd.setDate(periodEnd.getDate() + 7);
      } else { // monthly
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      // Get audit count for this period
      const auditCount = await this.prisma.auditLog.count({
        where: {
          timestamp: {
            gte: currentDate,
            lte: periodEnd,
          },
        },
      });

      auditVolumes.push(auditCount);

      // Calculate compliance rate (mock implementation)
      const complianceRate = auditCount > 100 ? 95 : 85; // Simple mock logic
      complianceRates.push(complianceRate);

      // Move to next interval
      if (interval === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (interval === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else { // monthly
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    return {
      dates,
      complianceRates,
      auditVolumes,
    };
  }
}