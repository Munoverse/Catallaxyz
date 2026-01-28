/**
 * API Utilities
 * AUDIT FIX v1.1.3: Centralized API fetch with retry and timeout
 */

// ============================================
// Types
// ============================================

export interface FetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 1000) */
  retryDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
  ok: boolean;
}

// ============================================
// Error Types
// ============================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof TypeError) return true; // Network errors
  if (error instanceof ApiError) {
    // Retry on 5xx errors and 429 (rate limit)
    return error.status >= 500 || error.status === 429;
  }
  return false;
}

// ============================================
// Core Fetch Function
// ============================================

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (err: unknown) {
    // AUDIT FIX v1.2.0: Use err: unknown for type safety
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TimeoutError(`Request to ${url} timed out after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch with retry and exponential backoff
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    backoffMultiplier = 2,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, fetchOptions);
      
      // Parse response body
      let data: T | undefined;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await response.json();
      }

      // Check for HTTP errors
      if (!response.ok) {
        const errorMessage = (data as { error?: string })?.error || response.statusText;
        throw new ApiError(errorMessage, response.status, data);
      }

      return {
        data,
        status: response.status,
        ok: true,
      };
    } catch (err: unknown) {
      // AUDIT FIX v1.2.0: Use err: unknown for type safety
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if we should retry
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
        // Add jitter (0-10%)
        const jitter = delay * Math.random() * 0.1;
        await sleep(delay + jitter);
        continue;
      }

      // Return error response
      if (err instanceof ApiError) {
        return {
          error: err.message,
          status: err.status,
          ok: false,
        };
      }

      return {
        error: lastError.message,
        status: 0,
        ok: false,
      };
    }
  }

  // Should not reach here, but just in case
  return {
    error: lastError?.message || 'Unknown error',
    status: 0,
    ok: false,
  };
}

// ============================================
// Convenience Methods
// ============================================

/**
 * GET request with retry
 */
export async function apiGet<T = unknown>(
  url: string,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return fetchWithRetry<T>(url, { ...options, method: 'GET' });
}

/**
 * POST request with retry
 */
export async function apiPost<T = unknown>(
  url: string,
  body: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return fetchWithRetry<T>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * PUT request with retry
 */
export async function apiPut<T = unknown>(
  url: string,
  body: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return fetchWithRetry<T>(url, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request with retry
 */
export async function apiDelete<T = unknown>(
  url: string,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return fetchWithRetry<T>(url, { ...options, method: 'DELETE' });
}

// ============================================
// Legacy Fetch Wrapper (for gradual migration)
// ============================================

/**
 * Drop-in replacement for fetch that adds timeout and basic retry
 * Use this for gradual migration from raw fetch calls
 */
export async function safeFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const response = await fetchWithTimeout(url, {
    timeout: options.timeout ?? 30000,
    ...options,
  });
  return response;
}
