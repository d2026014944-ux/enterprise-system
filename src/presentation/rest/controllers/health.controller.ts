/**
 * Health Controller — Kubernetes health probes
 *
 * GET /health      — Liveness probe (is the process alive?)
 * GET /health/ready — Readiness probe (can it serve traffic?)
 *
 * Liveness: always returns 200 if the process is running.
 * Readiness: checks database and Redis connectivity.
 *
 * Uses @nestjs/terminus for standardized health checks.
 */
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../../security/authentication/public.decorator';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@ApiTags('Health')
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /health — Liveness probe
   * Returns 200 if the process is running.
   * Does NOT check dependencies (use /health/ready for that).
   */
  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns 200 if the application is running. Use for Kubernetes liveness probe.',
  })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * GET /health/ready — Readiness probe
   * Checks if the application can serve traffic.
   * Verifies database and cache connectivity.
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Checks database and cache connectivity. Use for Kubernetes readiness probe.',
  })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      // Database connectivity
      () => this.prismaHealth.pingCheck('database', this.prisma),
      // Memory usage
      async (): Promise<HealthIndicatorResult> => {
        const memUsage = process.memoryUsage();
        const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
        const thresholdMb = 512; // Alert if heap > 512MB

        if (heapUsedMb > thresholdMb) {
          return {
            memory: {
              status: 'down',
              heapUsed: `${heapUsedMb}MB`,
              heapTotal: `${heapTotalMb}MB`,
              message: `Heap usage (${heapUsedMb}MB) exceeds threshold (${thresholdMb}MB)`,
            },
          };
        }

        return {
          memory: {
            status: 'up',
            heapUsed: `${heapUsedMb}MB`,
            heapTotal: `${heapTotalMb}MB`,
          },
        };
      },
    ]);
  }
}
