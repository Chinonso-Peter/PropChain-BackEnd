import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('search_cache')
export class SearchCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** SHA-256 of the normalised query string */
  @Index({ unique: true })
  @Column()
  queryHash: string;

  @Column()
  query: string;

  /** Serialised JSON result payload */
  @Column('text')
  payload: string;

  /** Number of times this cache entry has been served */
  @Column({ default: 0 })
  hitCount: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
