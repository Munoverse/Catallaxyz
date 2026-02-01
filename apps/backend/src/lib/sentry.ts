/**
 * Sentry Error Tracking Integration
 * 
 * Initialize Sentry for error tracking in production.
 * Only active when SENTRY_DSN is configured.
 */

import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const isEnabled = !!SENTRY_DSN;

/**
 * Initialize Sentry
 * Call this at application startup
 */
export function initSentry(): void {
  if (!isEnabled) {
    logger.info('sentry', 'Sentry not configured (SENTRY_DSN not set)');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    
    // Performance monitoring
    tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0,
    
    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['poly_api_key'];
        delete event.request.headers['poly_passphrase'];
        delete event.request.headers['poly_signature'];
        delete event.request.headers['x-cron-secret'];
      }
      
      // Remove sensitive cookies
      if (event.request?.cookies) {
        event.request.cookies = { filtered: 'true' };
      }
      
      return event;
    },
    
    // Ignore certain errors
    ignoreErrors: [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'Network request failed',
      'Rate limited',
    ],
  });

  logger.info('sentry', `Sentry initialized for ${SENTRY_ENVIRONMENT}`);
}

/**
 * Capture an exception with Sentry
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (!isEnabled) {
    logger.error('sentry', 'Error captured (Sentry disabled)', error);
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a message with Sentry
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!isEnabled) {
    logger.info('sentry', `Message: ${message}`);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id: string; walletAddress?: string; username?: string }): void {
  if (!isEnabled) return;

  Sentry.setUser({
    id: user.id,
    username: user.username,
    // Don't include wallet address in Sentry for privacy
  });
}

/**
 * Clear user context
 */
export function clearUser(): void {
  if (!isEnabled) return;
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, any>
): void {
  if (!isEnabled) return;

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

/**
 * Flush pending events (call before process exit)
 */
export async function flush(timeout = 2000): Promise<void> {
  if (!isEnabled) return;
  await Sentry.close(timeout);
}

export default {
  init: initSentry,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  flush,
  isEnabled,
};
