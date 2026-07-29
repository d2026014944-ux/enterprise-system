/**
 * Presentation Layer — Barrel Exports
 *
 * Centralized export point for all presentation components.
 */

// Module
export { PresentationModule } from './presentation.module';

// Controllers
export { AuthController } from './rest/controllers/auth.controller';
export { UserController } from './rest/controllers/user.controller';
export { HealthController } from './rest/controllers/health.controller';

// Guards
export { RequestIdGuard, REQUEST_ID_HEADER } from './rest/guards/request-id.guard';

// Interceptors
export { LoggingInterceptor } from './rest/interceptors/logging.interceptor';
export { TransformInterceptor } from './rest/interceptors/transform.interceptor';
export { TimeoutInterceptor, Timeout } from './rest/interceptors/timeout.interceptor';

// Pipes
export { createValidationPipe } from './rest/pipes/validation.pipe';

// Filters
export { HttpExceptionFilter } from './rest/filters/http-exception.filter';
export { DomainExceptionFilter, DomainException } from './rest/filters/domain-exception.filter';

// Middleware
export { CorrelationIdMiddleware, CORRELATION_ID_HEADER } from './rest/middleware/correlation-id.middleware';
export { CompressionMiddleware } from './rest/middleware/compression.middleware';

// DTOs
export {
  ApiResponseDto,
  ResponseMeta,
  ProblemDetailsDto,
  FieldError,
  PaginatedResponseDto,
} from './rest/dto/api-response.dto';
