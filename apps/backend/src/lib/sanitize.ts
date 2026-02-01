/**
 * Content Sanitization Utilities
 * AUDIT FIX v2.0.3: XSS prevention for user-generated content
 */

// HTML entities that need to be escaped
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`=\/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove HTML tags from a string
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize user input for safe storage and display
 * - Removes HTML tags
 * - Escapes special characters
 * - Trims whitespace
 * - Limits length
 */
export function sanitizeText(
  input: string | null | undefined,
  options: {
    maxLength?: number;
    allowNewlines?: boolean;
    stripHtml?: boolean;
  } = {}
): string {
  if (!input) return '';

  const {
    maxLength = 10000,
    allowNewlines = true,
    stripHtml: shouldStripHtml = true,
  } = options;

  let result = input.trim();

  // Remove HTML tags if requested
  if (shouldStripHtml) {
    result = stripHtml(result);
  }

  // Escape HTML entities
  result = escapeHtml(result);

  // Handle newlines
  if (!allowNewlines) {
    result = result.replace(/[\r\n]+/g, ' ');
  } else {
    // Normalize line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Limit consecutive newlines
    result = result.replace(/\n{3,}/g, '\n\n');
  }

  // Limit length
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  return result;
}

/**
 * Sanitize a comment for storage
 */
export function sanitizeComment(content: string | null | undefined): string {
  return sanitizeText(content, {
    maxLength: 5000,
    allowNewlines: true,
    stripHtml: true,
  });
}

/**
 * Sanitize a username
 */
export function sanitizeUsername(username: string | null | undefined): string {
  if (!username) return '';

  // Only allow alphanumeric, underscore, hyphen
  return username
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .substring(0, 50);
}

/**
 * Sanitize a market title
 */
export function sanitizeMarketTitle(title: string | null | undefined): string {
  return sanitizeText(title, {
    maxLength: 200,
    allowNewlines: false,
    stripHtml: true,
  });
}

/**
 * Sanitize market description
 */
export function sanitizeMarketDescription(description: string | null | undefined): string {
  return sanitizeText(description, {
    maxLength: 10000,
    allowNewlines: true,
    stripHtml: true,
  });
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitize JSON data (deep sanitization of string values)
 */
export function sanitizeJsonStrings(obj: any): any {
  if (typeof obj === 'string') {
    return escapeHtml(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeJsonStrings);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeJsonStrings(value);
    }
    return result;
  }
  return obj;
}
