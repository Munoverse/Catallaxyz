/**
 * Backend Configuration
 * AUDIT FIX: Centralized configuration to eliminate hardcoded values
 * 
 * All configurable values should be defined here with sensible defaults.
 * Values can be overridden via environment variables.
 */

import { parseNum, parseBool, optionalEnv } from './env-validation';

// ============================================
// Database Configuration
// ============================================

export const DB_CONFIG = {
  /** Maximum number of connections in pool */
  maxConnections: parseNum('DB_MAX_CONNECTIONS', 10, { min: 1, max: 100 }),
  
  /** Idle timeout in milliseconds */
  idleTimeoutMs: parseNum('DB_IDLE_TIMEOUT_MS', 30000, { min: 1000 }),
  
  /** Connection timeout in milliseconds */
  connectionTimeoutMs: parseNum('DB_CONNECTION_TIMEOUT_MS', 5000, { min: 1000 }),
  
  /** Whether to use SSL (default: true in production) */
  ssl: process.env.DATABASE_SSL !== 'false',
  
  /** Reject unauthorized SSL certificates (default: true in production) */
  sslRejectUnauthorized: process.env.NODE_ENV === 'production',
} as const;

// ============================================
// Sync Configuration
// ============================================

export const SYNC_CONFIG = {
  /** Batch size for sync operations */
  batchSize: parseNum('SYNC_BATCH_SIZE', 100, { min: 10, max: 1000 }),
  
  /** Sync interval in milliseconds */
  intervalMs: parseNum('SYNC_INTERVAL_MS', 10000, { min: 1000 }),
  
  /** Strict mode: rollback on any failure */
  strictMode: parseBool('STRICT_SYNC', false),
  
  /** Dry run mode: don't make actual changes */
  dryRun: parseBool('DRY_RUN', false),
} as const;

// ============================================
// Retry Configuration
// ============================================

export const RETRY_CONFIG = {
  /** Maximum retry attempts */
  maxRetries: parseNum('RETRY_MAX_ATTEMPTS', 3, { min: 0, max: 10 }),
  
  /** Initial delay in milliseconds */
  initialDelayMs: parseNum('RETRY_INITIAL_DELAY_MS', 100, { min: 10 }),
  
  /** Maximum delay in milliseconds */
  maxDelayMs: parseNum('RETRY_MAX_DELAY_MS', 5000, { min: 100 }),
  
  /** Backoff multiplier */
  backoffMultiplier: parseNum('RETRY_BACKOFF_MULTIPLIER', 2, { min: 1, max: 10 }),
} as const;

// ============================================
// Termination Configuration
// ============================================

export const TERMINATION_CONFIG = {
  /** Enable inactivity termination */
  enabled: parseBool('ENABLE_INACTIVITY_TERMINATION', false),
  
  /** Inactivity timeout in seconds */
  timeoutSeconds: parseNum('INACTIVITY_TIMEOUT_SECONDS', 604800, { min: 1 }), // 7 days default
  
  /** Maximum terminations per run */
  maxPerRun: parseNum('MAX_TERMINATIONS', 10, { min: 0 }),
  
  /** Termination execution reward in USDC lamports */
  executionReward: parseNum('TERMINATION_EXECUTION_REWARD', 1_000_000, { min: 0 }),
} as const;

// ============================================
// CLOB Configuration
// ============================================

export const CLOB_CONFIG = {
  /** Orderbook file path */
  orderbookPath: optionalEnv('CLOB_ORDERBOOK_PATH', 'backend/db/orderbook.json'),
  
  /** Tick size for price levels */
  tickSize: parseNum('CLOB_TICK_SIZE', 0.001, { min: 0.0001, max: 0.1 }),
  
  /** Enforce on-chain balance checks */
  enforceBalanceCheck: parseBool('CLOB_ENFORCE_BALANCE_CHECK', true),
  
  /** Maximum order size in USDC lamports */
  maxOrderSize: parseNum('CLOB_MAX_ORDER_SIZE', 1_000_000_000_000, { min: 1_000_000 }), // 1M USDC default
  
  /** Minimum order size in USDC lamports */
  minOrderSize: parseNum('CLOB_MIN_ORDER_SIZE', 1_000_000, { min: 1000 }), // 1 USDC default
  
  /** Order expiry buffer in milliseconds */
  orderExpiryBufferMs: parseNum('CLOB_ORDER_EXPIRY_BUFFER_MS', 60000, { min: 1000 }),
} as const;

// ============================================
// Logging Configuration
// ============================================

export const LOG_CONFIG = {
  /** Minimum log level */
  level: optionalEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
  
  /** Use JSON format (default: true in production) */
  jsonFormat: process.env.NODE_ENV === 'production',
  
  /** Include timestamps */
  includeTimestamp: true,
} as const;

// ============================================
// Solana Configuration
// ============================================

export const SOLANA_CONFIG = {
  /** RPC URL */
  rpcUrl: optionalEnv('ANCHOR_PROVIDER_URL', 'https://api.devnet.solana.com'),
  
  /** Commitment level */
  commitment: optionalEnv('SOLANA_COMMITMENT', 'confirmed') as 'processed' | 'confirmed' | 'finalized',
  
  /** Transaction timeout in milliseconds */
  txTimeoutMs: parseNum('SOLANA_TX_TIMEOUT_MS', 60000, { min: 10000 }),
  
  /** Skip preflight checks */
  skipPreflight: parseBool('SOLANA_SKIP_PREFLIGHT', false),
} as const;

// ============================================
// API Configuration
// ============================================

export const API_CONFIG = {
  /** HMAC secret for API authentication */
  hmacSecret: process.env.API_HMAC_SECRET,
  
  /** Cron secret for scheduled tasks */
  cronSecret: process.env.CRON_SECRET,
  
  /** Rate limit: requests per minute */
  rateLimitPerMinute: parseNum('API_RATE_LIMIT', 60, { min: 1 }),
  
  /** CORS allowed origins */
  corsOrigins: optionalEnv('CORS_ORIGINS', '*'),
} as const;

// ============================================
// Export All Configs
// ============================================

export const config = {
  db: DB_CONFIG,
  sync: SYNC_CONFIG,
  retry: RETRY_CONFIG,
  termination: TERMINATION_CONFIG,
  clob: CLOB_CONFIG,
  log: LOG_CONFIG,
  solana: SOLANA_CONFIG,
  api: API_CONFIG,
} as const;

export default config;
