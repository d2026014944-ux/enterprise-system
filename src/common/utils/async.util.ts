/**
 * Async Utilities
 *
 * Production-grade async helpers for retry, timeout, parallel execution,
 * and circuit breaking. These are pure functions with no side effects
 * other than the operations they wrap.
 *
 * Design Principles:
 * - Configurable via options objects (not positional params)
 * - Deterministic behavior with sensible defaults
 * - Observable via callbacks (onRetry, onCircuitOpen, etc.)
 * - No external dependencies
 */

// ─── Types ────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (including the first try). Default: 3 */
  maxAttempts: number;
  /** Base delay between retries in milliseconds. Default: 1000 */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds. Default: 30000 */
  maxDelayMs: number;
  /** Exponential backoff multiplier. Default: 2 */
  backoffMultiplier: number;
  /**
   * Jitter range (0-1). Adds randomness to prevent thundering herd.
   * 0 = no jitter, 1 = full jitter. Default: 0.3
   */
  jitterFactor: number;
  /** Predicate to decide if a specific error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Called on each retry attempt */
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

export interface TimeoutOptions {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Custom timeout error message */
  message?: string;
}

export interface ParallelOptions {
  /** Maximum number of concurrent operations. Default: 5 */
  concurrency: number;
  /** Whether to fail fast on first error or collect all results */
  failFast?: boolean;
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit. Default: 5 */
  failureThreshold: number;
  /** Time in ms before attempting to half-open. Default: 30000 */
  resetTimeoutMs: number;
  /** Number of successful calls in half-open state to close. Default: 3 */
  successThreshold: number;
  /** Called when circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** Called when a request is rejected due to open circuit */
  onCircuitOpen?: () => void;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

// ─── Retry with Exponential Backoff + Jitter ─────────────

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
};

/**
 * Retry an async operation with exponential backoff and jitter.
 *
 * The delay formula: min(baseDelay * multiplier^attempt, maxDelay) + jitter
 * Jitter prevents synchronized retries across multiple clients (thundering herd).
 *
 * @example
 * ```ts
 * const data = await retry(
 *   () => fetchFromExternalApi(),
 *   { maxAttempts: 3, baseDelayMs: 500, isRetryable: (err) => err.status >= 500 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if this error is retryable
      if (opts.isRetryable && !opts.isRetryable(lastError)) {
        throw lastError;
      }

      // Don't delay after the last attempt
      if (attempt < opts.maxAttempts) {
        const delayMs = calculateDelay(attempt, opts);
        opts.onRetry?.(attempt, lastError, delayMs);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, opts: RetryOptions): number {
  const exponentialDelay = opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, opts.maxDelayMs);

  // Apply jitter: random value in range [delay * (1 - jitter), delay]
  const jitterRange = cappedDelay * opts.jitterFactor;
  const jitter = Math.random() * jitterRange;

  return Math.round(cappedDelay - jitter + jitterRange / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Timeout Wrapper ──────────────────────────────────────

/**
 * Wrap a promise with a timeout. Rejects with TimeoutError if exceeded.
 *
 * @example
 * ```ts
 * const result = await timeout(fetchData(), { timeoutMs: 5000 });
 * ```
 */
export async function timeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions,
): Promise<T> {
  let timer: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new TimeoutError(
          options.message ?? `Operation timed out after ${options.timeoutMs}ms`,
          options.timeoutMs,
        ),
      );
    }, options.timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timer!);
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ─── Parallel Execution with Concurrency Limit ───────────

const DEFAULT_PARALLEL_OPTIONS: ParallelOptions = {
  concurrency: 5,
  failFast: true,
};

/**
 * Execute multiple async operations with a concurrency limit.
 *
 * @example
 * ```ts
 * const users = await parallel(
 *   userIds.map(id => () => fetchUser(id)),
 *   { concurrency: 10 }
 * );
 * ```
 */
export async function parallel<T>(
  tasks: Array<() => Promise<T>>,
  options?: Partial<ParallelOptions>,
): Promise<T[]> {
  const opts = { ...DEFAULT_PARALLEL_OPTIONS, ...options };
  const results: T[] = new Array(tasks.length);
  const errors: Error[] = [];
  let currentIndex = 0;

  // Worker function that processes tasks from the queue
  async function worker(): Promise<void> {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      try {
        results[index] = await tasks[index]();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (opts.failFast) {
          throw error;
        }
        errors.push(error);
      }
    }
  }

  // Spawn workers up to concurrency limit
  const workers = Array.from(
    { length: Math.min(opts.concurrency, tasks.length) },
    () => worker(),
  );

  if (opts.failFast) {
    await Promise.all(workers);
  } else {
    await Promise.allSettled(workers);
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} of ${tasks.length} tasks failed`);
    }
  }

  return results;
}

// ─── Circuit Breaker ──────────────────────────────────────

const DEFAULT_CIRCUIT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThreshold: 3,
};

/**
 * Circuit Breaker implementation.
 *
 * States:
 * - closed: normal operation, requests pass through
 * - open: requests are rejected immediately
 * - half-open: a limited number of requests pass through to test recovery
 *
 * Transitions:
 * - closed → open: after failureThreshold consecutive failures
 * - open → half-open: after resetTimeoutMs
 * - half-open → closed: after successThreshold consecutive successes
 * - half-open → open: on any failure
 *
 * @example
 * ```ts
 * const callApi = circuitBreaker(
 *   () => fetch('https://api.example.com'),
 *   { failureThreshold: 3, resetTimeoutMs: 10000 }
 * );
 *
 * // Returns the circuit breaker instance with execute() and state inspection
 * const result = await callApi.execute();
 * console.log(callApi.state); // 'closed' | 'open' | 'half-open'
 * ```
 */
export function circuitBreaker<T>(
  fn: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>,
): CircuitBreaker<T> {
  return new CircuitBreaker(fn, options);
}

export class CircuitBreaker<T> {
  private readonly opts: CircuitBreakerOptions;
  private _state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(
    private readonly fn: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>,
  ) {
    this.opts = { ...DEFAULT_CIRCUIT_OPTIONS, ...options };
  }

  get state(): CircuitState {
    // Auto-transition from open to half-open after timeout
    if (
      this._state === 'open' &&
      Date.now() >= this.nextAttemptTime
    ) {
      this.transitionTo('half-open');
    }
    return this._state;
  }

  get failures(): number {
    return this.failureCount;
  }

  /**
   * Execute the wrapped function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute(): Promise<T> {
    const currentState = this.state;

    if (currentState === 'open') {
      this.opts.onCircuitOpen?.();
      throw new CircuitOpenError(
        `Circuit breaker is open. Retry after ${new Date(this.nextAttemptTime).toISOString()}`,
        this.nextAttemptTime,
      );
    }

    try {
      const result = await this.fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Reset the circuit breaker to closed state.
   */
  reset(): void {
    this._state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }

  private onSuccess(): void {
    if (this._state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.opts.successThreshold) {
        this.transitionTo('closed');
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      // In closed state, reset failure count on success
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this._state === 'half-open') {
      // Any failure in half-open → open
      this.transitionTo('open');
      this.nextAttemptTime = Date.now() + this.opts.resetTimeoutMs;
      this.successCount = 0;
    } else if (this.failureCount >= this.opts.failureThreshold) {
      // Threshold exceeded → open
      this.transitionTo('open');
      this.nextAttemptTime = Date.now() + this.opts.resetTimeoutMs;
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this._state;
    this._state = newState;
    if (oldState !== newState) {
      this.opts.onStateChange?.(oldState, newState);
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly retryAt: number,
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
