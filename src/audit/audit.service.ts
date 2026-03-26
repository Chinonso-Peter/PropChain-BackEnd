import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

export interface AuditEntry {
  action: AuditAction;
  actorAddress?: string;
  targetId?: string;
  targetType?: string;
  diff?: Record<string, unknown>;
  requestMeta?: Record<string, unknown>;
}

export interface AuditReportFilters {
  from: Date;
  to: Date;
  action?: AuditAction;
  actorAddress?: string;
  targetType?: string;
}

export interface AuditReportRow {
  action: string;
  count: number;
}

export interface AuditReport {
  totalEvents: number;
  byAction: AuditReportRow[];
  byActor: { actorAddress: string; count: number }[];
  retentionDays: number;
}

/** How long audit rows are retained — configurable per environment */
const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  // ─── Write ─────────────────────────────────────────────────────────────────

  /**
   * Record an audit event. Fire-and-forget safe — errors are logged but
   * never bubble up to the caller so a logging failure never breaks a
   * business operation.
   */
  async log(entry: AuditEntry): Promise<void> {
    await this.auditRepo.save(entry).catch(err => this.logger.error('Failed to write audit log', err));
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  async findAll(filters: AuditReportFilters, page = 1, limit = 50): Promise<{ data: AuditLog[]; total: number }> {
    const where: Record<string, unknown> = {
      createdAt: Between(filters.from, filters.to),
    };
    if (filters.action) {
      where['action'] = filters.action;
    }
    if (filters.actorAddress) {
      where['actorAddress'] = filters.actorAddress;
    }
    if (filters.targetType) {
      where['targetType'] = filters.targetType;
    }

    const [data, total] = await this.auditRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  // ─── Reporting ──────────────────────────────────────────────────────────────

  async generateReport(filters: AuditReportFilters): Promise<AuditReport> {
    const base = this.auditRepo
      .createQueryBuilder('a')
      .where('a.createdAt BETWEEN :from AND :to', { from: filters.from, to: filters.to });

    if (filters.action) {
      base.andWhere('a.action = :action', { action: filters.action });
    }
    if (filters.actorAddress) {
      base.andWhere('a.actorAddress = :actorAddress', { actorAddress: filters.actorAddress });
    }
    if (filters.targetType) {
      base.andWhere('a.targetType = :targetType', { targetType: filters.targetType });
    }

    const [byAction, byActor, totalRaw] = await Promise.all([
      base
        .clone()
        .select('a.action', 'action')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.action')
        .orderBy('count', 'DESC')
        .getRawMany<{ action: string; count: string }>(),

      base
        .clone()
        .select('a.actorAddress', 'actorAddress')
        .addSelect('COUNT(*)', 'count')
        .where('a.actorAddress IS NOT NULL')
        .andWhere('a.createdAt BETWEEN :from AND :to', { from: filters.from, to: filters.to })
        .groupBy('a.actorAddress')
        .orderBy('count', 'DESC')
        .limit(20)
        .getRawMany<{ actorAddress: string; count: string }>(),

      base.clone().select('COUNT(*)', 'total').getRawOne<{ total: string }>(),
    ]);

    return {
      totalEvents: parseInt(totalRaw?.total ?? '0', 10),
      byAction: byAction.map(r => ({ action: r.action, count: Number(r.count) })),
      byActor: byActor.map(r => ({ actorAddress: r.actorAddress, count: Number(r.count) })),
      retentionDays: RETENTION_DAYS,
    };
  }

  // ─── Retention ──────────────────────────────────────────────────────────────

  /**
   * Delete audit rows older than RETENTION_DAYS.
   * Called by a @Cron job in the module — runs nightly.
   */
  async applyRetentionPolicy(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const result = await this.auditRepo.delete({ createdAt: LessThan(cutoff) });
    const deleted = result.affected ?? 0;

    if (deleted > 0) {
      this.logger.log(`Audit retention: deleted ${deleted} records older than ${RETENTION_DAYS} days`);
      // Record the purge itself so there's a meta-audit trail
      await this.log({
        action: AuditAction.CALL_SETTLED, // re-use closest action or add AUDIT_PURGE to the enum
        targetType: 'audit_log',
        diff: { deletedCount: deleted, cutoffDate: cutoff.toISOString() },
      });
    }

    return deleted;
  }
}
