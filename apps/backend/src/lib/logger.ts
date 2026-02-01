/**
 * Secure Logger Utility
 * Sanitizes sensitive data before logging
 */

// Fields that should be masked or hidden in logs
const SENSITIVE_FIELDS = [
  'walletAddress',
  'wallet_address',
  'magicIssuer',
  'magic_user_id',
  'magic_issuer',
  'privateKey',
  'secret',
  'password',
  'token',
  'authorization',
  'signature',
  'email',
  'emailAddress',
];

// Mask sensitive values
function maskValue(value: string): string {
  if (!value || value.length < 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// Recursively sanitize an object
function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 5) return '[nested]';
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // Check if it looks like a wallet address (base58, 32-44 chars)
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(obj)) {
      return maskValue(obj);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some(f => lowerKey.includes(f.toLowerCase()))) {
        if (typeof value === 'string') {
          sanitized[key] = maskValue(value);
        } else {
          sanitized[key] = '[redacted]';
        }
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }
  
  return obj;
}

// Logger levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel): boolean {
  if (level === 'debug' && isProduction) return false;
  return true;
}

function formatMessage(level: LogLevel, context: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const sanitizedData = data ? sanitizeObject(data) : undefined;
  
  const base = `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`;
  
  if (sanitizedData !== undefined) {
    return `${base} ${JSON.stringify(sanitizedData)}`;
  }
  
  return base;
}

export const logger = {
  debug: (context: string, message: string, data?: any) => {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', context, message, data));
    }
  },
  
  info: (context: string, message: string, data?: any) => {
    if (shouldLog('info')) {
      console.log(formatMessage('info', context, message, data));
    }
  },
  
  warn: (context: string, message: string, data?: any) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', context, message, data));
    }
  },
  
  error: (context: string, message: string, error?: any) => {
    if (shouldLog('error')) {
      const sanitizedError = error ? {
        message: error.message,
        code: error.code,
        // Don't include stack trace in production
        stack: isProduction ? undefined : error.stack,
      } : undefined;
      console.error(formatMessage('error', context, message, sanitizedError));
    }
  },
};

export default logger;
