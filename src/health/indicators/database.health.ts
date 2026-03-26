import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    try {
      // Test basic connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Get connection pool info
      const poolInfo = await this.getConnectionPoolInfo();
      
      // Test table access
      const tableCount = await this.getTableCount();
      
      const responseTime = Date.now() - startTime;
      
      const details = {
        responseTime: `${responseTime}ms`,
        connectionPool: poolInfo,
        tableCount,
        timestamp: new Date().toISOString(),
        message: 'Database connection successful',
      };

      return this.getStatus(key, true, details);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      throw new HealthCheckError(
        'Database connection failed',
        this.getStatus(key, false, {
          error: error.message,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  private async getConnectionPoolInfo(): Promise<any> {
    try {
      // This would need to be adapted based on your database setup
      // For PostgreSQL, you could query pg_stat_activity
      const result = await this.prisma.$queryRaw`
        SELECT count(*) as active_connections 
        FROM pg_stat_activity 
        WHERE state = 'active'
      `;
      return result;
    } catch (error) {
      return { error: 'Could not fetch pool info', details: error.message };
    }
  }

  private async getTableCount(): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT count(*) as table_count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;
      return Number(result[0]?.table_count || 0);
    } catch (error) {
      return 0;
    }
  }
}
