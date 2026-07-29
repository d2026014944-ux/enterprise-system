/**
 * Root Observability Module
 *
 * Combines all observability sub-modules:
 * - Logging (structured, contextual)
 * - Metrics (Prometheus)
 * - Tracing (OpenTelemetry + Jaeger)
 * - Health Checks (liveness + readiness)
 */

import { Module } from '@nestjs/common';
import { LoggerModule } from './logging/logger.module';
import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';
import { HealthCheckService } from './health-check/health-check.service';
import { HealthIndicators } from './health-check/health-indicators';

@Module({
  imports: [LoggerModule, MetricsModule, TracingModule],
  providers: [HealthCheckService, HealthIndicators],
  exports: [LoggerModule, MetricsModule, TracingModule, HealthCheckService, HealthIndicators],
})
export class ObservabilityModule {}
