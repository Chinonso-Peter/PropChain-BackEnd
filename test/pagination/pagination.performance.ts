import { PaginationService } from '../../src/common/pagination/pagination.service';
import { PaginationQueryDto } from '../../src/common/pagination/pagination.dto';

/**
 * Performance benchmarks for pagination service
 * Run with: ts-node test/pagination/pagination.performance.ts
 */

class PaginationPerformanceBenchmark {
  private paginationService: PaginationService;

  constructor() {
    this.paginationService = new PaginationService();
  }

  /**
   * Benchmark calculatePagination performance
   */
  benchmarkCalculatePagination() {
    console.log('\n=== calculatePagination Performance ===');
    const iterations = 100000;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      this.paginationService.calculatePagination(
        Math.floor(Math.random() * 100) + 1,
        Math.floor(Math.random() * 100) + 1,
      );
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (iterations / duration) * 1000;

    console.log(`  Iterations: ${iterations.toLocaleString()}`);
    console.log(`  Total time: ${duration.toFixed(2)}ms`);
    console.log(`  Avg time per operation: ${(duration / iterations).toFixed(4)}ms`);
    console.log(`  Operations per second: ${opsPerSecond.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  }

  /**
   * Benchmark createMetadata performance
   */
  benchmarkCreateMetadata() {
    console.log('\n=== createMetadata Performance ===');
    const iterations = 100000;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      this.paginationService.createMetadata(
        Math.floor(Math.random() * 10000),
        Math.floor(Math.random() * 100) + 1,
        Math.floor(Math.random() * 100) + 1,
      );
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (iterations / duration) * 1000;

    console.log(`  Iterations: ${iterations.toLocaleString()}`);
    console.log(`  Total time: ${duration.toFixed(2)}ms`);
    console.log(`  Avg time per operation: ${(duration / iterations).toFixed(4)}ms`);
    console.log(`  Operations per second: ${opsPerSecond.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  }

  /**
   * Benchmark formatResponse performance with different data sizes
   */
  benchmarkFormatResponse() {
    console.log('\n=== formatResponse Performance ===');
    const dataSizes = [10, 100, 1000];

    for (const size of dataSizes) {
      const data = Array.from({ length: size }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        createdAt: new Date(),
      }));

      const query: PaginationQueryDto = { page: 1, limit: 10 };
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        this.paginationService.formatResponse(data, 10000, query);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const opsPerSecond = (iterations / duration) * 1000;

      console.log(`\n  Data size: ${size} items`);
      console.log(`  Iterations: ${iterations.toLocaleString()}`);
      console.log(`  Total time: ${duration.toFixed(2)}ms`);
      console.log(`  Avg time per operation: ${(duration / iterations).toFixed(4)}ms`);
      console.log(`  Operations per second: ${opsPerSecond.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    }
  }

  /**
   * Benchmark getPrismaOptions performance
   */
  benchmarkGetPrismaOptions() {
    console.log('\n=== getPrismaOptions Performance ===');
    const iterations = 100000;
    const query: PaginationQueryDto = { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' };
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      this.paginationService.getPrismaOptions(query);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (iterations / duration) * 1000;

    console.log(`  Iterations: ${iterations.toLocaleString()}`);
    console.log(`  Total time: ${duration.toFixed(2)}ms`);
    console.log(`  Avg time per operation: ${(duration / iterations).toFixed(4)}ms`);
    console.log(`  Operations per second: ${opsPerSecond.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  }

  /**
   * Test pagination with large datasets
   */
  benchmarkLargeDatasets() {
    console.log('\n=== Large Dataset Pagination ===');
    const totalItems = [1000, 10000, 100000, 1000000];

    for (const total of totalItems) {
      const query: PaginationQueryDto = { page: 1, limit: 10 };
      const startTime = performance.now();

      const result = this.paginationService.formatResponse(
        Array.from({ length: 10 }, (_, i) => ({ id: i })),
        total,
        query,
      );

      const endTime = performance.now();

      console.log(`\n  Total items: ${total.toLocaleString()}`);
      console.log(`  Time to format response: ${(endTime - startTime).toFixed(4)}ms`);
      console.log(`  Pages: ${result.meta.pages.toLocaleString()}`);
      console.log(`  Has next: ${result.meta.hasNext}`);
    }
  }

  /**
   * Benchmark edge cases
   */
  benchmarkEdgeCases() {
    console.log('\n=== Edge Cases Performance ===');

    // Maximum page number
    console.log('\n  Max page number: 1,000,000');
    const startTime1 = performance.now();
    for (let i = 0; i < 10000; i++) {
      this.paginationService.calculatePagination(1000000, 10);
    }
    const endTime1 = performance.now();
    console.log(`  Time: ${(endTime1 - startTime1).toFixed(2)}ms`);

    // Empty dataset
    console.log('\n  Empty dataset');
    const startTime2 = performance.now();
    for (let i = 0; i < 10000; i++) {
      this.paginationService.createMetadata(0, 1, 10);
    }
    const endTime2 = performance.now();
    console.log(`  Time: ${(endTime2 - startTime2).toFixed(2)}ms`);

    // Maximum limit enforcement
    console.log('\n  Enforce maximum limit (1000000)');
    const startTime3 = performance.now();
    for (let i = 0; i < 10000; i++) {
      this.paginationService.calculatePagination(1, 1000000);
    }
    const endTime3 = performance.now();
    console.log(`  Time: ${(endTime3 - startTime3).toFixed(2)}ms`);
  }

  /**
   * Run all benchmarks
   */
  runAll() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     Pagination Service Performance Benchmarks              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    this.benchmarkCalculatePagination();
    this.benchmarkCreateMetadata();
    this.benchmarkFormatResponse();
    this.benchmarkGetPrismaOptions();
    this.benchmarkLargeDatasets();
    this.benchmarkEdgeCases();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                 Benchmarks Complete                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  }
}

// Run benchmarks if this file is executed directly
if (require.main === module) {
  const benchmark = new PaginationPerformanceBenchmark();
  benchmark.runAll();
}

export { PaginationPerformanceBenchmark };
