/**
 * Metrics Service — Prometheus instrumentation
 *
 * Provides:
 * - Default metrics (CPU, memory, event loop lag)
 * - Custom business metrics
 * - HTTP request tracking
 *
 * Reference: RED method (Rate, Errors, Duration) + USE method (Utilization, Saturation, Errors)
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // ─── HTTP Metrics (RED) ───

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'status', 'path'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'status', 'path'] as const,
    registers: [this.registry],
  });

  readonly activeConnections = new Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
    registers: [this.registry],
  });

  // ─── Domain Metrics ───

  readonly domainEventsTotal = new Counter({
    name: 'domain_events_total',
    help: 'Total domain events emitted',
    labelNames: ['event_type'] as const,
    registers: [this.registry],
  });

  // ─── Infrastructure Metrics ───

  readonly databaseQueryDuration = new Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation', 'table'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  readonly cacheHitRatio = new Gauge({
    name: 'cache_hit_ratio',
    help: 'Cache hit ratio (0-1)',
    registers: [this.registry],
  });

  readonly cacheOperations = new Counter({
    name: 'cache_operations_total',
    help: 'Total cache operations',
    labelNames: ['operation', 'result'] as const, // result: hit | miss
    registers: [this.registry],
  });

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry, prefix: 'enterprise_' });
  }

  /** Record an HTTP request. */
  recordHttpRequest(method: string, status: number, path: string, durationSeconds: number): void {
    const labels = { method, status: String(status), path };
    this.httpRequestDuration.observe(labels, durationSeconds);
    this.httpRequestsTotal.inc(labels);
  }

  /** Record a domain event. */
  recordDomainEvent(eventType: string): void {
    this.domainEventsTotal.inc({ event_type: eventType });
  }

  /** Record a database query. */
  recordDatabaseQuery(operation: string, table: string, durationSeconds: number): void {
    this.databaseQueryDuration.observe({ operation, table }, durationSeconds);
  }

  /** Increment active connections. */
  incrementConnections(): void {
    this.activeConnections.inc();
  }

  /** Decrement active connections. */
  decrementConnections(): void {
    this.activeConnections.dec();
  }

  /** Record a cache operation. */
  recordCacheOperation(operation: 'get' | 'set' | 'delete', hit: boolean): void {
    this.cacheOperations.inc({ operation, result: hit ? 'hit' : 'miss' });
  }

  /** Update cache hit ratio. */
  updateCacheHitRatio(ratio: number): void {
    this.cacheHitRatio.set(ratio);
  }

  /** Get all metrics as string. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Get content type for Prometheus. */
  getContentType(): string {
    return this.registry.contentType;
  }
}
