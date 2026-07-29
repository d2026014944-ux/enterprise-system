# Observability Layer — Audit Report

## Summary

The observability layer implements the "three pillars" of observability — **logs, metrics, and traces** — with health checks for production readiness.

## Files Delivered

| # | File | Purpose |
|---|------|---------|
| 1 | `logging/logger.service.ts` | Winston structured logger with context binding, redaction, lazy eval |
| 2 | `logging/logger.module.ts` | Global NestJS module for DI |
| 3 | `logging/request-logger.middleware.ts` | HTTP request/response logging |
| 4 | `metrics/metrics.service.ts` | Prometheus metrics (RED + USE method) |
| 5 | `metrics/metrics.controller.ts` | `/metrics` scraping endpoint |
| 6 | `metrics/metrics.module.ts` | Metrics module registration |
| 7 | `tracing/tracing.service.ts` | OpenTelemetry SDK with Jaeger exporter |
| 8 | `tracing/tracing.module.ts` | Tracing module |
| 9 | `health-check/health-check.service.ts` | Liveness + readiness probes |
| 10 | `health-check/health-indicators.ts` | PostgreSQL, Redis, BullMQ health indicators |
| 11 | `observability.module.ts` | Root module combining all sub-modules |
| 12 | `index.ts` | Barrel export |

## Design Decisions

### Logging
- **Winston** chosen for maturity and transport flexibility
- JSON format in production for ELK/Datadog ingestion; colorized in dev
- **Redaction**: Passwords, tokens, API keys, PII fields auto-redacted via single-pass traversal (O(n))
- **Lazy evaluation**: `LazyMessage` type defers expensive string construction until log level is confirmed enabled
- **Context binding**: requestId, userId, correlationId attached per-request via child loggers
- Health check endpoints excluded from request logging to reduce noise

### Metrics
- **prom-client** directly (not OpenTelemetry exporter) for fine-grained control
- **RED method** (Google SRE): Rate (`http_requests_total`), Errors (status labels), Duration (`http_request_duration_seconds`)
- **USE method**: Utilization (`active_connections`), Saturation (histogram buckets), Errors (status)
- Domain metrics: `domain_events_total` tracks business event throughput
- Infrastructure: `database_query_duration_seconds`, `cache_hit_ratio`
- Default metrics with `enterprise_` prefix for namespace isolation

### Tracing
- **OpenTelemetry SDK** for vendor-neutral instrumentation
- Auto-instrumentation: HTTP, Express, PostgreSQL, Redis — zero-code visibility
- `withSpan()` helper for custom use-case spans with automatic error recording
- `getCurrentTraceId()` for log-trace correlation
- Console exporter in dev, Jaeger exporter in production
- Graceful shutdown on module destroy

### Health Checks
- **Liveness**: Simple boolean — process is alive
- **Readiness**: Parallel dependency checks with latency measurement
- Three states: `healthy` / `degraded` / `unhealthy`
- Structured response with per-dependency detail
- Kubernetes-compatible probe design

## Three Pillars Correlation

Logs, metrics, and traces are correlated via:
- **requestId** in log context ↔ trace context
- **traceId** accessible from `TracingService.getCurrentTraceId()`
- Metrics record the same dimensions (method, path, status) as logs

## Production Readiness Checklist

- [x] Structured JSON logs for machine parsing
- [x] Sensitive field redaction
- [x] Prometheus metrics endpoint
- [x] Default system metrics (CPU, memory, event loop)
- [x] Custom business metrics
- [x] Distributed tracing with auto-instrumentation
- [x] Liveness probe
- [x] Readiness probe with dependency checks
- [x] Graceful shutdown (tracing SDK flush)
- [x] No-op mode when tracing disabled

## References

- Google SRE Book: "Monitoring Distributed Systems"
- Google SRE Book: "Practical Alerting"
- OpenTelemetry Specification
- RED/USE method (Brendan Gregg)
