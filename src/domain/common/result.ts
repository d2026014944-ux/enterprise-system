/**
 * Result Monad — Railway-Oriented Error Handling
 *
 * Inspired by Rust's Result<T, E> type. All business logic returns Result
 * instead of throwing exceptions. Exceptions are reserved for truly
 * exceptional conditions (infrastructure failures, bugs).
 *
 * Usage:
 * ```ts
 * const result = Result.ok(user);
 * const result = Result.fail(createError(ErrorCode.NOT_FOUND, 'User not found'));
 *
 * result
 *   .map(user => user.email)
 *   .flatMap(email => validateEmail(email))
 *   .match(
 *     email  => sendWelcome(email),
 *     error  => logError(error),
 *   );
 * ```
 *
 * Reference: Scott Wlaschin — "Railway Oriented Programming"
 */

// ─── Error Codes ──────────────────────────────────────────

export enum ErrorCode {
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_PASSWORD = 'INVALID_PASSWORD',

  // Authentication & Authorization
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  FORBIDDEN = 'FORBIDDEN',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
  REFRESH_TOKEN_REVOKED = 'REFRESH_TOKEN_REVOKED',

  // Domain — User
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_INACTIVE = 'USER_INACTIVE',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',

  // Domain — Role
  ROLE_NOT_FOUND = 'ROLE_NOT_FOUND',
  ROLE_ALREADY_ASSIGNED = 'ROLE_ALREADY_ASSIGNED',

  // Infrastructure
  NOT_FOUND = 'NOT_FOUND',
  CONCURRENCY_CONFLICT = 'CONCURRENCY_CONFLICT',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// ─── Domain Error ─────────────────────────────────────────

export interface DomainError {
  /** Machine-readable error code */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error context (field errors, metadata, etc.) */
  details?: Record<string, unknown>;
  /** The original error if this wraps a caught exception */
  cause?: Error;
}

/**
 * Factory function for creating DomainError instances.
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: Error,
): DomainError {
  return { code, message, details, cause };
}

// ─── Result Monad ─────────────────────────────────────────

export class Result<T, E extends DomainError = DomainError> {
  private constructor(
    private readonly _value?: T,
    private readonly _error?: E,
    private readonly _isOk: boolean = false,
  ) {}

  /**
   * Create a successful result.
   */
  static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(value, undefined, true);
  }

  /**
   * Create a failed result.
   */
  static fail<E extends DomainError>(error: E): Result<never, E> {
    return new Result<never, E>(undefined, error, false);
  }

  /**
   * Create a Result from a nullable value.
   * Returns ok if value is not null/undefined, fail otherwise.
   */
  static fromNullable<T>(
    value: T | null | undefined,
    error: DomainError,
  ): Result<T, DomainError> {
    return value != null ? Result.ok(value) : Result.fail(error);
  }

  /**
   * Combine multiple Results. Returns the first failure or all values.
   */
  static all<T extends readonly Result<unknown, DomainError>[]>(
    results: T,
  ): Result<
    { [K in keyof T]: T[K] extends Result<infer U, DomainError> ? U : never },
    DomainError
  > {
    const values: unknown[] = [];
    for (const result of results) {
      if (result.isErr()) {
        return Result.fail(result.error) as any;
      }
      values.push(result.value);
    }
    return Result.ok(values as any);
  }

  /**
   * Run an async operation and wrap it in a Result.
   */
  static async try<T>(
    fn: () => Promise<T>,
    errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
  ): Promise<Result<T, DomainError>> {
    try {
      const value = await fn();
      return Result.ok(value);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return Result.fail(
        createError(errorCode, error.message, undefined, error),
      );
    }
  }

  // ─── Predicates ─────────────────────────────────────────

  get isOk(): boolean {
    return this._isOk;
  }

  get isErr(): boolean {
    return !this._isOk;
  }

  // ─── Accessors ──────────────────────────────────────────

  get value(): T {
    if (!this._isOk) {
      throw new Error('Cannot access value on a failed Result. Use error instead.');
    }
    return this._value as T;
  }

  get error(): E {
    if (this._isOk) {
      throw new Error('Cannot access error on a successful Result. Use value instead.');
    }
    return this._error as E;
  }

  // ─── Transforms ─────────────────────────────────────────

  /**
   * Map the success value. No-op on failure.
   */
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isOk) {
      return Result.ok(fn(this._value as T));
    }
    return Result.fail(this._error as E);
  }

  /**
   * Map the error value. No-op on success.
   */
  mapError<F extends DomainError>(fn: (error: E) => F): Result<T, F> {
    if (this._isOk) {
      return Result.ok(this._value as T);
    }
    return Result.fail(fn(this._error as E));
  }

  /**
   * Chain operations that also return Results.
   */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isOk) {
      return fn(this._value as T);
    }
    return Result.fail(this._error as E);
  }

  /**
   * Pattern match — unwrap the Result into a single value.
   */
  match<U>(onOk: (value: T) => U, onErr: (error: E) => U): U {
    if (this._isOk) {
      return onOk(this._value as T);
    }
    return onErr(this._error as E);
  }

  /**
   * Async pattern match.
   */
  async matchAsync<U>(
    onOk: (value: T) => Promise<U>,
    onErr: (error: E) => Promise<U>,
  ): Promise<U> {
    if (this._isOk) {
      return onOk(this._value as T);
    }
    return onErr(this._error as E);
  }

  /**
   * Unwrap with a default value on failure.
   */
  unwrapOr(defaultValue: T): T {
    return this._isOk ? (this._value as T) : defaultValue;
  }

  /**
   * Unwrap or throw the error.
   */
  unwrap(): T {
    if (this._isOk) {
      return this._value as T;
    }
    throw this._error;
  }

  /**
   * Tap into the success value without changing the result.
   * Useful for side effects (logging, metrics).
   */
  tap(fn: (value: T) => void): Result<T, E> {
    if (this._isOk) {
      fn(this._value as T);
    }
    return this;
  }

  /**
   * Tap into the error without changing the result.
   */
  tapError(fn: (error: E) => void): Result<T, E> {
    if (!this._isOk) {
      fn(this._error as E);
    }
    return this;
  }

  /**
   * Filter the success value. Returns failure if predicate fails.
   */
  filter(predicate: (value: T) => boolean, error: E): Result<T, E> {
    if (this._isOk && !predicate(this._value as T)) {
      return Result.fail(error);
    }
    return this;
  }

  /**
   * Convert to a plain object for serialization.
   */
  toJSON(): { ok: true; value: T } | { ok: false; error: E } {
    if (this._isOk) {
      return { ok: true, value: this._value as T };
    }
    return { ok: false, error: this._error as E };
  }
}
