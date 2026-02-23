import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true, { message: 'Database connection successful' });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError('Database connection failed', this.getStatus(key, false, { error: errMsg }));
    }
  }
}
