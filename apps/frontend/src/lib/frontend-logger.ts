/**
 * Frontend Logger Utility
 * 
 * AUDIT FIX F-53: Standardized frontend logging
 * 
 * Usage:
 *   import { logger } from '@/lib/frontend-logger';
 *   logger.error('component-name', 'Error message', error);
 *   logger.warn('component-name', 'Warning message', data);
 *   logger.debug('component-name', 'Debug message', data);
 * 
 * Features:
 * - Consistent logging format across the app
 * - Automatically disabled in production (except errors)
 * - Sanitizes sensitive data from logs
 */

const isDev = process.env.NODE_ENV === 'development';

// Patterns to detect sensitive data
const SENSITIVE_PATTERNS = [
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, // Solana addresses
  /^[a-f0-9]{64}$/i, // Hex hashes/signatures
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /private[_-]?key/i,
];

// Mask sensitive values
function maskValue(value: string): string {
  if (!value || value.length < 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// Check if a value looks sensitive
function isSensitive(key: string, value: unknown): boolean {
  if (typeof value === 'string') {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(key) || pattern.test(value)) {
        return true;
      }
    }
  }
  return false;
}

// Recursively sanitize an object
function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[nested]';
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // Check if it looks like a wallet address
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(obj)) {
      return maskValue(obj);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map(item => sanitize(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isSensitive(key, value)) {
        sanitized[key] = typeof value === 'string' ? maskValue(value) : '[redacted]';
      } else {
        sanitized[key] = sanitize(value, depth + 1);
      }
    }
    return sanitized;
  }
  
  return obj;
}

// Format error for logging
function formatError(error: unknown): object {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Only include stack in development
      ...(isDev ? { stack: error.stack?.split('\n').slice(0, 5).join('\n') } : {}),
    };
  }
  return { value: String(error) };
}

// Format log message
function formatMessage(level: string, context: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
  return `[${timestamp}] [${level}] [${context}] ${message}`;
}

export const logger = {
  /**
   * Log debug information (only in development)
   */
  debug: (context: string, message: string, data?: unknown): void => {
    if (!isDev) return;
    const formatted = formatMessage('DEBUG', context, message);
    if (data !== undefined) {
      console.log(formatted, sanitize(data));
    } else {
      console.log(formatted);
    }
  },

  /**
   * Log informational messages (only in development)
   */
  info: (context: string, message: string, data?: unknown): void => {
    if (!isDev) return;
    const formatted = formatMessage('INFO', context, message);
    if (data !== undefined) {
      console.log(formatted, sanitize(data));
    } else {
      console.log(formatted);
    }
  },

  /**
   * Log warnings (only in development)
   */
  warn: (context: string, message: string, data?: unknown): void => {
    if (!isDev) return;
    const formatted = formatMessage('WARN', context, message);
    if (data !== undefined) {
      console.warn(formatted, sanitize(data));
    } else {
      console.warn(formatted);
    }
  },

  /**
   * Log errors (always logged, even in production)
   */
  error: (context: string, message: string, error?: unknown): void => {
    const formatted = formatMessage('ERROR', context, message);
    if (error !== undefined) {
      console.error(formatted, formatError(error));
    } else {
      console.error(formatted);
    }
  },
};

export default logger;
