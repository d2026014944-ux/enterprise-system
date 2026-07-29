/**
 * Application Layer — Barrel Export
 *
 * This layer orchestrates domain objects. It contains:
 * - Commands + Handlers (write side)
 * - Queries + Handlers (read side)
 * - Use Cases (application services)
 * - DTOs (data transfer objects)
 * - Ports (interfaces for infrastructure)
 * - Mappers (entity ↔ DTO conversion)
 * - Decorators (cross-cutting concerns)
 * - Result pattern (explicit error handling)
 *
 * Dependency rule: This layer depends ONLY on @domain/*.
 * It never imports from @infrastructure/* or @presentation/*.
 */

// Result pattern
export { Result, type DomainError } from './result';

// CQRS — Commands (write side)
export * from './commands';

// CQRS — Queries (read side)
export * from './queries';

// Use Cases (application services)
export * from './use-cases';

// DTOs (data transfer objects)
export * from './dto';

// Ports (interfaces for infrastructure)
export * from './ports';

// Mappers (entity ↔ DTO)
export * from './mappers';

// Decorators (cross-cutting concerns)
export * from './decorators';

// Application-layer events
export * from './events';
