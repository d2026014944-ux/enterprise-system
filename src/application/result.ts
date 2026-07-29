/**
 * Result Pattern for the Application Layer
 *
 * The domain layer uses exceptions (DomainException) for business rule violations.
 * The application layer converts these to explicit Result<T, E> types so that
 * callers never need to catch exceptions — failures are encoded in the return type.
 *
 * This follows the Railway-Oriented Programming pattern:
 * - Success: Result.ok(value)
 * - Failure: Result.fail(error)
 * - Chaining: result.map() / result.flatMap()
 *
 * The DomainError type is a lightweight interface (not a class) so it can be
 * constructed from any domain exception without coupling.
 */

export interface DomainError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export class Result<T, E = DomainError> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly _value?: T;
  private readonly _error?: E;

  private constructor(isSuccess: boolean, value?: T, error?: E) {
    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._value = value;
    this._error = error;
    Object.freeze(this);
  }

  getValue(): T {
    if (this.isFailure) {
      throw new Error('Cannot retrieve value from a failed result.');
    }
    return this._value as T;
  }

  getError(): E {
    if (this.isSuccess) {
      throw new Error('Cannot retrieve error from a successful result.');
    }
    return this._error as E;
  }

  getOrDefault(defaultValue: T): T {
    return this.isSuccess ? (this._value as T) : defaultValue;
  }

  getOrElse(fallback: (error: E) => T): T {
    return this.isSuccess ? (this._value as T) : fallback(this._error as E);
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.isSuccess) {
      return Result.ok<U, E>(fn(this._value as T));
    }
    return Result.fail<U, E>(this._error as E);
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this.isSuccess) {
      return fn(this._value as T);
    }
    return Result.fail<U, E>(this._error as E);
  }

  mapError<F>(fn: (error: E) => F): Result<T, F> {
    if (this.isFailure) {
      return Result.fail<T, F>(fn(this._error as E));
    }
    return Result.ok<T, F>(this._value as T);
  }

  match<U>(onSuccess: (value: T) => U, onFailure: (error: E) => U): U {
    return this.isSuccess
      ? onSuccess(this._value as T)
      : onFailure(this._error as E);
  }

  static ok<T, E = DomainError>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  static fail<T, E = DomainError>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  static combine<T, E = DomainError>(results: Result<T, E>[]): Result<T[], E> {
    for (const result of results) {
      if (result.isFailure) {
        return Result.fail<T[], E>(result.getError());
      }
    }
    return Result.ok<T[], E>(results.map((r) => r.getValue()));
  }
}
