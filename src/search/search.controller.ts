import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchAnalyticsReportDto, SearchQueryDto, SearchResponseDto } from './dto/search.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Full-text search across calls and users' })
  @ApiResponse({ status: 200, type: SearchResponseDto })
  search(@Query() dto: SearchQueryDto): Promise<SearchResponseDto> {
    return this.searchService.search(dto);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Search analytics report for the last 30 days' })
  @ApiResponse({ status: 200, type: SearchAnalyticsReportDto })
  analytics(): Promise<SearchAnalyticsReportDto> {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    return this.searchService.getAnalyticsReport(since);
  }
}
