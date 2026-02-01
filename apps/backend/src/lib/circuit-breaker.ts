/**
 * Circuit Breaker Implementation
 * AUDIT FIX v2.0.3: Implement circuit breaker for external services
 * 
 * Prevents cascading failures when external services (Solana RPC, Supabase) are unavailable.
 */

import { logger } from './logger.js';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject all requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  /** Name of the service (for logging) */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms to wait before attempting recovery */
  resetTimeout?: number;
  /** Number of successful calls in half-open state to close circuit */
  successThreshold?: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30_000; // 30 seconds
    this.successThreshold = options.successThreshold ?? 2;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitBreakerError(`Circuit breaker [${this.name}] is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;
    
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }

    logger.warn('circuit-breaker', `Circuit [${this.name}] ${oldState} -> ${newState}`, {
      failureCount: this.failureCount,
    });

    this.onStateChange?.(oldState, newState);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): { state: CircuitState; failureCount: number; successCount: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }

  /** Manually reset the circuit breaker */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// ============================================
// Pre-configured circuit breakers
// ============================================

/** Circuit breaker for Solana RPC calls */
export const solanaCircuitBreaker = new CircuitBreaker({
  name: 'solana-rpc',
  failureThreshold: 5,
  resetTimeout: 30_000,
  successThreshold: 2,
});

/** Circuit breaker for Supabase calls */
export const supabaseCircuitBreaker = new CircuitBreaker({
  name: 'supabase',
  failureThreshold: 5,
  resetTimeout: 15_000,
  successThreshold: 2,
});

/** Circuit breaker for Redis calls */
export const redisCircuitBreaker = new CircuitBreaker({
  name: 'redis',
  failureThreshold: 3,
  resetTimeout: 10_000,
  successThreshold: 1,
});

/**
 * Helper to wrap a function with a circuit breaker
 */
export function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  return breaker.execute(fn);
}
