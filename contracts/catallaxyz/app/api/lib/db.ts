/**
 * Shared Database Connection Pool
 * AUDIT FIX v1.2.5: Centralize database connection pool for all API routes
 * 
 * This eliminates redundant pool creation across route files and ensures
 * consistent configuration and connection management.
 */

import { Pool, PoolClient } from 'pg';

// Singleton pool instance
let pool: Pool | null = null;

/**
 * Get the shared database connection pool
 * Creates the pool on first call, reuses thereafter
 */
export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === 'false'
          ? false
          : {
              rejectUnauthorized: process.env.NODE_ENV === 'production',
            },
      // Connection pool settings
      max: Number(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 5000,
    });

    // Handle pool errors to prevent unhandled rejections
    pool.on('error', (err) => {
      console.error('[DB Pool] Unexpected error on idle client:', err);
    });
  }

  return pool;
}

/**
 * Close the database pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

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

export type { Pool, PoolClient };
