# Presentation Layer — Audit Report

## Architecture Overview

The presentation layer implements a clean REST API with consistent behavior:

1. **Controllers** — HTTP endpoint definitions with Swagger documentation
2. **Middleware** — Request preprocessing (correlation ID, compression)
3. **Guards** — Request identification
4. **Interceptors** — Response transformation, logging, timeout enforcement
5. **Pipes** — Input validation and transformation
6. **Filters** — Exception handling with RFC 7807 format

## Request Processing Pipeline

```
Request
  ↓
[Middleware] CorrelationId → Compression
  ↓
[Guard] JwtAuthGuard → RolesGuard → PermissionsGuard → ThrottlerGuard → RequestIdGuard
  ↓
[Pipe] ValidationPipe (class-validator + class-transformer)
  ↓
[Controller] Business logic
  ↓
[Interceptor] LoggingInterceptor → TimeoutInterceptor → TransformInterceptor
  ↓
[Filter] DomainExceptionFilter → HttpExceptionFilter (if error)
  ↓
Response
```

## API Design Guidelines

### URL Structure
- Base: `/api/v1/`
- Resources: `/api/v1/users`, `/api/v1/auth`
- Sub-resources: `/api/v1/users/:id/roles`
- Versioning: URL path versioning (`/v1/`)

### HTTP Methods
- `POST` — Create (returns 201)
- `GET` — Read (returns 200)
- `PATCH` — Partial update (returns 200)
- `PUT` — Full replace (returns 200)
- `DELETE` — Remove (returns 204)

### HTTP Status Codes
| Code | Usage |
|---|---|
| 200 | Successful read/update |
| 201 | Successful creation |
| 204 | Successful deletion (no body) |
| 400 | Bad request / validation error |
| 401 | Missing or invalid authentication |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 408 | Request timeout |
| 409 | Conflict (duplicate, version mismatch) |
| 422 | Validation error (semantic) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Response Envelope

**Success:**
```json
{
  "data": { ... },
  "meta": {
    "requestId": "550e8400-...",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

**Error (RFC 7807):**
```json
{
  "type": "https://enterprise.system/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "The request body contains invalid fields.",
  "instance": "/api/v1/users",
  "code": "VALIDATION_ERROR",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "550e8400-...",
  "errors": [
    { "field": "email", "message": "Must be a valid email", "value": "not-an-email" }
  ]
}
```

## Implementation Details

### Controllers

#### Auth Controller (`auth.controller.ts`)
- `POST /api/v1/auth/login` — Rate limited (10/min), returns token pair
- `POST /api/v1/auth/register` — Rate limited (5/5min), returns token pair
- `POST /api/v1/auth/refresh` — Token rotation, old token invalidated
- `POST /api/v1/auth/logout` — Revokes session(s), 204 No Content

#### User Controller (`user.controller.ts`)
- `POST /api/v1/users` — 201 Created, admin only
- `GET /api/v1/users` — Paginated, filterable by status/email
- `GET /api/v1/users/:id` — UUID validation, 404 if not found
- `PATCH /api/v1/users/:id` — Partial update, UUID validated
- `DELETE /api/v1/users/:id` — 204 No Content, admin only

#### Health Controller (`health.controller.ts`)
- `GET /health` — Liveness probe (always 200)
- `GET /health/ready` — Readiness probe (checks DB, memory)

### Middleware

#### Correlation ID (`correlation-id.middleware.ts`)
- Extracts `X-Correlation-ID` from request header
- Generates UUID v4 if not present
- Attaches to request context and response header
- Propagated to downstream services

#### Compression (`compression.middleware.ts`)
- gzip compression with 1KB threshold
- Skips already-compressed content
- Respects `X-No-Compression` header

### Guards

#### Request ID Guard (`request-id.guard.ts`)
- Generates/extracts `X-Request-ID` per request
- Attaches to request context for log correlation
- Different from correlation ID (per-request vs. distributed)

### Interceptors

#### Logging Interceptor (`logging.interceptor.ts`)
- Structured JSON logging for log aggregation
- Logs request method, path, status, duration
- Redacts sensitive fields (passwords, tokens, keys)
- Different log levels for 4xx (warn) and 5xx (error)

#### Transform Interceptor (`transform.interceptor.ts`)
- Wraps responses in `{ data, meta }` envelope
- Handles pagination (extracts from `{ items, total, page, limit }`)
- Skips double-wrapping if already wrapped
- Passes through binary responses (buffers, streams)

#### Timeout Interceptor (`timeout.interceptor.ts`)
- Default 30-second timeout
- Customizable per-route via `@Timeout(ms)` decorator
- Returns 408 Request Timeout with RFC 7807 format

### Pipes

#### Validation Pipe (`validation.pipe.ts`)
- `whitelist: true` — Strips unknown properties (OWASP injection prevention)
- `forbidNonWhitelisted: true` — Rejects unknown properties
- `transform: true` — Converts payloads to DTO instances
- `enableImplicitConversion: true` — String "1" → number 1
- Custom exception factory for RFC 7807 field errors

### Filters

#### HTTP Exception Filter (`http-exception.filter.ts`)
- Catches all `HttpException` instances
- Returns RFC 7807 Problem Details
- Maps status codes to error type URIs
- Includes request ID and timestamp
- No stack traces in production

#### Domain Exception Filter (`domain-exception.filter.ts`)
- Catches domain-layer exceptions
- Maps `ErrorCode` to HTTP status codes
- UserNotFound → 404, EmailExists → 409, InvalidCredentials → 401
- Includes field-level validation errors
- Logs at appropriate level (warn for 4xx, error for 5xx)

## Swagger Documentation

Every endpoint is documented with:
- `@ApiOperation` — Summary and description
- `@ApiResponse` — All possible status codes with types
- `@ApiParam` — Path parameters with examples
- `@ApiQuery` — Query parameters with types
- `@ApiBearerAuth` — Authentication requirement
- `@ApiTags` — Grouping by resource

## Quality Checklist

- [x] RFC 7807 Problem Details on all errors
- [x] Proper HTTP status codes (201, 204, 404, etc.)
- [x] API versioning (`/api/v1/`)
- [x] Swagger documentation on every endpoint
- [x] Input validation with whitelist
- [x] Request ID for tracing
- [x] Correlation ID for distributed tracing
- [x] Structured logging with redaction
- [x] Response compression
- [x] Request timeout enforcement
- [x] Consistent response envelope
- [x] Health probes (liveness + readiness)
- [x] No stack traces in production
- [x] Rate limiting on auth endpoints

## Known Limitations

1. **Controller stubs**: Controllers return mock data; need integration with application layer use cases
2. **No HATEOAS**: Links not included in responses (add if needed)
3. **No ETags**: No optimistic concurrency control via ETags
4. **No CORS configuration**: Should be configured in `main.ts`
5. **No request size limits**: Should add `body-parser` limit configuration

## Recommendations for Production

1. Integrate controllers with application layer use cases
2. Add ETag support for optimistic concurrency
3. Configure CORS with explicit allowed origins
4. Add request body size limits (e.g., 1MB)
5. Add API key authentication for service-to-service calls
6. Implement GraphQL gateway for complex queries
7. Add WebSocket support for real-time features
8. Configure Helmet for security headers
