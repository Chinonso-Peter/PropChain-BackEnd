import { performance } from 'perf_hooks';

// Performance test setup
beforeAll(async () => {
  console.log('Setting up performance test environment...');
  
  // Set performance-specific environment
  process.env.NODE_ENV = 'performance';
  process.env.LOG_LEVEL = 'error'; // Reduce noise during performance tests
});

afterAll(async () => {
  console.log('Cleaning up performance test environment...');
});

// Performance measurement utilities
global.measurePerformance = async (name: string, fn: () => Promise<any> | any, iterations = 1) => {
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    results.push(end - start);
  }
  
  const avg = results.reduce((sum, time) => sum + time, 0) / results.length;
  const min = Math.min(...results);
  const max = Math.max(...results);
  const median = results.sort((a, b) => a - b)[Math.floor(results.length / 2)];
  
  return {
    name,
    iterations,
    average: avg,
    min,
    max,
    median,
    results,
  };
};

global.assertPerformance = async (name: string, fn: () => Promise<any> | any, maxTimeMs: number, iterations = 1) => {
  const result = await measurePerformance(name, fn, iterations);
  
  console.log(`Performance: ${name}`);
  console.log(`  Average: ${result.average.toFixed(2)}ms`);
  console.log(`  Min: ${result.min.toFixed(2)}ms`);
  console.log(`  Max: ${result.max.toFixed(2)}ms`);
  console.log(`  Median: ${result.median.toFixed(2)}ms`);
  console.log(`  Iterations: ${iterations}`);
  
  if (result.average > maxTimeMs) {
    throw new Error(
      `Performance test failed: ${name} average time ${result.average.toFixed(2)}ms exceeds maximum allowed ${maxTimeMs}ms`
    );
  }
  
  return result;
};

// Load testing utilities
global.runLoadTest = async (name: string, fn: () => Promise<any>, concurrency = 10, totalRequests = 100) => {
  const startTime = performance.now();
  const promises: Promise<any>[] = [];
  const results: number[] = [];
  
  // Create batches of concurrent requests
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batch = Math.min(concurrency, totalRequests - i);
    const batchPromises = [];
    
    for (let j = 0; j < batch; j++) {
      const promise = (async () => {
        const start = performance.now();
        try {
          await fn();
          const end = performance.now();
          results.push(end - start);
          return { success: true, time: end - start };
        } catch (error) {
          results.push(performance.now() - start);
          return { success: false, time: performance.now() - start, error };
        }
      })();
      
      batchPromises.push(promise);
    }
    
    promises.push(Promise.all(batchPromises));
  }
  
  const batchResults = await Promise.all(promises);
  const endTime = performance.now();
  
  const flatResults = batchResults.flat();
  const successful = flatResults.filter(r => r.success);
  const failed = flatResults.filter(r => !r.success);
  
  const totalTime = endTime - startTime;
  const requestsPerSecond = (totalRequests / totalTime) * 1000;
  const avgResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;
  const successRate = (successful.length / totalRequests) * 100;
  
  const loadTestResult = {
    name,
    totalRequests,
    concurrency,
    totalTime,
    requestsPerSecond,
    avgResponseTime,
    successRate,
    successful: successful.length,
    failed: failed.length,
    results: flatResults,
  };
  
  console.log(`Load Test: ${name}`);
  console.log(`  Total Requests: ${totalRequests}`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
  console.log(`  Requests/sec: ${requestsPerSecond.toFixed(2)}`);
  console.log(`  Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`  Success Rate: ${successRate.toFixed(2)}%`);
  console.log(`  Successful: ${successful.length}`);
  console.log(`  Failed: ${failed.length}`);
  
  return loadTestResult;
};

global.assertLoadTest = async (name: string, fn: () => Promise<any>, options: {
  concurrency?: number;
  totalRequests?: number;
  minRequestsPerSecond?: number;
  maxAvgResponseTime?: number;
  minSuccessRate?: number;
}) => {
  const {
    concurrency = 10,
    totalRequests = 100,
    minRequestsPerSecond = 50,
    maxAvgResponseTime = 1000,
    minSuccessRate = 95,
  } = options;
  
  const result = await runLoadTest(name, fn, concurrency, totalRequests);
  
  const failures = [];
  
  if (result.requestsPerSecond < minRequestsPerSecond) {
    failures.push(
      `Requests/sec ${result.requestsPerSecond.toFixed(2)} below minimum ${minRequestsPerSecond}`
    );
  }
  
  if (result.avgResponseTime > maxAvgResponseTime) {
    failures.push(
      `Avg response time ${result.avgResponseTime.toFixed(2)}ms exceeds maximum ${maxAvgResponseTime}ms`
    );
  }
  
  if (result.successRate < minSuccessRate) {
    failures.push(
      `Success rate ${result.successRate.toFixed(2)}% below minimum ${minSuccessRate}%`
    );
  }
  
  if (failures.length > 0) {
    throw new Error(`Load test failed: ${name}\n${failures.join('\n')}`);
  }
  
  return result;
};

// Memory usage monitoring
global.getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
};

global.monitorMemory = (name: string, fn: () => Promise<any> | any) => {
  const beforeMemory = getMemoryUsage();
  
  const runFn = async () => {
    const result = await fn();
    const afterMemory = getMemoryUsage();
    
    console.log(`Memory Usage: ${name}`);
    console.log(`  Before: RSS=${beforeMemory.rss}MB, Heap=${beforeMemory.heapUsed}MB`);
    console.log(`  After: RSS=${afterMemory.rss}MB, Heap=${afterMemory.heapUsed}MB`);
    console.log(`  Diff: RSS=${afterMemory.rss - beforeMemory.rss}MB, Heap=${afterMemory.heapUsed - beforeMemory.heapUsed}MB`);
    
    return result;
  };
  
  return runFn();
};
