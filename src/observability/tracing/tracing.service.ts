/**
 * Tracing Service — OpenTelemetry SDK setup
 *
 * Features:
 * - Jaeger exporter for distributed tracing
 * - Auto-instrumentation: HTTP, Express, PostgreSQL, Redis
 * - Custom span creation for use cases
 * - Trace context propagation (W3C Trace Context)
 *
 * Reference: Google Dapper paper, OpenTelemetry specification
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';

@Injectable()
export class TracingService implements OnModuleInit, OnModuleDestroy {
  private sdk: NodeSDK | null = null;
  private tracer: Tracer;

  constructor(private readonly configService: ConfigService) {
    this.tracer = trace.getTracer('enterprise-system', '1.0.0');
  }

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<boolean>('TRACING_ENABLED', false);
    if (!enabled) return;

    const serviceName = this.configService.get<string>('SERVICE_NAME', 'enterprise-system');
    const jaegerEndpoint = this.configService.get<string>('JAEGER_ENDPOINT', 'http://localhost:14268/api/traces');

    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.configService.get<string>('APP_VERSION', '1.0.0'),
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.configService.get<string>('NODE_ENV', 'development'),
    });

    const exporters = [];
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      exporters.push(new BatchSpanProcessor(new JaegerExporter({ endpoint: jaegerEndpoint })));
    } else {
      exporters.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
    }

    this.sdk = new NodeSDK({
      resource,
      spanProcessors: exporters,
      instrumentations: [
        new HttpInstrumentation(),
        new ExpressInstrumentation(),
        new PgInstrumentation(),
        new IORedisInstrumentation(),
      ],
    });

    this.sdk.start();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
    }
  }

  /** Get the tracer instance. */
  getTracer(): Tracer {
    return this.tracer;
  }

  /**
   * Create a custom span for a use case or domain operation.
   *
   * @example
   * await tracingService.withSpan('CreateUser', async (span) => {
   *   span.setAttribute('user.email', email);
   *   // ... business logic
   * });
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: { kind?: SpanKind; attributes?: Record<string, string | number | boolean> },
  ): Promise<T> {
    return this.tracer.startActiveSpan(
      name,
      { kind: options?.kind ?? SpanKind.INTERNAL, attributes: options?.attributes },
      async (span) => {
        try {
          const result = await fn(span);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Create a span without auto-closing (for manual lifecycle management).
   */
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    return this.tracer.startSpan(name, { kind: SpanKind.INTERNAL, attributes });
  }

  /** Get the current active span from context. */
  getActiveSpan(): Span | undefined {
    return trace.getSpan(context.active());
  }

  /** Get the current trace ID as a hex string. */
  getCurrentTraceId(): string | undefined {
    const span = this.getActiveSpan();
    if (!span) return undefined;
    const spanContext = span.spanContext();
    return spanContext.traceId;
  }
}
