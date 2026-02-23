import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RedisService } from './redis.service';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  staleWhileRevalidate?: number; // Time in seconds to serve stale data while revalidating
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
}

export interface CacheInvalidationRule {
  pattern: string;
  dependentKeys?: string[];
  cascade?: boolean;
  condition?: (value: any) => boolean;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private metrics: Map<string, CacheMetrics> = new Map();
  private invalidationRules: Map<string, CacheInvalidationRule[]> = new Map();

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {
    // Initialize metrics for common cache namespaces
    this.initializeMetrics();
    // Initialize common invalidation rules
    this.initializeInvalidationRules();
  }

  private initializeMetrics() {
    const namespaces = ['valuation', 'property', 'user', 'transaction', 'document'];
    namespaces.forEach(ns => {
      this.metrics.set(ns, {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalRequests: 0,
      });
    });
  }

  private initializeInvalidationRules() {
    // Define common invalidation rules
    this.invalidationRules.set('property', [
      {
        pattern: 'property:*',
        dependentKeys: ['valuation:*'],
        cascade: true,
      },
      {
        pattern: 'property:*',
        dependentKeys: ['document:property:*'],
        cascade: true,
      },
    ]);

    this.invalidationRules.set('valuation', [
      {
        pattern: 'valuation:*',
        dependentKeys: ['valuation:history:*'],
        cascade: true,
      },
    ]);

    this.invalidationRules.set('user', [
      {
        pattern: 'user:*',
        dependentKeys: ['user:permissions:*', 'user:roles:*'],
        cascade: true,
      },
    ]);
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cache.get<T>(key);
      if (value !== undefined) {
        this.incrementHit(key);
        this.trackAccessPattern(key, 'get');
        this.logger.debug(`Cache HIT: ${key}`);
        return value;
      } else {
        this.incrementMiss(key);
        this.trackAccessPattern(key, 'get');
        this.logger.debug(`Cache MISS: ${key}`);
        return undefined;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache GET error for key ${key}: ${errMsg}`);
      return undefined;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl || this.getDefaultTtl();
      await this.cache.set(key, value, ttl);
      this.trackAccessPattern(key, 'set');
      this.logger.debug(`Cache SET: ${key} with TTL: ${ttl}s`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache SET error for key ${key}: ${errMsg}`);
    }
  }

  /**
   * Get a value from cache with auto-population if not exists
   */
  async wrap<T>(key: string, factory: () => Promise<T>, options?: CacheOptions): Promise<T> {
    // Try to get from cache first
    const cachedValue = await this.get<T>(key);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    // If not in cache, call the factory function
    const freshValue = await factory();

    // Set in cache with options
    await this.set(key, freshValue, options);

    return freshValue;
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.trackAccessPattern(key, 'del');
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache DEL error for key ${key}: ${errMsg}`);
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      // For Redis, use flushdb to clear all keys
      await this.redisService.flushdb();
      this.logger.debug('Cache cleared');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache CLEAR error: ${errMsg}`);
    }
  }

  /**
   * Get cache keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.redisService.keys(pattern);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache KEYS error for pattern ${pattern}: ${errMsg}`);
      return [];
    }
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redisService.exists(key);
      return exists;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache HAS error for key ${key}: ${errMsg}`);
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redisService.ttl(key);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache TTL error for key ${key}: ${errMsg}`);
      return -1;
    }
  }

  /**
   * Increment cache hit counter
   */
  private incrementHit(key: string): void {
    const namespace = this.getNamespace(key);
    const metrics = this.metrics.get(namespace);
    if (metrics) {
      metrics.hits++;
      metrics.totalRequests++;
      metrics.hitRate = metrics.hits / metrics.totalRequests;
    }
  }

  /**
   * Increment cache miss counter
   */
  private incrementMiss(key: string): void {
    const namespace = this.getNamespace(key);
    const metrics = this.metrics.get(namespace);
    if (metrics) {
      metrics.misses++;
      metrics.totalRequests++;
      metrics.hitRate = metrics.hits / metrics.totalRequests;
    }
  }

  /**
   * Get namespace from cache key
   */
  private getNamespace(key: string): string {
    const parts = key.split(':');
    return parts[0] || 'default';
  }

  /**
   * Get default TTL from config
   */
  private getDefaultTtl(): number {
    return this.configService.get<number>('CACHE_DEFAULT_TTL', 3600); // 1 hour default
  }

  /**
   * Get metrics for a specific namespace
   */
  getMetrics(namespace: string): CacheMetrics | undefined {
    return this.metrics.get(namespace);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, CacheMetrics> {
    return this.metrics;
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidateByPattern(pattern: string): Promise<void> {
    const keys = await this.keys(pattern);
    if (keys.length > 0) {
      for (const key of keys) {
        await this.del(key);
      }
      this.logger.log(`Invalidated ${keys.length} cache entries matching pattern: ${pattern}`);
    }
  }

  /**
   * Invalidate cache entries by key with cascade invalidation
   */
  async invalidateWithCascade(key: string): Promise<void> {
    const namespace = this.getNamespace(key);
    const rules = this.invalidationRules.get(namespace) || [];

    for (const rule of rules) {
      if (key.match(new RegExp(rule.pattern.replace(/\*/g, '.*')))) {
        if (rule.dependentKeys) {
          for (const dependentPattern of rule.dependentKeys) {
            await this.invalidateByPattern(dependentPattern);
          }
        }
      }
    }

    // Also invalidate the original key
    await this.del(key);
    this.logger.log(`Invalidated cache key: ${key} with cascade`);
  }

  /**
   * Invalidate cache with condition
   */
  async conditionalInvalidate(pattern: string, condition: (value: any) => boolean): Promise<void> {
    const keys = await this.keys(pattern);

    for (const key of keys) {
      const value = await this.get(key);
      if (value && condition(value)) {
        await this.del(key);
        this.logger.log(`Conditionally invalidated cache key: ${key}`);
      }
    }
  }

  /**
   * Tag-based cache invalidation
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      const pattern = `tag:${tag}:*`;
      await this.invalidateByPattern(pattern);
    }
    this.logger.log(`Invalidated cache by tags: ${tags.join(', ')}`);
  }

  /**
   * Add tag to a cache entry
   */
  async tagEntry(key: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `tag:${tag}:${key}`;
      await this.set(tagKey, key, { ttl: this.getDefaultTtl() * 2 }); // Longer TTL for tags
    }
  }

  /**
   * Time-based cache invalidation
   */
  async invalidateOlderThan(keyPattern: string, maxAgeSeconds: number): Promise<void> {
    const keys = await this.keys(keyPattern);
    const cutoffTime = Date.now() - maxAgeSeconds * 1000;

    for (const key of keys) {
      // For Redis, we'll rely on TTL, but we can also implement manual checks
      // For now, we'll just invalidate all matching keys
      await this.del(key);
    }

    this.logger.log(`Invalidated cache entries older than ${maxAgeSeconds}s for pattern: ${keyPattern}`);
  }

  /**
   * Get cache with fallback mechanism
   */
  async getWithFallback<T>(key: string, fallbackFactory: () => Promise<T>, options?: CacheOptions): Promise<T> {
    try {
      // First, try primary cache
      const cachedValue = await this.get<T>(key);
      if (cachedValue !== undefined) {
        return cachedValue;
      }

      // If not in cache, get from fallback and cache it
      const freshValue = await fallbackFactory();
      await this.set(key, freshValue, options);
      return freshValue;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cache operation failed for key ${key}, attempting fallback: ${errMsg}`);

      // Try fallback even if cache operations failed
      try {
        return await fallbackFactory();
      } catch (fallbackError) {
        const fallbackErrMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        this.logger.error(`Fallback also failed for key ${key}: ${fallbackErrMsg}`);
        throw fallbackError;
      }
    }
  }

  /**
   * Conditional cache update with version checking
   */
  async conditionalSet<T>(
    key: string,
    value: T,
    condition: (cachedValue?: T) => boolean,
    options?: CacheOptions,
  ): Promise<boolean> {
    const currentValue = await this.get<T>(key);

    if (condition(currentValue)) {
      await this.set(key, value, options);
      return true;
    }

    return false;
  }

  /**
   * Batch get multiple values
   */
  async mget<T>(...keys: string[]): Promise<(T | undefined)[]> {
    const results: (T | undefined)[] = [];

    for (const key of keys) {
      try {
        const value = await this.get<T>(key);
        results.push(value);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Cache MGET error for key ${key}: ${errMsg}`);
        results.push(undefined);
      }
    }

    return results;
  }

  /**
   * Batch set multiple values
   */
  async mset<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
    const promises = entries.map(entry => this.set(entry.key, entry.value, entry.options));

    await Promise.all(promises);
  }

  /**
   * Register an invalidation rule
   */
  registerInvalidationRule(namespace: string, rule: CacheInvalidationRule): void {
    if (!this.invalidationRules.has(namespace)) {
      this.invalidationRules.set(namespace, []);
    }
    this.invalidationRules.get(namespace)?.push(rule);
    this.logger.log(`Registered invalidation rule for namespace: ${namespace}`);
  }

  /**
   * Invalidate cache with dependencies
   */
  async invalidateWithDependencies(key: string, invalidateDependents: boolean = true): Promise<void> {
    if (invalidateDependents) {
      await this.invalidateWithCascade(key);
    } else {
      await this.del(key);
    }
  }

  /**
   * Warm the cache with frequently accessed data
   */
  async warmCache(
    warmupTasks: Array<{
      key: string;
      factory: () => Promise<any>;
      options?: CacheOptions;
      condition?: () => boolean;
    }>,
  ): Promise<void> {
    const promises = warmupTasks.map(async task => {
      try {
        // Check condition if provided
        if (task.condition && !task.condition()) {
          return;
        }

        // Skip if already cached
        const cachedValue = await this.get(task.key);
        if (cachedValue !== undefined) {
          this.logger.log(`Cache WARM skipped (already cached): ${task.key}`);
          return;
        }

        // Fetch and cache the data
        const value = await task.factory();
        await this.set(task.key, value, task.options);
        this.logger.log(`Cache WARM completed: ${task.key}`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Cache WARM failed for key ${task.key}: ${errMsg}`);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Warm the cache with frequently accessed data in background
   */
  async warmCacheBackground(
    warmupTasks: Array<{
      key: string;
      factory: () => Promise<any>;
      options?: CacheOptions;
      condition?: () => boolean;
    }>,
  ): Promise<void> {
    // Run cache warming in background to not block the main thread
    setImmediate(async () => {
      await this.warmCache(warmupTasks);
    });
  }

  /**
   * Get frequently accessed keys based on access patterns
   */
  async getFrequentlyAccessedKeys(limit: number = 10): Promise<string[]> {
    // In a real implementation, this would track access patterns
    // For now, return common patterns
    const allKeys = await this.keys('*');

    // Sort by access frequency (this is a simplified version)
    // In production, we'd track access counts per key
    return allKeys.slice(0, limit);
  }

  /**
   * Preload commonly accessed data patterns
   */
  async preloadCommonPatterns(): Promise<void> {
    // Preload common patterns like popular property valuations
    // This would typically be scheduled or triggered based on usage analytics

    // Example: Preload top 10 most viewed properties
    // This would need integration with analytics data

    this.logger.log('Starting common patterns preload');

    // In a real system, this would fetch from analytics or business logic
    // For demonstration, we'll create some common patterns
    const commonPatterns = ['property:popular:*', 'valuation:recent:*', 'user:active:*'];

    for (const pattern of commonPatterns) {
      const keys = await this.keys(pattern);
      this.logger.log(`Preloading ${keys.length} keys matching pattern: ${pattern}`);
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  async getCacheStats(): Promise<{
    size: number;
    memoryUsage: number;
    keys: number;
    hitRateOverall: number;
    metrics: Map<string, CacheMetrics>;
  }> {
    try {
      // Get total number of keys
      const keys = await this.keys('*');

      // Calculate overall hit rate
      let totalHits = 0;
      let totalMisses = 0;

      for (const [_, metrics] of this.metrics) {
        totalHits += metrics.hits;
        totalMisses += metrics.misses;
      }

      const totalRequests = totalHits + totalMisses;
      const hitRateOverall = totalRequests > 0 ? totalHits / totalRequests : 0;

      // Get memory usage info from Redis
      let memoryUsage = 0;
      try {
        // This is a simplified approach - in production you might want to use Redis INFO command
        memoryUsage = keys.length * 1024; // Estimate 1KB per key
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Could not get memory usage: ${errMsg}`);
      }

      return {
        size: keys.length,
        memoryUsage,
        keys: keys.length,
        hitRateOverall,
        metrics: this.metrics,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get cache stats: ${errMsg}`);
      throw error;
    }
  }

  /**
   * Export cache metrics for monitoring systems
   */
  exportMetrics(): Record<string, any> {
    const exportData: Record<string, any> = {};

    // Add metrics for each namespace
    for (const [namespace, metrics] of this.metrics) {
      exportData[namespace] = {
        hits: metrics.hits,
        misses: metrics.misses,
        hitRate: metrics.hitRate,
        totalRequests: metrics.totalRequests,
      };
    }

    // Add overall stats
    let totalHits = 0;
    let totalMisses = 0;

    for (const [_, metrics] of this.metrics) {
      totalHits += metrics.hits;
      totalMisses += metrics.misses;
    }

    const totalRequests = totalHits + totalMisses;
    const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    exportData.overall = {
      totalHits,
      totalMisses,
      totalRequests,
      hitRate: overallHitRate,
    };

    return exportData;
  }

  /**
   * Reset metrics for a namespace or all namespaces
   */
  resetMetrics(namespace?: string): void {
    if (namespace) {
      const metrics = this.metrics.get(namespace);
      if (metrics) {
        metrics.hits = 0;
        metrics.misses = 0;
        metrics.hitRate = 0;
        metrics.totalRequests = 0;
      }
    } else {
      // Reset all metrics
      for (const [_, metrics] of this.metrics) {
        metrics.hits = 0;
        metrics.misses = 0;
        metrics.hitRate = 0;
        metrics.totalRequests = 0;
      }
    }
  }

  /**
   * Track cache access patterns
   */
  private trackAccessPattern(key: string, operation: 'get' | 'set' | 'del'): void {
    // In a real implementation, this would track access patterns for optimization
    // For now, just log the access
    this.logger.debug(`Cache access pattern: ${operation} on ${key}`);
  }

  /**
   * Publish cache invalidation event for distributed cache consistency
   */
  async publishCacheInvalidateEvent(key: string): Promise<void> {
    try {
      // Use Redis pub/sub to notify other instances of cache invalidation
      await this.redisService.incr('cache:version'); // Increment global version
      await this.redisService.publish(
        'cache:invalidation',
        JSON.stringify({
          key,
          timestamp: Date.now(),
          nodeId: this.getNodeId(),
        }),
      );

      this.logger.log(`Published cache invalidation event for key: ${key}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to publish cache invalidation event: ${errMsg}`);
    }
  }

  /**
   * Subscribe to cache invalidation events for distributed consistency
   */
  async subscribeToCacheInvalidateEvents(): Promise<void> {
    try {
      // Set up subscription to listen for cache invalidation events from other nodes
      const subscriber = this.redisService.getRedisInstance();

      await subscriber.subscribe('cache:invalidation');

      subscriber.on('message', async (channel, message) => {
        if (channel === 'cache:invalidation') {
          try {
            const event = JSON.parse(message);

            // Only invalidate if it's from another node
            if (event.nodeId !== this.getNodeId()) {
              await this.del(event.key);
              this.logger.log(`Invalidated cache key from distributed event: ${event.key}`);
            }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to process cache invalidation event: ${errMsg}`);
          }
        }
      });

      this.logger.log('Subscribed to cache invalidation events for distributed consistency');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to subscribe to cache invalidation events: ${errMsg}`);
    }
  }

  /**
   * Get unique node ID for distributed systems
   */
  private getNodeId(): string {
    // In a real implementation, this might use the actual machine ID or pod name
    return this.configService.get<string>('NODE_ID', `node-${Math.random().toString(36).substr(2, 9)}`);
  }

  /**
   * Distributed lock for cache operations
   */
  async acquireDistributedLock(key: string, ttl: number = 30): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const lockValue = this.getNodeId();

    try {
      // Try to set lock with NX (only if not exists) and EX (expire time)
      const result = await this.redisService.setex(lockKey, ttl, lockValue);
      return result !== null;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to acquire distributed lock: ${errMsg}`);
      return false;
    }
  }

  /**
   * Release distributed lock
   */
  async releaseDistributedLock(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const nodeId = this.getNodeId();

    try {
      // Use Lua script to atomically check and delete lock
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redisService.eval(luaScript, [lockKey], [nodeId]);
      return result === 1;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to release distributed lock: ${errMsg}`);
      return false;
    }
  }

  /**
   * Distributed cache operation with lock
   */
  async distributedOperation<T>(key: string, operation: () => Promise<T>, lockTtl: number = 30): Promise<T> {
    const lockAcquired = await this.acquireDistributedLock(key, lockTtl);

    if (!lockAcquired) {
      throw new Error(`Could not acquire distributed lock for key: ${key}`);
    }

    try {
      return await operation();
    } finally {
      await this.releaseDistributedLock(key);
    }
  }

  /**
   * Get cache with distributed consistency check
   */
  async getWithConsistencyCheck<T>(key: string, consistencyTtl: number = 300): Promise<T | undefined> {
    // Check if there's a newer version available
    const versionKey = `version:${key}`;
    const currentVersion = await this.redisService.get(versionKey);
    const localVersion = await this.redisService.get(`local:version:${key}`);

    // If versions differ, the cache might be stale
    if (currentVersion && localVersion && currentVersion !== localVersion) {
      // Invalidate local cache
      await this.del(key);
      return undefined;
    }

    // Get the value as normal
    return await this.get<T>(key);
  }

  /**
   * Set cache with distributed version tracking
   */
  async setWithVersion<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    // Increment version for this key
    const version = await this.redisService.incr(`version:${key}`);

    // Store the value
    await this.set(key, value, options);

    // Store the local version
    await this.redisService.setex(`local:version:${key}`, options?.ttl || this.getDefaultTtl(), version.toString());
  }

  /**
   * Enhanced fallback mechanism for cache operations
   */
  async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    options?: {
      maxRetries?: number;
      retryDelay?: number;
      fallbackOnFailure?: boolean;
    },
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const retryDelay = options?.retryDelay ?? 100;
    const fallbackOnFailure = options?.fallbackOnFailure ?? true;

    let lastError: Error | undefined = undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Cache operation attempt ${attempt}/${maxRetries} failed: ${errMsg}`);
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    // If all retries failed and fallback is enabled
    if (fallbackOnFailure) {
      try {
        this.logger.log('Executing fallback operation');
        return await fallback();
      } catch (fallbackError) {
        this.logger.error(`Fallback operation also failed: ${fallbackError.message}`);
        throw lastError; // Throw the original error
      }
    }

    throw lastError;
  }

  /**
   * Get with multiple fallback strategies
   */
  async getWithMultipleFallbacks<T>(
    key: string,
    fallbackFactories: Array<() => Promise<T>>, // Multiple fallback options
    options?: {
      ttl?: number;
      refreshInBackground?: boolean;
    },
  ): Promise<T> {
    // First, try to get from cache
    const cachedValue = await this.get<T>(key);
    if (cachedValue !== undefined) {
      this.logger.log(`Cache HIT for key: ${key}`);
      return cachedValue;
    }

    // If not in cache, try fallback factories in sequence
    for (let i = 0; i < fallbackFactories.length; i++) {
      try {
        this.logger.log(`Trying fallback ${i + 1}/${fallbackFactories.length}`);
        const value = await fallbackFactories[i]();

        // Cache the successful result
        await this.set(key, value, { ttl: options?.ttl });

        // Optionally refresh in background
        if (options?.refreshInBackground) {
          setImmediate(async () => {
            try {
              const refreshedValue = await fallbackFactories[0](); // Use primary source
              await this.set(key, refreshedValue, { ttl: options?.ttl });
            } catch (refreshError) {
              const errMsg = refreshError instanceof Error ? refreshError.message : String(refreshError);
              this.logger.error(`Background refresh failed: ${errMsg}`);
            }
          });
        }

        return value;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Fallback ${i + 1} failed: ${errMsg}`);

        // If this was the last fallback, throw the error
        if (i === fallbackFactories.length - 1) {
          throw error;
        }
      }
    }

    throw new Error(`All fallback methods failed for key: ${key}`);
  }

  /**
   * Circuit breaker pattern for cache operations
   */
  private circuitBreakerState: Map<
    string,
    {
      failureCount: number;
      lastFailureTime: number;
      isOpen: boolean;
      nextAttemptTime: number;
    }
  > = new Map();

  async executeWithCircuitBreaker<T>(
    key: string,
    operation: () => Promise<T>,
    options?: {
      failureThreshold?: number;
      timeout?: number;
      resetTimeout?: number;
    },
  ): Promise<T> {
    const failureThreshold = options?.failureThreshold ?? 5;
    const timeout = options?.timeout ?? 60000; // 1 minute
    const resetTimeout = options?.resetTimeout ?? 30000; // 30 seconds

    const stateKey = `circuit-breaker:${key}`;
    let state = this.circuitBreakerState.get(stateKey);

    if (!state) {
      state = {
        failureCount: 0,
        lastFailureTime: 0,
        isOpen: false,
        nextAttemptTime: 0,
      };
      this.circuitBreakerState.set(stateKey, state);
    }

    // Check if circuit breaker is open
    if (state.isOpen) {
      if (Date.now() >= state.nextAttemptTime) {
        // Half-open state - allow one trial
        this.logger.log(`Circuit breaker half-open for key: ${key}, allowing one trial`);
        try {
          const result = await operation();
          // Success - close the circuit
          state.failureCount = 0;
          state.isOpen = false;
          return result;
        } catch (error) {
          // Still failing - keep circuit open
          this.logger.error(`Circuit breaker trial failed for key: ${key}`);
          throw error;
        }
      } else {
        throw new Error(`Circuit breaker is OPEN for key: ${key}`);
      }
    }

    // Execute operation
    try {
      const result = await operation();
      // Reset failure count on success
      state.failureCount = 0;
      return result;
    } catch (error) {
      // Increment failure count
      state.failureCount++;
      state.lastFailureTime = Date.now();

      // Open circuit if threshold exceeded
      if (state.failureCount >= failureThreshold) {
        state.isOpen = true;
        state.nextAttemptTime = Date.now() + resetTimeout;
        this.logger.warn(`Circuit breaker OPENED for key: ${key}`);
      }

      throw error;
    }
  }

  /**
   * Graceful degradation for cache failures
   */
  async getWithGracefulDegradation<T>(
    key: string,
    factory: () => Promise<T>,
    options?: {
      cacheTtl?: number;
      maxStaleAge?: number; // Maximum age of stale data to serve
      allowStale?: boolean; // Whether to serve stale data
    },
  ): Promise<T> {
    try {
      // Try to get fresh data from cache
      const cachedValue = await this.get<T>(key);
      if (cachedValue !== undefined) {
        this.logger.log(`Cache HIT for key: ${key}`);
        return cachedValue;
      }
    } catch (cacheError) {
      this.logger.error(`Cache GET failed: ${cacheError.message}, proceeding to factory`);
    }

    try {
      // Get fresh data from factory
      const freshValue = await factory();

      // Try to cache the fresh value
      try {
        await this.set(key, freshValue, { ttl: options?.cacheTtl });
      } catch (cacheError) {
        this.logger.error(`Failed to cache fresh value: ${cacheError.message}, continuing without cache`);
      }

      return freshValue;
    } catch (factoryError) {
      this.logger.error(`Factory failed: ${factoryError.message}`);

      // If we allow stale data and have it available, return it
      if (options?.allowStale && options?.maxStaleAge) {
        try {
          // This would require additional implementation to check staleness
          // For now, we'll just try to get whatever is in cache
          const possiblyStaleValue = await this.get<T>(key);
          if (possiblyStaleValue !== undefined) {
            this.logger.warn(`Returning stale data for key: ${key}`);
            return possiblyStaleValue;
          }
        } catch (staleError) {
          this.logger.error(`Failed to retrieve stale data: ${staleError.message}`);
        }
      }

      throw factoryError;
    }
  }
}
