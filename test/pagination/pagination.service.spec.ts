import { Test, TestingModule } from '@nestjs/testing';
import { PaginationService } from '../../src/common/pagination/pagination.service';
import { PaginationQueryDto } from '../../src/common/pagination/pagination.dto';

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaginationService],
    }).compile();

    service = module.get<PaginationService>(PaginationService);
  });

  describe('calculatePagination', () => {
    it('should calculate correct offset and limit for first page', () => {
      const result = service.calculatePagination(1, 10);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(10);
    });

    it('should calculate correct offset for page 2', () => {
      const result = service.calculatePagination(2, 10);
      expect(result.skip).toBe(10);
      expect(result.take).toBe(10);
    });

    it('should calculate correct offset for page 5', () => {
      const result = service.calculatePagination(5, 20);
      expect(result.skip).toBe(80);
      expect(result.take).toBe(20);
    });

    it('should enforce maximum limit', () => {
      const result = service.calculatePagination(1, 200);
      expect(result.take).toBe(100); // max limit
    });

    it('should enforce minimum limit', () => {
      const result = service.calculatePagination(1, 0);
      expect(result.take).toBe(1); // min limit
    });

    it('should handle negative page numbers', () => {
      const result = service.calculatePagination(-5, 10);
      expect(result.skip).toBe(0); // defaults to page 1
    });

    it('should use defaults when no parameters provided', () => {
      const result = service.calculatePagination();
      expect(result.skip).toBe(0);
      expect(result.take).toBe(10);
    });
  });

  describe('createMetadata', () => {
    it('should calculate correct pagination metadata for first page', () => {
      const metadata = service.createMetadata(100, 1, 10);
      expect(metadata.total).toBe(100);
      expect(metadata.page).toBe(1);
      expect(metadata.limit).toBe(10);
      expect(metadata.pages).toBe(10);
      expect(metadata.hasNext).toBe(true);
      expect(metadata.hasPrev).toBe(false);
    });

    it('should calculate correct metadata for middle page', () => {
      const metadata = service.createMetadata(100, 5, 10);
      expect(metadata.page).toBe(5);
      expect(metadata.hasNext).toBe(true);
      expect(metadata.hasPrev).toBe(true);
    });

    it('should calculate correct metadata for last page', () => {
      const metadata = service.createMetadata(100, 10, 10);
      expect(metadata.page).toBe(10);
      expect(metadata.hasNext).toBe(false);
      expect(metadata.hasPrev).toBe(true);
    });

    it('should handle single page result', () => {
      const metadata = service.createMetadata(5, 1, 10);
      expect(metadata.pages).toBe(1);
      expect(metadata.hasNext).toBe(false);
      expect(metadata.hasPrev).toBe(false);
    });

    it('should handle exact page boundary', () => {
      const metadata = service.createMetadata(50, 5, 10);
      expect(metadata.pages).toBe(5);
      expect(metadata.hasNext).toBe(false);
    });

    it('should include sort information', () => {
      const metadata = service.createMetadata(100, 1, 10, 'name', 'asc');
      expect(metadata.sortBy).toBe('name');
      expect(metadata.sortOrder).toBe('asc');
    });

    it('should use default sort values', () => {
      const metadata = service.createMetadata(100);
      expect(metadata.sortBy).toBe('createdAt');
      expect(metadata.sortOrder).toBe('desc');
    });
  });

  describe('formatResponse', () => {
    it('should format response with data and metadata', () => {
      const data = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }];
      const query: PaginationQueryDto = { page: 1, limit: 10 };

      const response = service.formatResponse(data, 100, query);

      expect(response.data).toEqual(data);
      expect(response.meta.total).toBe(100);
      expect(response.meta.page).toBe(1);
      expect(response.meta.limit).toBe(10);
    });

    it('should handle empty data array', () => {
      const query: PaginationQueryDto = { page: 1, limit: 10 };
      const response = service.formatResponse([], 0, query);

      expect(response.data).toEqual([]);
      expect(response.meta.total).toBe(0);
      expect(response.meta.pages).toBe(0);
    });

    it('should preserve sort parameters in response', () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, sortBy: 'email', sortOrder: 'asc' };
      const response = service.formatResponse([], 10, query);

      expect(response.meta.sortBy).toBe('email');
      expect(response.meta.sortOrder).toBe('asc');
    });
  });

  describe('parsePaginationQuery', () => {
    it('should parse valid pagination query', () => {
      const query: Partial<PaginationQueryDto> = { page: 2, limit: 20, sortBy: 'name' };
      const parsed = service.parsePaginationQuery(query);

      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(20);
      expect(parsed.sortBy).toBe('name');
    });

    it('should apply defaults for missing values', () => {
      const parsed = service.parsePaginationQuery({});

      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(10);
      expect(parsed.sortBy).toBe('createdAt');
      expect(parsed.sortOrder).toBe('desc');
    });

    it('should enforce limits on values', () => {
      const query: Partial<PaginationQueryDto> = { page: -5, limit: 500 };
      const parsed = service.parsePaginationQuery(query);

      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(100);
    });
  });

  describe('getPrismaOptions', () => {
    it('should generate correct Prisma query options', () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' };
      const options = service.getPrismaOptions(query);

      expect(options.skip).toBe(0);
      expect(options.take).toBe(10);
      expect(options.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should use default orderByField when not specified in query', () => {
      const query: PaginationQueryDto = { page: 1, limit: 10 };
      const options = service.getPrismaOptions(query, 'updatedAt');

      expect(options.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should handle custom sort field', () => {
      const query: PaginationQueryDto = { page: 1, limit: 10, sortBy: 'name', sortOrder: 'asc' };
      const options = service.getPrismaOptions(query, 'createdAt');

      expect(options.orderBy).toEqual({ name: 'asc' });
    });

    it('should calculate correct skip and take for page 3', () => {
      const query: PaginationQueryDto = { page: 3, limit: 25 };
      const options = service.getPrismaOptions(query);

      expect(options.skip).toBe(50);
      expect(options.take).toBe(25);
    });
  });

  describe('validation', () => {
    it('should handle very large page numbers', () => {
      const result = service.calculatePagination(999999, 10);
      expect(result.skip).toBe((999999 - 1) * 10);
    });

    it('should handle zero limit gracefully', () => {
      const result = service.calculatePagination(1, 0);
      expect(result.take).toBe(1);
    });

    it('should handle negative limit gracefully', () => {
      const result = service.calculatePagination(1, -100);
      expect(result.take).toBe(1);
    });

    it('should calculate correct page count for non-divisible totals', () => {
      const metadata = service.createMetadata(25, 1, 10);
      expect(metadata.pages).toBe(3);
    });
  });
});
