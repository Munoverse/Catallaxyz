/**
 * Database Pool Configuration
 * AUDIT FIX v1.2.1: Centralized database pool configuration to avoid duplication
 * AUDIT FIX v1.2.5: Now uses config.ts for default values
 */

import { Pool } from 'pg';
import { createLogger } from './logger';
import { DB_CONFIG } from './config';

const logger = createLogger('db-pool');

// ============================================
// Shared Configuration (uses config.ts)
// ============================================

export const DEFAULT_POOL_CONFIG = {
  max: DB_CONFIG.maxConnections,
  idleTimeoutMillis: DB_CONFIG.idleTimeoutMs,
  connectionTimeoutMillis: DB_CONFIG.connectionTimeoutMs,
} as const;

// ============================================
// Pool Factory
// ============================================

/**
 * Create a database pool with standardized configuration
 * Returns null if DATABASE_URL is not set
 */
export function createPool(options?: {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    logger.warn('DATABASE_URL not set, database operations will be disabled');
    return null;
  }
  
  const ssl = process.env.DATABASE_SSL === 'false'
    ? false
    : { rejectUnauthorized: true };
  
  const pool = new Pool({
    connectionString,
    ssl,
    max: options?.max ?? DEFAULT_POOL_CONFIG.max,
    idleTimeoutMillis: options?.idleTimeoutMillis ?? DEFAULT_POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: options?.connectionTimeoutMillis ?? DEFAULT_POOL_CONFIG.connectionTimeoutMillis,
  });
  
  // Add error handler to prevent unhandled errors
  pool.on('error', (err) => {
    logger.error('Unexpected pool error', err);
  });
  
  return pool;
}

/**
 * Ensure pool is available, throw if not
 */
export function requirePool(pool: Pool | null): Pool {
  if (!pool) {
    throw new Error('DATABASE_URL not configured');
  }
  return pool;
}

/**
 * Gracefully close pool
 */
export async function closePool(pool: Pool | null): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error('Error closing pool', err);
    }
  }
}

/**
 * AUDIT FIX v1.2.2: Health check for connection pool
 * Verifies pool can connect and execute queries
 */
export async function healthCheck(pool: Pool | null): Promise<boolean> {
  if (!pool) {
    logger.warn('Health check failed: pool is null');
    return false;
  }
  
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT 1 as health');
    const healthy = result.rows.length === 1 && result.rows[0].health === 1;
    if (healthy) {
      logger.debug('Health check passed');
    } else {
      logger.warn('Health check returned unexpected result');
    }
    return healthy;
  } catch (err) {
    logger.error('Health check failed', err);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Create pool with initial health check
 */
export async function createPoolWithHealthCheck(options?: {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}): Promise<Pool> {
  const pool = createPool(options);
  if (!pool) {
    throw new Error('DATABASE_URL not configured');
  }
  
  const healthy = await healthCheck(pool);
  if (!healthy) {
    await closePool(pool);
    throw new Error('Database health check failed');
  }
  
  logger.info('Database pool created and verified healthy');
  return pool;
}
