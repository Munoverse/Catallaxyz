/**
 * API Library Exports
 * AUDIT FIX v1.2.5: Centralized exports for shared API utilities
 */

// Database
export { getPool, closePool, withClient, withTransaction } from './db';
export type { Pool, PoolClient } from './db';

// Helpers
export {
  ensureUser,
  ensureMarket,
  getUserByWallet,
  getMarketByAddress,
  outcomeToNumber,
  outcomeToString,
} from './helpers';

// Errors
export {
  errorResponse,
  successResponse,
  handleError,
  HttpStatus,
} from './errors';
export type { ApiErrorResponse, ApiSuccessResponse } from './errors';

// Validation
export {
  validateTimestamp,
  validatePublicKey,
  validatePrice,
  validateSize,
  validateOutcome,
  validateSide,
  validateRequired,
  MAX_TIME_DRIFT_MS,
} from './validation';
