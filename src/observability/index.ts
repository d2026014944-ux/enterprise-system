/**
 * Observability — Barrel Export
 */

// Logging
export { LoggerService, type LogContext } from './logging/logger.service';
export { LoggerModule } from './logging/logger.module';
export { RequestLoggerMiddleware } from './logging/request-logger.middleware';

// Metrics
export { MetricsService } from './metrics/metrics.service';
export { MetricsModule } from './metrics/metrics.module';
export { MetricsController } from './metrics/metrics.controller';

// Tracing
export { TracingService } from './tracing/tracing.service';
export { TracingModule } from './tracing/tracing.module';

// Health
export { HealthCheckService, type HealthStatus, type DependencyHealth, type SystemHealth } from './health-check/health-check.service';
export { HealthIndicators } from './health-check/health-indicators';

// Root
export { ObservabilityModule } from './observability.module';
