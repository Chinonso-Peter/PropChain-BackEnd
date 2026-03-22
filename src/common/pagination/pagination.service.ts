import { Injectable } from '@nestjs/common';
import { PaginationQueryDto, PaginationMetadataDto, PaginatedResponseDto } from './pagination.dto';

/**
 * Interface for paginated data sources
 */
export interface IPaginatedData<T> {
  data: T[];
  total: number;
}

@Injectable()
export class PaginationService {
  private readonly defaultPage = 1;
  private readonly defaultLimit = 10;
  private readonly maxLimit = 100;
  private readonly minLimit = 1;

  /**
   * Calculate skip/take for DB queries
   */
  calculatePagination(page: number = this.defaultPage, limit: number = this.defaultLimit) {
    const validPage = Math.max(page, this.defaultPage);
    const validLimit = Math.max(Math.min(limit, this.maxLimit), this.minLimit);

    return {
      skip: (validPage - 1) * validLimit,
      take: validLimit,
    };
  }

  /**
   * Sanitize sort field to avoid injection
   * Allows alphanumeric, underscore, and dot
   */
  sanitizeSortField(field?: string): string {
    if (!field) {
      return 'createdAt';
    }

    return field.replace(/[^a-zA-Z0-9_.]/g, '');
  }

  /**
   * Parse and normalize pagination query
   */
  parsePaginationQuery(query: Partial<PaginationQueryDto>) {
    const page = query.page ?? this.defaultPage;
    const limit = query.limit ?? this.defaultLimit;

    return {
      page: Math.max(page, this.defaultPage),
      limit: Math.max(Math.min(limit, this.maxLimit), this.minLimit),
      sortBy: this.sanitizeSortField(query.sortBy),
      sortOrder: query.sortOrder ?? 'desc',
    };
  }

  /**
   * Create pagination metadata
   */
  createMetadata(
    total: number,
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): PaginationMetadataDto {
    const pages = Math.max(Math.ceil(total / limit), 1);

    return {
      total,
      page,
      limit,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
      sortBy,
      sortOrder,
    };
  }

  /**
   * Validate if requested page exists
   */
  validatePage(page: number, total: number, limit: number): boolean {
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    return page >= 1 && page <= totalPages;
  }

  /**
   * Format paginated API response
   */
  formatResponse<T>(data: T[], total: number, query: PaginationQueryDto): PaginatedResponseDto<T> {
    const { page, limit, sortBy, sortOrder } = this.parsePaginationQuery(query);

    return {
      data,
      meta: this.createMetadata(total, page, limit, sortBy, sortOrder),
    };
  }

  /**
   * Build Prisma pagination options
   */
  getPrismaOptions(query: PaginationQueryDto, fallbackSortField = 'createdAt') {
    const { page, limit, sortBy, sortOrder } = this.parsePaginationQuery(query);

    const { skip, take } = this.calculatePagination(page, limit);

    return {
      skip,
      take,
      orderBy: {
        [sortBy || fallbackSortField]: sortOrder,
      },
    };
  }

  // Backward compatibility wrappers used in existing tests
  getSkip(page: number, limit: number): number {
    return this.calculatePagination(page, limit).skip;
  }

  createMeta(total: number, page: number, limit: number) {
    const metadata = this.createMetadata(total, page, limit);
    return metadata;
  }

  createResponse<T>(data: T[], total: number, paginationDto: PaginationQueryDto) {
    return this.formatResponse(data, total, paginationDto);
  }
}
