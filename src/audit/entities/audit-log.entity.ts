import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditAction {
  // Auth
  LOGIN = 'AUTH_LOGIN',
  LOGOUT = 'AUTH_LOGOUT',
  // Users
  USER_UPDATED = 'USER_UPDATED',
  USER_FOLLOWED = 'USER_FOLLOWED',
  USER_UNFOLLOWED = 'USER_UNFOLLOWED',
  // Calls
  CALL_CREATED = 'CALL_CREATED',
  CALL_RESOLVED = 'CALL_RESOLVED',
  CALL_SETTLED = 'CALL_SETTLED',
  // Stakes
  STAKE_PLACED = 'STAKE_PLACED',
  ESCROW_RELEASED = 'ESCROW_RELEASED',
  // Admin
  ADMIN_CHANGED = 'ADMIN_CHANGED',
  FEE_CHANGED = 'FEE_CHANGED',
  OUTCOME_MANAGER_CHANGED = 'OUTCOME_MANAGER_CHANGED',
}

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  /** The wallet address or system identity performing the action */
  @Index()
  @Column({ nullable: true })
  actorAddress?: string;

  /** The entity being acted upon (e.g. call ID, user address) */
  @Index()
  @Column({ nullable: true })
  targetId?: string;

  /** Entity type: 'call' | 'user' | 'stake' | 'contract' */
  @Column({ nullable: true })
  targetType?: string;

  /** JSON snapshot of what changed — { before, after } */
  @Column({ type: 'jsonb', nullable: true })
  diff?: Record<string, unknown>;

  /** HTTP request metadata — IP, user-agent, etc. */
  @Column({ type: 'jsonb', nullable: true })
  requestMeta?: Record<string, unknown>;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
