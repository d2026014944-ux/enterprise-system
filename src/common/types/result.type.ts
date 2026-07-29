/**
 * Result Type — Re-export from Domain Layer
 *
 * The Result monad lives in the domain layer as it's a core
 * domain concept. This file re-exports it for convenience
 * in the common layer.
 */
export {
  Result,
  ErrorCode,
  createError,
  type DomainError,
} from '../../domain/common/result';
