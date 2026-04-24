import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  AddFraudInvestigationNoteDto,
  AdminUpdateUserDto,
  AdminUsersQueryDto,
  BlockFraudUserDto,
  BulkModerationAction,
  BulkModerationDto,
  FraudAlertsQueryDto,
  ModerationQueueQueryDto,
  ReviewFraudAlertDto,
  TransactionMonitoringQueryDto,
} from './dto/admin.dto';
import { PropertyStatus } from '../types/prisma.types';
import { FraudService } from '../fraud/fraud.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudService: FraudService,
  ) {}

  async getDashboard() {
    const [totalUsers, blockedUsers, totalProperties, pendingProperties, activeProperties] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isBlocked: true } }),
        this.prisma.property.count(),
        this.prisma.property.count({ where: { status: PropertyStatus.PENDING } }),
        this.prisma.property.count({ where: { status: PropertyStatus.ACTIVE } }),
      ]);

    const [
      completedTransactions,
      pendingTransactions,
      failedTransactions,
      salesAggregate,
      rentAggregate,
    ] = await Promise.all([
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      this.prisma.transaction.count({ where: { status: 'PENDING' } }),
      this.prisma.transaction.count({ where: { status: 'FAILED' } }),
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED', type: 'SALE' },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED', type: 'TRANSFER' },
        _sum: { amount: true },
      }),
    ]);

    return {
      userStats: {
        totalUsers,
        blockedUsers,
        activeUsers: totalUsers - blockedUsers,
      },
      propertyStats: {
        totalProperties,
        pendingProperties,
        activeProperties,
      },
      revenueMetrics: {
        totalSalesRevenue: salesAggregate._sum.amount ?? 0,
        totalTransferRevenue: rentAggregate._sum.amount ?? 0,
      },
      systemHealth: {
        completedTransactions,
        pendingTransactions,
        failedTransactions,
      },
    };
  }

  async listUsers(query: AdminUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      role: query.role,
      OR: query.search
        ? [
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
          ]
        : undefined,
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isVerified: true,
          isBlocked: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { total, page, limit, items };
  }

  async updateUser(userId: string, payload: AdminUpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: payload,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isVerified: true,
        isBlocked: true,
        updatedAt: true,
      },
    });
  }

  async setUserBlockedState(userId: string, blocked: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked: blocked },
      select: {
        id: true,
        email: true,
        isBlocked: true,
      },
    });
  }

  async getModerationQueue(query: ModerationQueueQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      status: query.status ?? PropertyStatus.PENDING,
    };

    const [items, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return { total, page, limit, items };
  }

  async approveProperty(propertyId: string) {
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { status: PropertyStatus.ACTIVE },
    });
  }

  async rejectProperty(propertyId: string) {
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { status: PropertyStatus.ARCHIVED },
    });
  }

  async flagProperty(propertyId: string, reason?: string) {
    const property = await this.prisma.property.update({
      where: { id: propertyId },
      data: { status: PropertyStatus.ARCHIVED },
    });

    await this.prisma.activityLog.create({
      data: {
        userId: property.ownerId,
        action: 'PROPERTY_FLAGGED_BY_ADMIN',
        entityType: 'PROPERTY',
        entityId: property.id,
        description: reason ?? 'Property flagged by admin for moderation review.',
      },
    });

    return property;
  }

  async bulkModerate(payload: BulkModerationDto) {
    const status =
      payload.action === BulkModerationAction.APPROVE
        ? PropertyStatus.ACTIVE
        : PropertyStatus.ARCHIVED;

    const result = await this.prisma.property.updateMany({
      where: { id: { in: payload.propertyIds } },
      data: { status },
    });

    if (payload.action === BulkModerationAction.FLAG) {
      const properties = await this.prisma.property.findMany({
        where: { id: { in: payload.propertyIds } },
        select: { id: true, ownerId: true },
      });

      await this.prisma.activityLog.createMany({
        data: properties.map((property) => ({
          userId: property.ownerId,
          action: 'PROPERTY_FLAGGED_BY_ADMIN',
          entityType: 'PROPERTY',
          entityId: property.id,
          description: payload.reason ?? 'Property flagged by admin via bulk moderation.',
        })),
      });
    }

    return {
      updatedCount: result.count,
      action: payload.action,
    };
  }

  async monitorTransactions(query: TransactionMonitoringQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      status: query.status,
      type: query.type,
      propertyId: query.propertyId,
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: { id: true, title: true, address: true },
          },
          buyer: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          seller: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { total, page, limit, items };
  }

  async transactionMonitoringSummary() {
    const [pending, completed, cancelled, failed, aggregateValue] = await Promise.all([
      this.prisma.transaction.count({ where: { status: 'PENDING' } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      this.prisma.transaction.count({ where: { status: 'CANCELLED' } }),
      this.prisma.transaction.count({ where: { status: 'FAILED' } }),
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      pending,
      completed,
      cancelled,
      failed,
      totalCompletedValue: aggregateValue._sum.amount ?? 0,
    };
  }

  async listFraudAlerts(query: FraudAlertsQueryDto) {
    return this.fraudService.listAlerts(query);
  }

  async getFraudAlertsSummary() {
    return this.fraudService.getAlertSummary();
  }

  async getFraudAlertDetails(alertId: string) {
    return this.fraudService.getAlertDetails(alertId);
  }

  async reviewFraudAlert(alertId: string, payload: ReviewFraudAlertDto, actorId: string) {
    return this.fraudService.reviewAlert(alertId, payload, actorId);
  }

  async addFraudAlertNote(alertId: string, payload: AddFraudInvestigationNoteDto, actorId: string) {
    return this.fraudService.addInvestigationNote(alertId, payload, actorId);
  }

  async blockFraudUser(alertId: string, actorId: string, payload?: BlockFraudUserDto) {
    return this.fraudService.blockUserFromAlert(alertId, actorId, payload);
  }

  async scanUserForFraud(userId: string, actorId: string) {
    return this.fraudService.runUserScan(userId, actorId);
  }

  async scanPropertyForFraud(propertyId: string, actorId: string) {
    return this.fraudService.runPropertyScan(propertyId, actorId);
  }
}
