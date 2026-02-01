/**
 * Secure Error Handler
 * 
 * SECURITY: Prevents leaking internal error details in production
 * - In development: Returns full error details for debugging
 * - In production: Returns sanitized error messages
 * 
 * AUDIT FIX B-M1: Standard error response format
 * All API errors should use this format:
 * {
 *   success: false,
 *   error: {
 *     code: ErrorCodeType,  // e.g., 'VALIDATION_ERROR', 'NOT_FOUND'
 *     message: string,       // User-friendly message
 *     details?: object       // Development only
 *   }
 * }
 * 
 * Usage in routes:
 * - For validation errors: sendSafeError(reply, 400, ErrorCode.VALIDATION_ERROR, 'message')
 * - For database errors: return handleDatabaseError(error, 'operation name')
 * - For catch blocks: handleRouteError(reply, error, 'context message')
 * - For manual responses: createErrorResponse(code, message, error, details)
 */

import { logger } from './logger.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Error codes for API responses
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Map of user-friendly error messages for production
 */
const SAFE_ERROR_MESSAGES: Record<ErrorCodeType, string> = {
  VALIDATION_ERROR: 'Invalid request data',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  CONFLICT: 'Resource conflict',
  RATE_LIMITED: 'Too many requests, please try again later',
  SERVER_ERROR: 'An unexpected error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
};

/**
 * Structured API error response
 */
export interface ApiError {
  code: ErrorCodeType;
  message: string;
  details?: Record<string, any>; // Only included in development
}

/**
 * Create a safe error response
 * 
 * @param code - Error code
 * @param message - Detailed error message (may be sanitized in production)
 * @param originalError - Original error object (logged but not exposed in production)
 * @param details - Additional error details (only exposed in development)
 */
export function createErrorResponse(
  code: ErrorCodeType,
  message: string,
  originalError?: Error | unknown,
  details?: Record<string, any>
): { success: false; error: ApiError } {
  // Always log the full error for debugging
  if (originalError) {
    logger.error('error-handler', `[${code}] ${message}`, originalError);
  }

  // In production, use safe generic messages
  const safeMessage = IS_PRODUCTION ? SAFE_ERROR_MESSAGES[code] : message;

  const error: ApiError = {
    code,
    message: safeMessage,
  };

  // Only include details in development mode
  if (!IS_PRODUCTION && details) {
    error.details = details;
  }

  return {
    success: false,
    error,
  };
}

/**
 * Get HTTP status code for an error code
 */
export function getHttpStatusCode(code: ErrorCodeType): number {
  switch (code) {
    case ErrorCode.VALIDATION_ERROR:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
      return 409;
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 503;
    case ErrorCode.SERVER_ERROR:
    default:
      return 500;
  }
}

/**
 * Determine if an error message is safe to expose
 * (doesn't contain internal implementation details)
 */
function isSafeMessage(message: string): boolean {
  const unsafePatterns = [
    /sql/i,
    /database/i,
    /query/i,
    /connection/i,
    /timeout/i,
    /stack/i,
    /trace/i,
    /internal/i,
    /secret/i,
    /key/i,
    /password/i,
    /token/i,
    /path/i,
    /file/i,
    /node_modules/i,
    /\.ts$/i,
    /\.js$/i,
  ];

  return !unsafePatterns.some((pattern) => pattern.test(message));
}

/**
 * Sanitize error message for production
 * Removes potentially sensitive information
 */
export function sanitizeErrorMessage(message: string, code: ErrorCodeType): string {
  if (!IS_PRODUCTION) {
    return message;
  }

  if (isSafeMessage(message)) {
    return message;
  }

  return SAFE_ERROR_MESSAGES[code];
}

/**
 * Handle database errors safely
 */
export function handleDatabaseError(
  error: any,
  operation: string
): { success: false; error: ApiError } {
  // Log the full error
  logger.error('error-handler', `[Database Error] ${operation}`, error);

  // Check for specific Supabase/PostgreSQL error codes
  const pgCode = error?.code;
  
  if (pgCode === '23505') {
    // Unique violation
    return createErrorResponse(
      ErrorCode.CONFLICT,
      'Resource already exists'
    );
  }
  
  if (pgCode === '23503') {
    // Foreign key violation
    return createErrorResponse(
      ErrorCode.VALIDATION_ERROR,
      'Referenced resource not found'
    );
  }
  
  if (pgCode === 'PGRST116') {
    // No rows returned (Supabase)
    return createErrorResponse(
      ErrorCode.NOT_FOUND,
      'Resource not found'
    );
  }

  // Generic database error
  return createErrorResponse(
    ErrorCode.SERVER_ERROR,
    IS_PRODUCTION ? 'Database operation failed' : error.message,
    error
  );
}

/**
 * Fastify error handler hook
 * Use with app.setErrorHandler()
 */
export function fastifyErrorHandler(error: any, request: any, reply: any) {
  logger.error('error-handler', '[Unhandled Error]', {
    url: request.url,
    method: request.method,
    error: error.message,
    stack: error.stack,
  });

  const statusCode = error.statusCode || 500;
  const code = statusCode === 401 ? ErrorCode.UNAUTHORIZED :
               statusCode === 403 ? ErrorCode.FORBIDDEN :
               statusCode === 404 ? ErrorCode.NOT_FOUND :
               ErrorCode.SERVER_ERROR;

  const response = createErrorResponse(
    code,
    error.message,
    error
  );

  return reply.code(statusCode).send(response);
}

/**
 * Send a safe error response
 * Convenience function for route handlers
 * 
 * AUDIT FIX B-03: Prevents sensitive error information from being exposed
 */
export function sendSafeError(
  reply: any,
  statusCode: number,
  code: ErrorCodeType,
  message: string,
  originalError?: Error | unknown
): void {
  const safeMessage = sanitizeErrorMessage(message, code);
  
  if (originalError) {
    logger.error('error-handler', `[${code}] ${message}`, originalError);
  }

  reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message: safeMessage,
    },
  });
}

/**
 * Handle route errors safely - use in catch blocks
 * 
 * Example:
 * catch (error) {
 *   return handleRouteError(reply, error, 'Failed to create order');
 * }
 */
export function handleRouteError(
  reply: any,
  error: unknown,
  context: string
): void {
  logger.error('error-handler', context, error);
  
  sendSafeError(
    reply,
    500,
    ErrorCode.SERVER_ERROR,
    context,
    error
  );
}
