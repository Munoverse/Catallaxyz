/**
 * Shared Database Module
 * AUDIT FIX v2.1: Centralized database utilities
 */

// Pool management
export {
  getPool,
  requirePool,
  closePool,
  configurePool,
  withClient,
  withTransaction,
  withTransactionRetry,
  healthCheck,
  type Pool,
  type PoolClient,
  type DbPoolConfig,
} from './pool';

// Helper functions
export {
  ensureUser,
  ensureUsers,
  getUserByWallet,
  ensureMarket,
  getMarketByAddress,
  outcomeToNumber,
  outcomeToString,
  sideToNumber,
  sideToString,
} from './helpers';
