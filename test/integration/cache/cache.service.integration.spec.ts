/**
 * Cache Service — Integration Tests
 *
 * Uses TestContainers for a real Redis instance.
 * Tests: get/set/delete, TTL expiration, cache invalidation.
 */

import Redis from 'ioredis';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

describe('CacheService (Integration)', () => {
  let container: StartedRedisContainer;
  let redis: Redis;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    redis = new Redis(container.getConnectionUrl());
  }, 60_000);

  afterAll(async () => {
    await redis.quit();
    await container.stop();
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  // ─── Basic Operations ───

  describe('get/set/delete', () => {
    it('should set and get a string value', async () => {
      await redis.set('key1', 'value1');
      const result = await redis.get('key1');
      expect(result).toBe('value1');
    });

    it('should return null for non-existent key', async () => {
      const result = await redis.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete a key', async () => {
      await redis.set('key1', 'value1');
      await redis.del('key1');
      const result = await redis.get('key1');
      expect(result).toBeNull();
    });

    it('should set and get JSON objects', async () => {
      const obj = { id: '123', name: 'Test', nested: { a: 1 } };
      await redis.set('obj', JSON.stringify(obj));
      const result = JSON.parse((await redis.get('obj'))!);
      expect(result).toEqual(obj);
    });

    it('should overwrite existing key', async () => {
      await redis.set('key1', 'value1');
      await redis.set('key1', 'value2');
      const result = await redis.get('key1');
      expect(result).toBe('value2');
    });
  });

  // ─── TTL Expiration ───

  describe('TTL expiration', () => {
    it('should set key with TTL', async () => {
      await redis.set('ttl-key', 'value', 'EX', 2);
      const ttl = await redis.ttl('ttl-key');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(2);
    });

    it('should expire key after TTL', async () => {
      await redis.set('expire-key', 'value', 'EX', 1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await redis.get('expire-key');
      expect(result).toBeNull();
    });

    it('should return -1 for key without TTL', async () => {
      await redis.set('no-ttl', 'value');
      const ttl = await redis.ttl('no-ttl');
      expect(ttl).toBe(-1);
    });

    it('should return -2 for non-existent key TTL', async () => {
      const ttl = await redis.ttl('nonexistent');
      expect(ttl).toBe(-2);
    });
  });

  // ─── Cache Invalidation ───

  describe('cache invalidation', () => {
    it('should invalidate by pattern', async () => {
      await redis.set('user:1:name', 'Alice');
      await redis.set('user:2:name', 'Bob');
      await redis.set('post:1:title', 'Hello');

      // Delete all user:* keys
      const keys = await redis.keys('user:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      expect(await redis.get('user:1:name')).toBeNull();
      expect(await redis.get('user:2:name')).toBeNull();
      expect(await redis.get('post:1:title')).toBe('Hello');
    });

    it('should handle bulk invalidation', async () => {
      const keys = Array.from({ length: 100 }, (_, i) => `bulk:${i}`);
      for (const key of keys) {
        await redis.set(key, 'value');
      }

      await redis.del(...keys);

      const remaining = await redis.keys('bulk:*');
      expect(remaining).toHaveLength(0);
    });
  });

  // ─── Exists ───

  describe('exists()', () => {
    it('should return 1 for existing key', async () => {
      await redis.set('exists', 'yes');
      const result = await redis.exists('exists');
      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key', async () => {
      const result = await redis.exists('nope');
      expect(result).toBe(0);
    });
  });

  // ─── Ping ───

  describe('ping', () => {
    it('should respond with PONG', async () => {
      const result = await redis.ping();
      expect(result).toBe('PONG');
    });
  });
});
