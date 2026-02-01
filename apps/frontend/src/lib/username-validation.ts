/**
 * Username Validation Utility
 * AUDIT FIX v1.2.7: Centralized username validation logic
 * Replaces duplicate logic in CreateUsernameDialog.tsx and UsernameSetupDialog.tsx
 */

export interface UsernameValidationResult {
  isValid: boolean;
  error: string | null;
}

// Username constraints
const MIN_LENGTH = 3;
const MAX_LENGTH = 20;
const VALID_PATTERN = /^[a-zA-Z0-9_]+$/;

// Reserved usernames that cannot be used
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'system',
  'root',
  'support',
  'help',
  'info',
  'contact',
  'api',
  'null',
  'undefined',
  'catallaxyz',
  'catalla',
]);

/**
 * Validate username format and constraints
 */
export function validateUsername(username: string): UsernameValidationResult {
  // Trim whitespace
  const trimmed = username.trim();

  // Check if empty
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Username is required',
    };
  }

  // Check minimum length
  if (trimmed.length < MIN_LENGTH) {
    return {
      isValid: false,
      error: `Username must be at least ${MIN_LENGTH} characters`,
    };
  }

  // Check maximum length
  if (trimmed.length > MAX_LENGTH) {
    return {
      isValid: false,
      error: `Username must be at most ${MAX_LENGTH} characters`,
    };
  }

  // Check pattern (alphanumeric and underscore only)
  if (!VALID_PATTERN.test(trimmed)) {
    return {
      isValid: false,
      error: 'Username can only contain letters, numbers, and underscores',
    };
  }

  // Check if starts with underscore
  if (trimmed.startsWith('_')) {
    return {
      isValid: false,
      error: 'Username cannot start with an underscore',
    };
  }

  // Check if ends with underscore
  if (trimmed.endsWith('_')) {
    return {
      isValid: false,
      error: 'Username cannot end with an underscore',
    };
  }

  // Check consecutive underscores
  if (trimmed.includes('__')) {
    return {
      isValid: false,
      error: 'Username cannot contain consecutive underscores',
    };
  }

  // Check reserved usernames
  if (RESERVED_USERNAMES.has(trimmed.toLowerCase())) {
    return {
      isValid: false,
      error: 'This username is reserved',
    };
  }

  return {
    isValid: true,
    error: null,
  };
}

/**
 * Normalize username for storage (lowercase, trimmed)
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Format username for display (with @ prefix if needed)
 */
export function formatUsernameForDisplay(username: string | null | undefined): string {
  if (!username) return '';
  const trimmed = username.trim();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}
