/**
 * Retry handler with exponential backoff, jitter, and circuit breaker.
 *
 * Circuit states: CLOSED -> OPEN -> HALF_OPEN
 * - CLOSED: requests flow normally, failures increment counter
 * - OPEN: all requests fail immediately, after recoveryTimeout transitions to HALF_OPEN
 * - HALF_OPEN: one probe request allowed; success -> CLOSED, failure -> OPEN
 */

import type { CircuitBreakerConfig, CircuitState, RetryConfig } from "./types.js";

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.25,
};

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
};

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export class RetryHandler {
  private readonly retryConfig: RetryConfig;
  private readonly circuitConfig: CircuitBreakerConfig;

  // Circuit breaker state
  private circuitState: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private circuitOpenedAt = 0;

  constructor(config?: Partial<RetryConfig & CircuitBreakerConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.circuitConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Execute a function with retry logic and circuit breaker protection.
   * Retries on HTTP 429/500/502/503/504 errors and network failures.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit breaker
    if (!this.allowRequest()) {
      throw new Error(
        `Circuit breaker is OPEN. Retry after ${Math.ceil(this.remainingRecoveryTime() / 1000)}s.`
      );
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if the error is retryable
        if (!this.isRetryable(lastError)) {
          this.onFailure();
          throw lastError;
        }

        // Don't sleep on the last attempt
        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    this.onFailure();
    throw lastError ?? new Error("Retry handler exhausted all attempts.");
  }

  /** Get current circuit breaker state (for diagnostics). */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  /** Get consecutive failure count. */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /** Reset circuit breaker to CLOSED state. */
  resetCircuit(): void {
    this.circuitState = "CLOSED";
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = 0;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private allowRequest(): boolean {
    if (this.circuitState === "CLOSED") return true;
    if (this.circuitState === "HALF_OPEN") return true; // probe allowed

    // OPEN state: check if recovery timeout has elapsed
    if (Date.now() - this.circuitOpenedAt >= this.circuitConfig.recoveryTimeoutMs) {
      this.circuitState = "HALF_OPEN";
      return true;
    }

    return false;
  }

  private onSuccess(): void {
    if (this.circuitState === "HALF_OPEN") {
      // Probe succeeded, close the circuit
      this.circuitState = "CLOSED";
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.circuitConfig.failureThreshold) {
      this.circuitState = "OPEN";
      this.circuitOpenedAt = Date.now();
    }
  }

  /**
   * Exponential backoff with jitter:
   * delay = min(baseDelay * 2^attempt, maxDelay) * (1 - jitter * random())
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);
    const jitter = this.retryConfig.jitterFactor * Math.random();
    return Math.max(0, Math.floor(cappedDelay * (1 - jitter)));
  }

  private remainingRecoveryTime(): number {
    if (this.circuitState !== "OPEN") return 0;
    const elapsed = Date.now() - this.circuitOpenedAt;
    return Math.max(0, this.circuitConfig.recoveryTimeoutMs - elapsed);
  }

  private isRetryable(error: Error): boolean {
    // Retry on AbortError only if it came from a timeout we control
    if (error.name === "AbortError") return false;
    // Retry on network-level errors
    if (error.message.includes("ECONNREFUSED")) return true;
    if (error.message.includes("ECONNRESET")) return true;
    if (error.message.includes("ETIMEDOUT")) return true;
    if (error.message.includes("fetch failed")) return true;
    // Retry on retryable HTTP status codes
    for (const code of RETRYABLE_STATUS_CODES) {
      if (error.message.includes(`HTTP ${code}`)) return true;
      if (error.message.includes(`${code}`)) return true;
    }
    // If error message contains a status code pattern from our fetch wrapper
    const statusMatch = error.message.match(/(?:status|HTTP)[\s:]*(\d{3})/i);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      return RETRYABLE_STATUS_CODES.has(status);
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
