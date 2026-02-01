/**
 * Unified Database Connection Pool
 * AUDIT FIX v2.1 (HIGH-16): Centralized database pool for all services
 * 
 * This eliminates duplicate pool implementations across:
 * - /app/api/lib/db.ts
 * - /backend/utils/db-pool.ts
 * 
 * Usage:
 *   import { getPool, withClient, withTransaction } from '@/shared/db/pool';
 */

import { Pool, PoolClient, PoolConfig } from 'pg';

// ============================================
// Configuration
// ============================================

export interface DbPoolConfig {
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

// AUDIT FIX D-H7: Increase default pool size for high concurrency
const DEFAULT_CONFIG: Required<DbPoolConfig> = {
  maxConnections: 20, // Increased from 10 for better concurrency handling
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 5000,
};

// ============================================
// Singleton Pool Instance
// ============================================

let pool: Pool | null = null;
let poolConfig: DbPoolConfig = {};

/**
 * Configure the pool before first use (optional)
 * Must be called before getPool() if custom config is needed
 */
export function configurePool(config: DbPoolConfig): void {
  if (pool) {
    console.warn('[DB Pool] Pool already created, configuration ignored');
    return;
  }
  poolConfig = config;
}

/**
 * Get the shared database connection pool
 * Creates the pool on first call, reuses thereafter
 */
export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    // AUDIT FIX D-H5: Ensure SSL is enabled in production
    const isProduction = process.env.NODE_ENV === 'production';
    const sslDisabled = process.env.DATABASE_SSL === 'false';
    
    if (isProduction && sslDisabled) {
      console.warn('[DB Pool] WARNING: SSL is disabled in production environment!');
    }
    
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: sslDisabled
        ? false
        : {
            rejectUnauthorized: isProduction,
          },
      max: poolConfig.maxConnections ?? Number(process.env.DB_POOL_MAX) || DEFAULT_CONFIG.maxConnections,
      idleTimeoutMillis: poolConfig.idleTimeoutMs ?? Number(process.env.DB_IDLE_TIMEOUT_MS) || DEFAULT_CONFIG.idleTimeoutMs,
      connectionTimeoutMillis: poolConfig.connectionTimeoutMs ?? Number(process.env.DB_CONNECT_TIMEOUT_MS) || DEFAULT_CONFIG.connectionTimeoutMs,
    };

    pool = new Pool(config);

    // Handle pool errors to prevent unhandled rejections
    pool.on('error', (err) => {
      console.error('[DB Pool] Unexpected error on idle client:', err);
    });
  }

  return pool;
}

/**
 * Require pool to be available, throw if not configured
 */
export function requirePool(): Pool {
  const p = getPool();
  if (!p) {
    throw new Error('DATABASE_URL not configured');
  }
  return p;
}

/**
 * Close the database pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      console.log('[DB Pool] Database pool closed');
    } catch (err) {
      console.error('[DB Pool] Error closing pool:', err);
    }
    pool = null;
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Execute a function with a pooled client, automatically releasing on completion
 */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T | null> {
  const p = getPool();
  if (!p) {
    return null;
  }

  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Execute a function within a transaction
 * Automatically commits on success, rolls back on error
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T | null> {
  const p = getPool();
  if (!p) {
    return null;
  }

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a function within a transaction with retry logic
 */
export async function withTransactionRetry<T>(
  fn: (client: PoolClient) => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<T> {
  const p = requirePool();
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 100;
  const maxDelayMs = options?.maxDelayMs ?? 5000;

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable (deadlock, serialization failure)
      const isRetryable = 
        lastError.message.includes('deadlock') ||
        lastError.message.includes('could not serialize') ||
        lastError.message.includes('40001') || // serialization_failure
        lastError.message.includes('40P01');   // deadlock_detected
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw lastError;
      }
      
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      client.release();
    }
  }
  
  throw lastError;
}

/**
 * Health check for the connection pool
 */
export async function healthCheck(): Promise<boolean> {
  const p = getPool();
  if (!p) {
    return false;
  }

  let client: PoolClient | null = null;
  try {
    client = await p.connect();
    const result = await client.query('SELECT 1 as health');
    return result.rows.length === 1 && result.rows[0].health === 1;
  } catch {
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Re-export types for convenience
export type { Pool, PoolClient };
