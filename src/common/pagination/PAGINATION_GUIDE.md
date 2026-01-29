# Pagination System Documentation

## Overview

The PropChain backend implements a professional, standardized pagination system across all list endpoints. This ensures consistent behavior, improved performance, and better user experience when working with large datasets.

## Architecture

### Components

1. **PaginationQueryDto** - Query parameter DTO with validation
2. **PaginationMetadataDto** - Response metadata structure
3. **PaginatedResponseDto** - Generic response wrapper
4. **PaginationService** - Core service for pagination logic

## Quick Start

### API Usage

```bash
# Get first page with 10 items
GET /api-keys?page=1&limit=10

# Get page 2 with 20 items, sorted by name ascending
GET /api-keys?page=2&limit=20&sortBy=name&sortOrder=asc
```

### Response Format

```json
{
  "data": [
    {
      "id": "key_123",
      "name": "Production API Key",
      "keyPrefix": "propchain_live_abc",
      "createdAt": "2026-01-29T00:00:00Z"
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "pages": 10,
    "hasNext": true,
    "hasPrev": false,
    "sortBy": "createdAt",
    "sortOrder": "desc"
  }
}
```

## Query Parameters

### page
- **Type**: integer
- **Default**: 1
- **Min**: 1
- **Description**: Page number (1-indexed)

### limit
- **Type**: integer
- **Default**: 10
- **Min**: 1
- **Max**: 100
- **Description**: Number of items per page

### sortBy
- **Type**: string
- **Default**: createdAt
- **Description**: Field to sort by (must be a valid model field)

### sortOrder
- **Type**: string (enum)
- **Default**: desc
- **Values**: `asc`, `desc`
- **Description**: Sort direction

## Response Metadata

### total
Total number of items matching the filter criteria

### page
Current page number

### limit
Items per page

### pages
Total number of pages available

### hasNext
Boolean indicating if there's a next page

### hasPrev
Boolean indicating if there's a previous page

### sortBy
Field currently sorted by

### sortOrder
Current sort direction

## Implementation Guide

### For Service Classes

```typescript
import { Injectable } from '@nestjs/common';
import { PaginationService, PaginationQueryDto, PaginatedResponseDto } from '../common/pagination';
import { PrismaService } from '../database/prisma/prisma.service';

@Injectable()
export class ItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  async findAll(paginationQuery?: PaginationQueryDto) {
    if (!paginationQuery) {
      // Backward compatibility: return all items
      return this.prisma.item.findMany();
    }

    // Get pagination options for Prisma
    const { skip, take, orderBy } = this.paginationService.getPrismaOptions(
      paginationQuery,
      'createdAt' // default sort field
    );

    // Fetch data and count in parallel
    const [items, total] = await Promise.all([
      this.prisma.item.findMany({ skip, take, orderBy }),
      this.prisma.item.count(),
    ]);

    // Format and return paginated response
    return this.paginationService.formatResponse(items, total, paginationQuery);
  }
}
```

### For Controllers

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/pagination';
import { ItemService } from './item.service';
import { ItemDto } from './dto/item.dto';

@Controller('items')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Get()
  async findAll(
    @Query() paginationQuery: PaginationQueryDto,
  ): Promise<ItemDto[] | PaginatedResponseDto<ItemDto>> {
    return this.itemService.findAll(paginationQuery);
  }
}
```

## Validation

The pagination system enforces these constraints automatically:

| Parameter | Min | Max | Behavior |
|-----------|-----|-----|----------|
| page | 1 | ∞ | Below 1 defaults to 1 |
| limit | 1 | 100 | Above 100 capped at 100 |
| sortOrder | - | - | Must be 'asc' or 'desc' |

## Sorting

### Default Sorting
By default, results are sorted by `createdAt` in descending order (newest first).

### Custom Sort Fields
```bash
# Sort by email ascending
GET /api-keys?page=1&sortBy=email&sortOrder=asc

# Sort by updatedAt descending
GET /api-keys?page=1&sortBy=updatedAt&sortOrder=desc
```

### Valid Sort Fields
Each endpoint documents which fields can be sorted. Generally:
- `createdAt`
- `updatedAt`
- `name`
- `email`
- Entity-specific fields

## Performance Considerations

### Large Datasets
- Use reasonable limits (10-50 items) for initial loads
- Implement pagination in UI to avoid loading all items
- Consider caching frequently accessed pages

### Database Impact
```
Single query for count + data fetch = 2 database queries
Use Promise.all() to execute in parallel
```

### Optimization Tips
```typescript
// Good: Parallel execution
const [items, total] = await Promise.all([
  this.prisma.item.findMany({ skip, take, orderBy }),
  this.prisma.item.count(),
]);

