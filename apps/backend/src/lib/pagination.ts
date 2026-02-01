/**
 * Pagination Utilities
 * 
 * AUDIT FIX P2-5: Standardized pagination for API endpoints
 * Supports both offset-based and cursor-based pagination
 */

// PostgrestFilterBuilder type from Supabase - use 'any' to avoid peer dependency issues
type PostgrestFilterBuilder<T = any, U = any, V = any> = any;

/**
 * Pagination request parameters (offset-based)
 */
export interface OffsetPaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Pagination request parameters (cursor-based)
 */
export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
}

/**
 * Pagination response metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  offset: number;
  total?: number;
  hasMore: boolean;
}

/**
 * Cursor pagination response metadata
 */
export interface CursorPaginationMeta {
  limit: number;
  nextCursor?: string;
  hasMore: boolean;
}

// Default and maximum limits
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Parse offset pagination parameters from request query
 */
export function parseOffsetPagination(query: Record<string, string | undefined>): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit || String(DEFAULT_LIMIT), 10)));
  const offset = query.offset !== undefined 
    ? Math.max(0, parseInt(query.offset, 10))
    : (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Parse cursor pagination parameters from request query
 */
export function parseCursorPagination(query: Record<string, string | undefined>): {
  cursor: string | undefined;
  limit: number;
} {
  const cursor = query.cursor || undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit || String(DEFAULT_LIMIT), 10)));
  
  return { cursor, limit };
}

/**
 * Apply offset pagination to a Supabase query
 */
export function applyOffsetPagination<T>(
  query: PostgrestFilterBuilder<any, any, T[]>,
  pagination: { limit: number; offset: number }
): PostgrestFilterBuilder<any, any, T[]> {
  return query.range(pagination.offset, pagination.offset + pagination.limit - 1);
}

/**
 * Build pagination metadata from results
 */
export function buildPaginationMeta(
  items: unknown[],
  params: { page: number; limit: number; offset: number },
  total?: number
): PaginationMeta {
  return {
    page: params.page,
    limit: params.limit,
    offset: params.offset,
    total,
    hasMore: items.length === params.limit,
  };
}

/**
 * Build cursor pagination metadata
 * 
 * @param items - Items returned from query
 * @param limit - Requested limit
 * @param getCursor - Function to extract cursor from last item
 */
export function buildCursorPaginationMeta<T>(
  items: T[],
  limit: number,
  getCursor: (item: T) => string
): CursorPaginationMeta {
  const hasMore = items.length === limit;
  const lastItem = items[items.length - 1];
  
  return {
    limit,
    nextCursor: hasMore && lastItem ? getCursor(lastItem) : undefined,
    hasMore,
  };
}

/**
 * Create a paginated response object
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta
): {
  success: true;
  data: T[];
  pagination: PaginationMeta;
} {
  return {
    success: true,
    data,
    pagination,
  };
}

/**
 * Create a cursor-paginated response object
 */
export function createCursorPaginatedResponse<T>(
  data: T[],
  pagination: CursorPaginationMeta
): {
  success: true;
  data: T[];
  pagination: CursorPaginationMeta;
} {
  return {
    success: true,
    data,
    pagination,
  };
}

/**
 * Parse and decode cursor (base64 encoded timestamp or ID)
 */
export function decodeCursor(cursor: string): { timestamp?: string; id?: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    
    if (parts.length === 2) {
      const [type, value] = parts;
      if (type === 'ts') return { timestamp: value };
      if (type === 'id') return { id: value };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Encode cursor from timestamp or ID
 */
export function encodeCursor(type: 'ts' | 'id', value: string): string {
  return Buffer.from(`${type}:${value}`).toString('base64');
}

/**
 * Create a timestamp-based cursor from a date
 */
export function createTimestampCursor(date: Date | string): string {
  const timestamp = typeof date === 'string' ? date : date.toISOString();
  return encodeCursor('ts', timestamp);
}

/**
 * Create an ID-based cursor
 */
export function createIdCursor(id: string): string {
  return encodeCursor('id', id);
}

export default {
  parseOffsetPagination,
  parseCursorPagination,
  applyOffsetPagination,
  buildPaginationMeta,
  buildCursorPaginationMeta,
  createPaginatedResponse,
  createCursorPaginatedResponse,
  decodeCursor,
  encodeCursor,
  createTimestampCursor,
  createIdCursor,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
