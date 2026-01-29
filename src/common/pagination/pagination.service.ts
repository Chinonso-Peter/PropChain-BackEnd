import { Injectable } from '@nestjs/common';
import { PaginationQueryDto, PaginationMetadataDto, PaginatedResponseDto } from './pagination.dto';

/**
 * Interface for items that may be paginated
 */
export interface IPaginatedData<T> {
  data: T[];
  total: number;
}

/**
 * Configuration options for pagination
 */
export interface PaginationOptions {
  defaultPage?: number;
  defaultLimit?: number;
  maxLimit?: number;
  minLimit?: number;
}

@Injectable()
export class PaginationService {
  private readonly defaultPage = 1;
  private readonly defaultLimit = 10;
  private readonly maxLimit = 100;
  private readonly minLimit = 1;

  constructor(options?: PaginationOptions) {
    if (options?.defaultPage) {
      Object.defineProperty(this, 'defaultPage', {
        value: options.defaultPage,
        writable: false,
      });
    }
    if (options?.defaultLimit) {
      Object.defineProperty(this, 'defaultLimit', {
        value: options.defaultLimit,
        writable: false,
      });
    }
    if (options?.maxLimit) {
      Object.defineProperty(this, 'maxLimit', {
        value: options.maxLimit,
        writable: false,
      });
    }
    if (options?.minLimit) {
      Object.defineProperty(this, 'minLimit', {
        value: options.minLimit,
        writable: false,
      });
    }
  }

  /**
   * Calculate pagination offset and limit
   * @param page Page number (1-indexed)
   * @param limit Items per page
   * @returns Object with skip (offset) and take (limit)
   */
  calculatePagination(page: number = this.defaultPage, limit: number = this.defaultLimit) {
    const validPage = Math.max(page, this.defaultPage);
    const validLimit = Math.max(Math.min(limit, this.maxLimit), this.minLimit);
    const skip = (validPage - 1) * validLimit;

    return { skip, take: validLimit };
  }

  /**
   * Create pagination metadata
   * @param total Total number of items
   * @param page Current page
   * @param limit Items per page
   * @param sortBy Field being sorted by
   * @param sortOrder Sort direction
   * @returns Pagination metadata
   */
  createMetadata(
    total: number,
    page: number = this.defaultPage,
    limit: number = this.defaultLimit,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): PaginationMetadataDto {
    const validPage = Math.max(page, this.defaultPage);
    const validLimit = Math.max(Math.min(limit, this.maxLimit), this.minLimit);
    const pages = Math.ceil(total / validLimit);

    return {
      total,
      page: validPage,
      limit: validLimit,
      pages,
      hasNext: validPage < pages,
      hasPrev: validPage > 1,
      sortBy,
      sortOrder,
    };
  }

  /**
   * Format a paginated response
   * @param data Items to return
   * @param total Total number of items
   * @param paginationQuery Query parameters
   * @returns Formatted paginated response
   */
  formatResponse<T>(
    data: T[],
    total: number,
    paginationQuery: PaginationQueryDto,
  ): PaginatedResponseDto<T> {
    const page = paginationQuery.page || this.defaultPage;
    const limit = paginationQuery.limit || this.defaultLimit;
    const sortBy = paginationQuery.sortBy || 'createdAt';
    const sortOrder = paginationQuery.sortOrder || 'desc';

    const meta = this.createMetadata(total, page, limit, sortBy, sortOrder);

    return {
      data,
      meta,
    };
  }

  /**
   * Parse pagination query and return validated values
   * @param query Pagination query DTO
   * @returns Validated pagination values
   */
  parsePaginationQuery(query: Partial<PaginationQueryDto>) {
    const page = query.page || this.defaultPage;
    const limit = query.limit || this.defaultLimit;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    return {
      page: Math.max(page, this.defaultPage),
      limit: Math.max(Math.min(limit, this.maxLimit), this.minLimit),
      sortBy,
      sortOrder,
    };
  }

  /**
   * Get Prisma query options from pagination query
   * Useful for Prisma clients
   * @param query Pagination query DTO
   * @returns Object with skip, take, orderBy for Prisma
   */
  getPrismaOptions(query: PaginationQueryDto, orderByField: string = 'createdAt') {
    const { page, limit, sortBy, sortOrder } = this.parsePaginationQuery(query);
    const { skip, take } = this.calculatePagination(page, limit);

    return {
      skip,
      take,
      orderBy: {
        [sortBy || orderByField]: sortOrder,
      },
    };
  }
}
