import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ description: 'Search term', minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  q: string;

  @ApiPropertyOptional({ description: 'Wallet address of the searching user' })
  @IsString()
  @IsOptional()
  userAddress?: string;
}

export class SearchResultItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['call', 'user'] })
  type: 'call' | 'user';

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ description: 'Full-text search rank score' })
  rank: number;
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultItemDto] })
  results: SearchResultItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty({ description: 'Whether the result was served from cache' })
  fromCache: boolean;

  @ApiProperty({ description: 'Query duration in ms' })
  durationMs: number;
}

export class SearchAnalyticsReportDto {
  @ApiProperty({ description: 'Top 20 queries by frequency' })
  topQueries: { query: string; count: number }[];

  @ApiProperty({ description: 'Cache hit rate as a percentage' })
  cacheHitRate: number;

  @ApiProperty({ description: 'Average search duration in ms' })
  avgDurationMs: number;

  @ApiProperty({ description: 'Total searches in the period' })
  totalSearches: number;
}
