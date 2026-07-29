/**
 * Cache Service
 *
 * Redis-based cache with typed operations, key namespacing, TTL management,
 * and decorator support for method-level caching.
 *
 * Design patterns:
 * - Key namespacing prevents collisions across bounded contexts
 * - TTL is mandatory to prevent unbounded cache growth
 * - Cache-aside pattern is the recommended usage
 * - Stale-while-revalidate can be layered on top
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheError } from '@domain/exceptions';

export interface CacheOptions {
  /** TTL in seconds */
  ttl?: number;
  /** Override the default namespace */
  namespace?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly defaultNamespace: string;
  private readonly defaultTtl: number;
  private readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  constructor(private readonly config: ConfigService) {
    this.defaultNamespace = this.config.get('redis.REDIS_KEY_PREFIX', 'es:');
    this.defaultTtl = 300; // 5 minutes default

    this.redis = new Redis({
      host: this.parseRedisHost(),
      port: this.parseRedisPort(),
      password: this.config.get('redis.REDIS_PASSWORD'),
      db: this.config.get('redis.REDIS_DB', 0),
      keyPrefix: this.defaultNamespace,
      maxRetriesPerRequest: this.config.get('redis.REDIS_MAX_RETRIES', 3),
      connectTimeout: this.config.get('redis.REDIS_CONNECT_TIMEOUT_MS', 5000),
      commandTimeout: this.config.get('redis.REDIS_COMMAND_TIMEOUT_MS', 2000),
      retryStrategy: (times: number) => {
        if (times > 10) {
          this.logger.error('Redis: max retries reached, giving up');
          return null; // stop retrying
        }
        return Math.min(times * 200, 5000); // exponential backoff capped at 5s
      },
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', err.message);
      this.stats.errors++;
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
    this.logger.log('Redis connection closed');
  }

  // ─── Core Operations ─────────────────────────────────────

  /**
   * Get a cached value. Returns null if not found or expired.
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.buildKey(key, options?.namespace);

    try {
      const raw = await this.redis.get(fullKey);

      if (raw === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache GET failed for key ${fullKey}`, error);
      throw new CacheError(`Cache get failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  /**
   * Set a cached value with TTL.
   */
  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<void> {
    const fullKey = this.buildKey(key, options?.namespace);
    const ttl = options?.ttl ?? this.defaultTtl;

    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(fullKey, ttl, serialized);
      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache SET failed for key ${fullKey}`, error);
      throw new CacheError(`Cache set failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  /**
   * Delete one or more cached keys.
   */
  async delete(key: string | string[], options?: CacheOptions): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    const fullKeys = keys.map((k) => this.buildKey(k, options?.namespace));

    try {
      if (fullKeys.length > 0) {
        await this.redis.del(...fullKeys);
        this.stats.deletes += fullKeys.length;
      }
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache DELETE failed for keys ${fullKeys.join(', ')}`, error);
      throw new CacheError(`Cache delete failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  /**
   * Check if a key exists in the cache.
   */
  async has(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.buildKey(key, options?.namespace);
    try {
      const exists = await this.redis.exists(fullKey);
      return exists === 1;
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache EXISTS failed for key ${fullKey}`, error);
      return false; // degrade gracefully
    }
  }

  // ─── Advanced Patterns ───────────────────────────────────

  /**
   * Get or set pattern — fetch from cache, or compute and cache the result.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Invalidate all keys matching a pattern.
   * Use with caution — SCAN is O(N) over the key space.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const fullPattern = this.buildKey(pattern);
    let deleted = 0;

    try {
      // Use SCAN to find matching keys (non-blocking)
      const stream = this.redis.scanStream({
        match: fullPattern,
        count: 100,
      });

      const pipeline = this.redis.pipeline();

      for await (const keys of stream) {
        if (keys.length > 0) {
          for (const key of keys) {
            pipeline.del(key);
            deleted++;
          }
        }
      }

      await pipeline.exec();
      this.stats.deletes += deleted;
      this.logger.debug(`Invalidated ${deleted} keys matching pattern: ${fullPattern}`);
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache pattern invalidation failed for ${fullPattern}`, error);
    }

    return deleted;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Health check.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // ─── Key Management ──────────────────────────────────────

  private buildKey(key: string, namespace?: string): string {
    const ns = namespace ?? '';
    return ns ? `${ns}:${key}` : key;
  }

  private parseRedisHost(): string {
    const url = this.config.get('redis.REDIS_URL', 'redis://localhost:6379');
    try {
      return new URL(url).hostname;
    } catch {
      return 'localhost';
    }
  }

  private parseRedisPort(): number {
    const url = this.config.get('redis.REDIS_URL', 'redis://localhost:6379');
    try {
      return Number(new URL(url).port) || 6379;
    } catch {
      return 6379;
    }
  }
}

// ─── Cache Decorator ──────────────────────────────────────

/**
 * Method-level caching decorator.
 * Wraps a method so its results are cached with the given TTL.
 *
 * Usage:
 *   @Cached({ key: 'user', ttl: 60, namespace: 'iam' })
 *   async getUser(id: string) { ... }
 */
export function Cached(options: {
  key: string;
  ttl?: number;
  namespace?: string;
}): MethodDecorator {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      // Access the cache service from the instance
      const cacheService: CacheService = (this as any).cacheService;
      if (!cacheService) {
        // No cache service available — fall through to original method
        return originalMethod.apply(this, args);
      }

      const cacheKey = `${options.key}:${args.join(':')}`;
      const cached = await cacheService.get(cacheKey, {
        ttl: options.ttl,
        namespace: options.namespace,
      });

      if (cached !== null) {
        return cached;
      }

      const result = await originalMethod.apply(this, args);
      await cacheService.set(cacheKey, result, {
        ttl: options.ttl,
        namespace: options.namespace,
      });

      return result;
    };

    return descriptor;
  };
}
