/**
 * Structured Logging Module
 * AUDIT FIX: Centralized structured logging for backend services
 * AUDIT FIX v2.1 (MED-23): Added sensitive info filtering
 * 
 * Features:
 * - JSON structured output for production
 * - Pretty console output for development
 * - Log levels: debug, info, warn, error
 * - Context enrichment (service name, request ID, etc.)
 * - Performance timing
 * - Sensitive data filtering
 */

// ============================================
// Types
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  service?: string;
  requestId?: string;
  userId?: string;
  marketId?: string;
  transactionId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
}

// ============================================
// Sensitive Data Filtering (MED-23)
// ============================================

const SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'authorization',
  'cookie',
  'session',
];

const WALLET_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function sanitizeValue(key: string, value: unknown): unknown {
  const keyLower = key.toLowerCase();
  
  // Check if key contains sensitive words
  if (SENSITIVE_KEYS.some(sk => keyLower.includes(sk.toLowerCase()))) {
    return '[REDACTED]';
  }
  
  // Truncate wallet addresses (show first 4 and last 4 chars)
  if (typeof value === 'string' && WALLET_ADDRESS_REGEX.test(value) && value.length > 20) {
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
  
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = sanitizeValue(key, value);
    }
  }
  
  return sanitized;
}

function limitStackTrace(stack: string | undefined, maxLines: number = 10): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split('\n');
  if (lines.length <= maxLines) return stack;
  return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}

// ============================================
// Configuration
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === 'production';
const minLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'] ?? LOG_LEVELS.info;

// ============================================
// Logger Class
// ============================================

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Log a message at the specified level
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...data },
    };

    if (isProduction) {
      // JSON output for production (easy to parse by log aggregators)
      console.log(JSON.stringify(entry));
    } else {
      // Pretty output for development
      const prefix = this.getPrefix(level);
      const contextStr = Object.keys(entry.context || {}).length > 0
        ? ` ${JSON.stringify(entry.context)}`
        : '';
      console.log(`${prefix} ${message}${contextStr}`);
    }
  }

  private getPrefix(level: LogLevel): string {
    const icons: Record<LogLevel, string> = {
      debug: '🔍',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
    };
    return `[${new Date().toISOString()}] ${icons[level]}`;
  }

  /**
   * Debug level logging
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Info level logging
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Warning level logging
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Error level logging
   * AUDIT FIX v2.1 (MED-23): Sanitize sensitive data in logs
   */
  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    // Sanitize context data
    const sanitizedContext = data ? sanitizeObject({ ...this.context, ...data }) : { ...this.context };
    
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context: sanitizedContext as LogContext,
    };

    if (error instanceof Error) {
      entry.error = {
        name: error.name,
        message: error.message,
        // Limit stack trace in production to prevent info leakage
        stack: isProduction ? limitStackTrace(error.stack, 5) : error.stack,
      };
    } else if (error) {
      entry.error = {
        name: 'UnknownError',
        message: String(error),
      };
    }

    if (isProduction) {
      console.error(JSON.stringify(entry));
    } else {
      const prefix = this.getPrefix('error');
      console.error(`${prefix} ${message}`, entry.error || '');
      if (data && Object.keys(data).length > 0) {
        console.error('  Context:', sanitizedContext);
      }
    }
  }

  /**
   * Start a timer for measuring operation duration
   */
  startTimer(operation: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.info(`${operation} completed`, { duration, durationMs: duration });
    };
  }

  /**
   * Log with timing wrapper
   */
  async timed<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const endTimer = this.startTimer(operation);
    try {
      const result = await fn();
      endTimer();
      return result;
    } catch (error) {
      this.error(`${operation} failed`, error);
      throw error;
    }
  }
}

// ============================================
// Default Loggers
// ============================================

/**
 * Create a logger for a specific service
 */
export function createLogger(service: string): Logger {
  return new Logger({ service });
}

/**
 * Default logger instance
 */
export const logger = new Logger();

// ============================================
// Service-specific Loggers
// ============================================

export const syncMarketsLogger = createLogger('sync-markets');
export const checkInactiveLogger = createLogger('check-inactive');
export const terminateInactiveLogger = createLogger('terminate-inactive');
export const clobLogger = createLogger('clob');
