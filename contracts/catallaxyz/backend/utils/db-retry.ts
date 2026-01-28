/**
 * Database Retry Mechanism
 * AUDIT FIX: Centralized retry logic for database operations
 * 
 * Features:
 * - Exponential backoff
 * - Configurable retry count
 * - Error classification
 * - Logging integration
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { createLogger } from './logger';

const logger = createLogger('db-retry');

// ============================================
// Types
// ============================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms (default: 100) */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 5000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Operation description for logging */
  operation?: string;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

// ============================================
// Error Classification
// ============================================

const RETRYABLE_ERROR_CODES = [
  // Connection errors
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  // PostgreSQL errors
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
];

/**
 * Check if an error is retryable
 */
export function isRetryableDbError(error: unknown): boolean {
  if (!error) return false;
  
  const err = error as { code?: string; message?: string };
  
  // Check error code
  if (err.code && RETRYABLE_ERROR_CODES.includes(err.code)) {
    return true;
  }
  
  // Check error message for common patterns
  const message = (err.message || '').toLowerCase();
  const retryablePatterns = [
    'connection refused',
    'connection reset',
    'connection terminated',
    'connection lost',
    'timeout',
    'timed out',
    'deadlock',
    'too many connections',
    'cannot connect',
    'network error',
  ];
  
  return retryablePatterns.some(pattern => message.includes(pattern));
}

// ============================================
// Core Retry Functions
// ============================================

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  const delay = initialDelayMs * Math.pow(multiplier, attempt);
  // Add jitter (0-10% random variation)
  const jitter = delay * Math.random() * 0.1;
  return Math.min(delay + jitter, maxDelayMs);
}

/**
 * Retry a database operation with exponential backoff
 */
export async function retryDbOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
    operation: opName = 'database operation',
  } = options;

  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 0) {
        logger.info(`${opName} succeeded after ${attempt + 1} attempts`);
      }
      
      return { success: true, result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry
      if (attempt < maxRetries && isRetryableDbError(error)) {
        const delay = calculateDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier);
        logger.warn(`${opName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms`, {
          error: lastError.message,
        });
        await sleep(delay);
        continue;
      }
      
      // Non-retryable error or max retries reached
      logger.error(`${opName} failed after ${attempt + 1} attempts`, lastError);
      break;
    }
  }
  
  return { success: false, error: lastError, attempts: maxRetries + 1 };
}

/**
 * Execute a query with retry
 */
export async function queryWithRetry<T extends QueryResult>(
  client: PoolClient | Pool,
  query: string,
  params?: unknown[],
  options: RetryOptions = {}
): Promise<T> {
  const result = await retryDbOperation(
    () => client.query(query, params) as Promise<T>,
    { ...options, operation: options.operation || 'query' }
  );
  
  if (!result.success) {
    throw result.error || new Error('Query failed after retries');
  }
  
  return result.result!;
}

/**
 * Execute a transaction with retry
 */
export async function transactionWithRetry<T>(
  pool: Pool,
  operations: (client: PoolClient) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const result = await retryDbOperation(
    async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await operations(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    { ...options, operation: options.operation || 'transaction' }
  );
  
  if (!result.success) {
    throw result.error || new Error('Transaction failed after retries');
  }
  
  return result.result!;
}

// ============================================
// Re-exported from db-pool.ts
// AUDIT FIX v1.2.5: Removed duplicate implementations, re-export from db-pool.ts
// ============================================

export {
  createPool,
  closePool,
  healthCheck,
  createPoolWithHealthCheck,
  requirePool,
  DEFAULT_POOL_CONFIG,
} from './db-pool';
