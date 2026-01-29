import { IsInt, IsOptional, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query parameters for pagination
 */
export class PaginationQueryDto {
  @ApiProperty({
    description: 'Page number (1-indexed)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    description: 'Field to sort by',
    example: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order: asc or desc',
    example: 'desc',
    required: false,
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/**
 * Pagination metadata included in list responses
 */
export class PaginationMetadataDto {
  @ApiProperty({
    description: 'Total number of items',
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Items per page',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 10,
  })
  pages: number;

  @ApiProperty({
    description: 'Whether there is a next page',
    example: true,
  })
  hasNext: boolean;

  @ApiProperty({
    description: 'Whether there is a previous page',
    example: false,
  })
  hasPrev: boolean;

  @ApiProperty({
    description: 'Field sorted by',
    example: 'createdAt',
  })
  sortBy: string;

  @ApiProperty({
    description: 'Sort direction',
    example: 'desc',
  })
  sortOrder: 'asc' | 'desc';
}

/**
 * Generic paginated response wrapper
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({
    description: 'Array of items',
  })
  data: T[];

  @ApiProperty({
    description: 'Pagination metadata',
  })
  meta: PaginationMetadataDto;
}
