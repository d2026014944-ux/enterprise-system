/**
 * Custom Health Indicators
 *
 * Structured health responses for each dependency:
 * - PostgreSQL
 * - Redis
 * - BullMQ queues
 */

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import type { DependencyHealth } from './health-check.service';

@Injectable()
export class HealthIndicators {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /** Check PostgreSQL connectivity. */
  async checkPostgres(): Promise<DependencyHealth> {
    const start = performance.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        name: 'postgresql',
        status: 'healthy',
        latencyMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        name: 'postgresql',
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /** Check Redis connectivity. */
  async checkRedis(): Promise<DependencyHealth> {
    const start = performance.now();
    try {
      const pong = await this.redis.ping();
      return {
        name: 'redis',
        status: pong === 'PONG' ? 'healthy' : 'degraded',
        latencyMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /** Check BullMQ queue health. */
  async checkBullMQ(): Promise<DependencyHealth> {
    const start = performance.now();
    try {
      // Check if Redis is reachable (BullMQ depends on Redis)
      const info = await this.redis.info('keyspace');
      const hasKeys = info && info.includes('db');
      return {
        name: 'bullmq',
        status: hasKeys ? 'healthy' : 'degraded',
        latencyMs: Math.round(performance.now() - start),
        details: { redisConnected: true },
      };
    } catch (error) {
      return {
        name: 'bullmq',
        status: 'unhealthy',
        latencyMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : 'Queue check failed',
      };
    }
  }

  /** Run all dependency checks. */
  async checkAll(): Promise<DependencyHealth[]> {
    return Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkBullMQ(),
    ]);
  }
}
