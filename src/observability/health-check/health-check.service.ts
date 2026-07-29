/**
 * Health Check Service
 *
 * Provides:
 * - Liveness probe: is the process alive?
 * - Readiness probe: are dependencies available?
 *
 * Used by Kubernetes liveness/readiness probes.
 *
 * Reference: Kubernetes probe spec, Google SRE book — "Managing Critical State"
 */

import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyHealth {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  dependencies: DependencyHealth[];
}

@Injectable()
export class HealthCheckService {
  private readonly startTime = Date.now();

  /**
   * Liveness check — returns true if the process is running.
   * No dependency checks. Used by k8s liveness probe.
   */
  isAlive(): boolean {
    return true;
  }

  /**
   * Readiness check — checks all critical dependencies.
   * Returns degraded/unhealthy if any dependency is down.
   */
  async checkReadiness(
    dependencyChecks: Array<() => Promise<DependencyHealth>>,
  ): Promise<SystemHealth> {
    const results = await Promise.allSettled(
      dependencyChecks.map((check) => check()),
    );

    const dependencies: DependencyHealth[] = results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        name: 'unknown',
        status: 'unhealthy' as const,
        message: result.reason?.message || 'Health check failed',
      };
    });

    const overallStatus = this.calculateOverallStatus(dependencies);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.APP_VERSION || '1.0.0',
      dependencies,
    };
  }

  private calculateOverallStatus(deps: DependencyHealth[]): HealthStatus {
    const unhealthy = deps.filter((d) => d.status === 'unhealthy');
    const degraded = deps.filter((d) => d.status === 'degraded');

    if (unhealthy.length > 0) return 'unhealthy';
    if (degraded.length > 0) return 'degraded';
    return 'healthy';
  }
}
