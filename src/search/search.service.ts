import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { SearchCache } from './entities/search-cache.entity';
import { SearchAnalytics } from './entities/search-analytics.entity';
import { SearchQueryDto, SearchResponseDto, SearchResultItemDto, SearchAnalyticsReportDto } from './dto/search.dto';

/** Cache TTL: 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(SearchCache)
    private readonly cacheRepo: Repository<SearchCache>,

    @InjectRepository(SearchAnalytics)
    private readonly analyticsRepo: Repository<SearchAnalytics>,
  ) {}

  async search(dto: SearchQueryDto): Promise<SearchResponseDto> {
    const start = Date.now();
    const normalised = this.normalise(dto.q);
    const queryHash = this.hash(normalised);

    const cached = await this.getCache(queryHash);
    if (cached) {
      const durationMs = Date.now() - start;
      const payload = JSON.parse(cached.payload) as SearchResultItemDto[];
      await this.recordAnalytics(normalised, dto.userAddress, payload.length, durationMs, true);
      return { results: payload, total: payload.length, fromCache: true, durationMs };
    }

    const results = await this.runFullTextSearch(normalised);
    const durationMs = Date.now() - start;

    await this.setCache(queryHash, normalised, results);

    await this.recordAnalytics(normalised, dto.userAddress, results.length, durationMs, false);

    return { results, total: results.length, fromCache: false, durationMs };
  }

  async getAnalyticsReport(since: Date): Promise<SearchAnalyticsReportDto> {
    const topRaw = await this.analyticsRepo
      .createQueryBuilder('a')
      .select('a.query', 'query')
      .addSelect('COUNT(*)', 'count')
      .where('a.createdAt >= :since', { since })
      .groupBy('a.query')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany<{ query: string; count: string }>();

    const stats = await this.analyticsRepo
      .createQueryBuilder('a')
      .select('COUNT(*)', 'total')
      .addSelect('AVG(a.durationMs)', 'avgDuration')
      .addSelect('SUM(CASE WHEN a.cacheHit = true THEN 1 ELSE 0 END)::float / COUNT(*) * 100', 'hitRate')
      .where('a.createdAt >= :since', { since })
      .getRawOne<{ total: string; avgDuration: string; hitRate: string }>();

    return {
      topQueries: topRaw.map(r => ({ query: r.query, count: Number(r.count) })),
      cacheHitRate: parseFloat(stats?.hitRate ?? '0'),
      avgDurationMs: parseFloat(stats?.avgDuration ?? '0'),
      totalSearches: parseInt(stats?.total ?? '0', 10),
    };
  }

  /** Purge expired cache rows. Call from a @Cron job. */
  async purgeExpiredCache(): Promise<number> {
    const result = await this.cacheRepo.delete({ expiresAt: LessThan(new Date()) });
    return result.affected ?? 0;
  }

  /**
   * PostgreSQL full-text search using tsvector / tsquery.
   *
   * Searches both the `calls` table (description, pair_id) and a `users`
   * table (address, username). Adjust table/column names to your schema.
   *
   * Uses plainto_tsquery so raw user input is safe — no injection risk.
   */
  private async runFullTextSearch(query: string): Promise<SearchResultItemDto[]> {
    const results = await this.cacheRepo.manager.query<
      Array<{ id: string; type: string; title: string; description: string; rank: number }>
    >(
      `
      SELECT
        id::text,
        'call'          AS type,
        pair_id::text   AS title,
        LEFT(description, 200) AS description,
        ts_rank(
          to_tsvector('english', COALESCE(description, '') || ' ' || COALESCE(pair_id::text, '')),
          plainto_tsquery('english', $1)
        ) AS rank
      FROM calls
      WHERE to_tsvector('english', COALESCE(description, '') || ' ' || COALESCE(pair_id::text, ''))
        @@ plainto_tsquery('english', $1)

      UNION ALL

      SELECT
        address         AS id,
        'user'          AS type,
        COALESCE(username, address) AS title,
        NULL            AS description,
        ts_rank(
          to_tsvector('simple', address || ' ' || COALESCE(username, '')),
          plainto_tsquery('simple', $1)
        ) AS rank
      FROM users
      WHERE to_tsvector('simple', address || ' ' || COALESCE(username, ''))
        @@ plainto_tsquery('simple', $1)

      ORDER BY rank DESC
      LIMIT 50
      `,
      [query],
    );

    return results.map(r => ({
      id: r.id,
      type: r.type as 'call' | 'user',
      title: r.title,
      description: r.description ?? undefined,
      rank: Number(r.rank),
    }));
  }

  private async getCache(queryHash: string): Promise<SearchCache | null> {
    const entry = await this.cacheRepo.findOne({ where: { queryHash } });
    if (!entry || entry.expiresAt < new Date()) {
      return null;
    }

    this.cacheRepo
      .increment({ queryHash }, 'hitCount', 1)
      .catch(e => this.logger.warn('Cache hit increment failed', e));

    return entry;
  }

  private async setCache(queryHash: string, query: string, results: SearchResultItemDto[]): Promise<void> {
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    await this.cacheRepo
      .createQueryBuilder()
      .insert()
      .into(SearchCache)
      .values({ queryHash, query, payload: JSON.stringify(results), expiresAt })
      .orUpdate(['payload', 'expiresAt', 'hitCount'], ['queryHash'])
      .execute();
  }

  private async recordAnalytics(
    query: string,
    userAddress: string | undefined,
    resultCount: number,
    durationMs: number,
    cacheHit: boolean,
  ): Promise<void> {
    await this.analyticsRepo
      .save({ query, userAddress, resultCount, durationMs, cacheHit })
      .catch(e => this.logger.warn('Failed to record search analytics', e));
  }

  private normalise(q: string): string {
    return q.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private hash(q: string): string {
    return crypto.createHash('sha256').update(q).digest('hex');
  }
}
