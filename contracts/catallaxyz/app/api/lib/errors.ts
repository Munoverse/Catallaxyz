/**
 * Shared API Error Handling
 * AUDIT FIX v1.2.5: Centralize error handling for consistent API responses
 */

import { NextResponse } from 'next/server';

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Standard API success response format
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  message: string,
  status: number = 400,
  code?: string,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = { error: message };
  if (code) body.code = code;
  if (details && process.env.NODE_ENV !== 'production') {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}

/**
 * Create a standardized success response
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Handle unknown errors safely
 */
export function handleError(error: unknown, defaultMessage: string = 'An error occurred'): NextResponse<ApiErrorResponse> {
  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const message = process.env.NODE_ENV === 'production' ? defaultMessage : error.message;
    return errorResponse(message, 400);
  }
  return errorResponse(defaultMessage, 500);
}

/**
 * Common HTTP status codes
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
} as const;
