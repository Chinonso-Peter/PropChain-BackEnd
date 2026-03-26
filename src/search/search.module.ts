import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchCache } from './entities/search-cache.entity';
import { SearchAnalytics } from './entities/search-analytics.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SearchCache, SearchAnalytics])],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
