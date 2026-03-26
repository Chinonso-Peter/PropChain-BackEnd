import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('search_analytics')
export class SearchAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  query: string;

  @Column({ nullable: true })
  userAddress?: string;

  @Column({ default: 0 })
  resultCount: number;

  /** How long the search took in milliseconds */
  @Column({ default: 0 })
  durationMs: number;

  /** Whether the result was served from cache */
  @Column({ default: false })
  cacheHit: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
