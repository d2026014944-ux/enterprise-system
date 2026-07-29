/**
 * HTTP Client Service
 *
 * Axios-based HTTP client with enterprise resilience patterns:
 * - Circuit breaker (fail-fast when downstream is unhealthy)
 * - Retry with exponential backoff
 * - Request/response interceptors
 * - Timeout configuration
 * - Error classification (retryable vs non-retryable)
 *
 * Inspired by Netflix Hystrix and Google SRE practices.
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

// ─── Circuit Breaker ──────────────────────────────────────

enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing — reject immediately
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  monitoringWindowMs: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  halfOpenAttempts: number;
  successes: number;
}

// ─── HTTP Client Options ──────────────────────────────────

export interface HttpClientOptions {
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  circuitBreaker?: Partial<CircuitBreakerOptions>;
  headers?: Record<string, string>;
}

// ─── Error Classification ─────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
]);

@Injectable()
export class HttpClientService implements OnModuleDestroy {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly clients = new Map<string, AxiosInstance>();
  private readonly circuits = new Map<string, CircuitBreakerState>();

  private readonly defaultCircuitOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxAttempts: 3,
    monitoringWindowMs: 60_000,
  };

  onModuleDestroy(): void {
    this.clients.clear();
    this.circuits.clear();
  }

  /**
   * Create or get a named HTTP client with resilience features.
   */
  getClient(name: string, options: HttpClientOptions = {}): AxiosInstance {
    if (this.clients.has(name)) {
      return this.clients.get(name)!;
    }

    const client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout ?? 10_000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'enterprise-system/1.0',
        ...options.headers,
      },
    });

    // ── Request interceptor ────────────────────────────
    client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        config.metadata = { startTime: Date.now() };
        this.logger.debug(
          `[${name}] ${config.method?.toUpperCase()} ${config.url}`,
        );
        return config;
      },
      (error) => Promise.reject(error),
    );

    // ── Response interceptor ───────────────────────────
    client.interceptors.response.use(
      (response: AxiosResponse) => {
        const duration =
          Date.now() - ((response.config as any).metadata?.startTime ?? 0);
        this.logger.debug(
          `[${name}] ${response.status} ${response.config.url} (${duration}ms)`,
        );

        // Record success for circuit breaker
        this.recordSuccess(name);

        return response;
      },
      async (error: AxiosError) => {
        const duration =
          Date.now() -
          ((error.config as any)?.metadata?.startTime ?? 0);

        this.logger.warn(
          `[${name}] ${error.response?.status ?? 'NETWORK'} ${error.config?.url} (${duration}ms)`,
        );

        // Record failure for circuit breaker
        if (this.isRetryableError(error)) {
          this.recordFailure(name, options.circuitBreaker);
        }

        throw error;
      },
    );

    this.clients.set(name, client);
    this.initCircuit(name);

    return client;
  }

  /**
   * Make a request with circuit breaker and retry logic.
   */
  async request<T = unknown>(
    clientName: string,
    config: AxiosRequestConfig,
    options?: { retries?: number; retryDelay?: number },
  ): Promise<AxiosResponse<T>> {
    // ── Circuit breaker check ──────────────────────────
    this.checkCircuit(clientName);

    const maxRetries = options?.retries ?? 3;
    const retryDelay = options?.retryDelay ?? 1000;
    const client = this.getClient(clientName);

    let lastError: AxiosError | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await client.request<T>(config);
      } catch (error) {
        lastError = error as AxiosError;

        if (!this.isRetryableError(lastError)) {
          this.logger.error(
            `[${clientName}] Non-retryable error: ${lastError.message}`,
          );
          throw lastError;
        }

        if (attempt < maxRetries) {
          const delay = this.calculateBackoff(attempt, retryDelay);
          this.logger.warn(
            `[${clientName}] Attempt ${attempt}/${maxRetries} failed. Retrying in ${delay}ms...`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `[${clientName}] All ${maxRetries} attempts failed`,
      lastError?.message,
    );
    throw lastError;
  }

  /**
   * Convenience: GET with resilience.
   */
  async get<T = unknown>(
    clientName: string,
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>(clientName, { ...config, method: 'GET', url });
  }

  /**
   * Convenience: POST with resilience.
   */
  async post<T = unknown>(
    clientName: string,
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>(clientName, {
      ...config,
      method: 'POST',
      url,
      data,
    });
  }

  // ─── Circuit Breaker ─────────────────────────────────────

  private initCircuit(name: string): void {
    this.circuits.set(name, {
      state: CircuitState.CLOSED,
      failures: 0,
      lastFailureTime: 0,
      halfOpenAttempts: 0,
      successes: 0,
    });
  }

  private checkCircuit(name: string): void {
    const circuit = this.circuits.get(name);
    if (!circuit) return;

    switch (circuit.state) {
      case CircuitState.CLOSED:
        // Normal — allow request
        return;

      case CircuitState.OPEN: {
        // Check if reset timeout has elapsed
        const elapsed = Date.now() - circuit.lastFailureTime;
        if (elapsed >= this.defaultCircuitOptions.resetTimeoutMs) {
          circuit.state = CircuitState.HALF_OPEN;
          circuit.halfOpenAttempts = 0;
          circuit.successes = 0;
          this.logger.warn(`[${name}] Circuit breaker: OPEN → HALF_OPEN`);
          return;
        }
        throw new Error(
          `[${name}] Circuit breaker is OPEN. Service is unavailable. Retry after ${Math.ceil((this.defaultCircuitOptions.resetTimeoutMs - elapsed) / 1000)}s`,
        );
      }

      case CircuitState.HALF_OPEN:
        // Allow limited requests through
        return;
    }
  }

  private recordSuccess(name: string): void {
    const circuit = this.circuits.get(name);
    if (!circuit) return;

    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.successes++;
      if (circuit.successes >= this.defaultCircuitOptions.halfOpenMaxAttempts) {
        circuit.state = CircuitState.CLOSED;
        circuit.failures = 0;
        this.logger.log(`[${name}] Circuit breaker: HALF_OPEN → CLOSED (recovered)`);
      }
    }

    if (circuit.state === CircuitState.CLOSED) {
      // Reset failure count on success within monitoring window
      const elapsed = Date.now() - circuit.lastFailureTime;
      if (elapsed < this.defaultCircuitOptions.monitoringWindowMs) {
        circuit.failures = Math.max(0, circuit.failures - 1);
      }
    }
  }

  private recordFailure(
    name: string,
    overrides?: Partial<CircuitBreakerOptions>,
  ): void {
    const circuit = this.circuits.get(name);
    if (!circuit) return;

    const options = { ...this.defaultCircuitOptions, ...overrides };

    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.state = CircuitState.OPEN;
      this.logger.warn(`[${name}] Circuit breaker: HALF_OPEN → OPEN (recovery failed)`);
      return;
    }

    if (
      circuit.state === CircuitState.CLOSED &&
      circuit.failures >= options.failureThreshold
    ) {
      circuit.state = CircuitState.OPEN;
      this.logger.error(
        `[${name}] Circuit breaker: CLOSED → OPEN (${circuit.failures} failures in window)`,
      );
    }
  }

  /**
   * Get circuit breaker state for a named client.
   */
  getCircuitState(
    name: string,
  ): { state: CircuitState; failures: number } | null {
    const circuit = this.circuits.get(name);
    if (!circuit) return null;
    return { state: circuit.state, failures: circuit.failures };
  }

  // ─── Helpers ─────────────────────────────────────────────

  private isRetryableError(error: AxiosError): boolean {
    // Check status code
    if (error.response?.status && RETRYABLE_STATUS_CODES.has(error.response.status)) {
      return true;
    }

    // Check error code (network errors)
    if (error.code && RETRYABLE_ERROR_CODES.has(error.code)) {
      return true;
    }

    // Timeout
    if (error.message?.toLowerCase().includes('timeout')) {
      return true;
    }

    return false;
  }

  private calculateBackoff(attempt: number, baseDelay: number): number {
    // Exponential backoff with jitter
    const exponential = Math.pow(2, attempt - 1) * baseDelay;
    const jitter = Math.random() * baseDelay * 0.5;
    return Math.min(exponential + jitter, 30_000); // Cap at 30s
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