// Avoid: Sequential queries
const items = await this.prisma.item.findMany({ skip, take });
const total = await this.prisma.item.count(); // Extra query
```

## Testing

### Unit Tests
Run pagination service tests:
```bash
npm run test:unit -- test/pagination/pagination.service.spec.ts
```

### Integration Tests
Run full endpoint tests:
```bash
npm run test:integration -- test/pagination/pagination.integration.spec.ts
```

### Performance Benchmarks
Run performance tests:
```bash
ts-node test/pagination/pagination.performance.ts
```

Expected performance:
- ~100K operations/second for calculatePagination
- ~100K operations/second for createMetadata
- <1ms for formatResponse with typical data

## Common Use Cases

### Get Recent Items (First Page)
```bash
GET /api-keys?page=1&limit=10&sortBy=createdAt&sortOrder=desc
```

### Navigate to Last Page
```bash
GET /api-keys?page=10&limit=10
# Use meta.pages to determine last page
```

### Search and Paginate
```bash
GET /api-keys?page=1&limit=20&sortBy=name&sortOrder=asc
```

### Iterate Through All Items
```typescript
let page = 1;
let hasMore = true;

while (hasMore) {
  const response = await fetch(`/api-keys?page=${page}&limit=50`);
  const { data, meta } = await response.json();
  
  // Process data
  processItems(data);
  
  hasMore = meta.hasNext;
  page++;
}
```

## Error Handling

The pagination system validates inputs automatically:

```typescript
// Invalid limit (too high)
GET /api-keys?limit=500
// Returns limit: 100 (capped at maximum)

// Invalid page (below minimum)
GET /api-keys?page=0
// Returns page: 1 (defaults to first page)

// Invalid sort order
GET /api-keys?sortOrder=unknown
// Returns sortOrder: 'desc' (defaults to desc)
```

## Migration Guide

### Updating Existing Endpoints

1. **Add PaginationService to module providers**
```typescript
providers: [ItemService, PaginationService]
```

2. **Update service method**
```typescript
// Before
async findAll(): Promise<ItemDto[]> {
  return this.prisma.item.findMany();
}

// After
async findAll(paginationQuery?: PaginationQueryDto) {
  const { skip, take, orderBy } = this.paginationService.getPrismaOptions(
    paginationQuery
  );
  const [items, total] = await Promise.all([
    this.prisma.item.findMany({ skip, take, orderBy }),
    this.prisma.item.count(),
  ]);
  return this.paginationService.formatResponse(items, total, paginationQuery);
}
```

3. **Update controller method**
```typescript
// Before
async findAll(): Promise<ItemDto[]> {
  return this.itemService.findAll();
}

// After
async findAll(@Query() paginationQuery: PaginationQueryDto) {
  return this.itemService.findAll(paginationQuery);
}
```

## API Compatibility

### Backward Compatibility
Existing endpoints without pagination continue to work. Pagination is additive and optional on the service layer.

### Response Format Changes
When pagination is enabled:
- Response wraps data in `data` field
- Adds `meta` object with pagination details

### Version Support
- Works with NestJS 9+
- Works with Prisma 4+
- Compatible with TypeScript 4.5+

## Best Practices

1. **Always use pagination for list endpoints** - Even if starting with small datasets, plan for growth

2. **Validate sortBy fields** - Maintain a whitelist of sortable fields
   ```typescript
   const SORTABLE_FIELDS = ['createdAt', 'name', 'email'];
   if (!SORTABLE_FIELDS.includes(sortBy)) {
     throw new BadRequestException('Invalid sort field');
   }
   ```

3. **Use reasonable defaults** - 10-20 items per page for UI lists

4. **Cache count queries** - For read-heavy endpoints, consider caching total count

5. **Add database indexes** - Index commonly sorted and filtered fields

6. **Document sort fields** - In API documentation, specify which fields support sorting

## Troubleshooting

### Issue: "hasNext is always false"
Check that you're using `meta.pages` and `meta.page` correctly:
```typescript
const hasNext = page < pages; // Correct
const hasNext = page <= pages; // Incorrect
```

### Issue: "Duplicates across pages"
Ensure consistent sorting with `orderBy`:
```typescript
// Good: Deterministic sorting
orderBy: { createdAt: 'desc' } 

// Risky: Multiple sort fields needed
orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
```

### Issue: "Performance degradation with large limits"
Remember the 100-item hard limit and pagination in UI:
```typescript
// Always enforced
limit = Math.min(limit, 100);
```

## Contributing

When adding new paginated endpoints:

1. Add pagination tests to `/test/pagination/`
2. Document sortable fields
3. Update this documentation
4. Add `@Query() paginationQuery: PaginationQueryDto` to controller
5. Run performance benchmarks to validate

## See Also

- [Pagination Service API](../../src/common/pagination/pagination.service.ts)
- [Pagination DTOs](../../src/common/pagination/pagination.dto.ts)
- [API Keys Pagination Example](../../src/api-keys/api-key.controller.ts)
