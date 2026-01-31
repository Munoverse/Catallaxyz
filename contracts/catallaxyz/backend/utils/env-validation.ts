/**
 * Environment Variable Validation Module
 * AUDIT FIX: Centralized validation for all backend services
 * 
 * Usage:
 *   import { validateEnv, EnvConfig } from './utils/env-validation';
 *   const config = validateEnv(['DATABASE_URL', 'ANCHOR_PROVIDER_URL']);
 */

import { PublicKey } from '@solana/web3.js';

// ============================================
// Type Definitions
// ============================================

export interface EnvConfig {
  DATABASE_URL?: string;
  DATABASE_SSL?: string;
  ANCHOR_PROVIDER_URL?: string;
  ANCHOR_WALLET?: string;
  NEXT_PUBLIC_PROGRAM_ID?: string;
  NEXT_PUBLIC_SOLANA_RPC_URL?: string;
  CRON_SECRET?: string;
  ENABLE_INACTIVITY_TERMINATION?: boolean;
  INACTIVITY_TIMEOUT_SECONDS?: number;
  MAX_TERMINATIONS?: number;
  DRY_RUN?: boolean;
  STRICT_SYNC?: boolean;
  CLOB_ORDERBOOK_PATH?: string;
  CLOB_TICK_SIZE?: number;
  CLOB_ENFORCE_BALANCE_CHECK?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: EnvConfig;
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate a required environment variable
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default
 */
export function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : defaultValue;
}

/**
 * Parse a boolean environment variable
 */
export function parseBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value for ${name}: ${value}`);
}

/**
 * Parse a number environment variable
 */
export function parseNum(
  name: string,
  defaultValue: number,
  options: { min?: number; max?: number } = {}
): number {
  const value = process.env[name];
  const raw = value ?? `${defaultValue}`;
  const parsed = Number(raw);
  
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number value for ${name}: ${raw}`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`${name} value ${parsed} is below minimum ${options.min}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`${name} value ${parsed} is above maximum ${options.max}`);
  }
  
  return parsed;
}

/**
 * Validate a Solana public key
 */
export function validatePublicKey(name: string): PublicKey {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required public key: ${name}`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid public key for ${name}: ${value}`);
  }
}

// ============================================
// AUDIT FIX: Wallet Address Validation
// ============================================

/**
 * Validate a Solana wallet address format
 * @param address - The wallet address to validate
 * @returns true if valid, false otherwise
 */
export function isValidSolanaAddress(address: string | null | undefined): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  // Solana addresses are base58 encoded and 32-44 characters
  if (address.length < 32 || address.length > 44) {
    return false;
  }
  
  // Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
  // (excludes 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return false;
  }
  
  // Try to parse as PublicKey for final validation
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and return a wallet address or throw
 * @param address - The wallet address to validate
 * @param fieldName - Field name for error messages
 * @returns The validated address
 */
export function validateWalletAddress(
  address: string | null | undefined,
  fieldName = 'walletAddress'
): string {
  if (!address) {
    throw new Error(`Missing ${fieldName}`);
  }
  
  if (!isValidSolanaAddress(address)) {
    throw new Error(`Invalid ${fieldName}: ${address}`);
  }
  
  return address;
}

/**
 * Sanitize and validate a wallet address (optional, returns null if invalid)
 * @param address - The wallet address to validate
 * @returns The validated address or null
 */
export function sanitizeWalletAddress(
  address: string | null | undefined
): string | null {
  if (!address) {
    return null;
  }
  
  // Trim whitespace
  const trimmed = address.trim();
  
  if (!isValidSolanaAddress(trimmed)) {
    return null;
  }
  
  return trimmed;
}

/**
 * Validate a URL
 */
export function validateUrl(name: string, required = true): string | undefined {
  const value = process.env[name];
  if (!value) {
    if (required) {
      throw new Error(`Missing required URL: ${name}`);
    }
    return undefined;
  }
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid URL for ${name}: ${value}`);
  }
}

// ============================================
// Comprehensive Validation
// ============================================

/**
 * Validate all required environment variables for a service
 * @param required - Array of required environment variable names
 * @returns Validation result with config and any errors/warnings
 */
export function validateEnv(required: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: EnvConfig = {};

  // Check required variables
  for (const name of required) {
    const value = process.env[name];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${name}`);
    }
  }

  // Validate specific variables with their formats
  
  // Database
  if (process.env.DATABASE_URL) {
    try {
      new URL(process.env.DATABASE_URL);
      config.DATABASE_URL = process.env.DATABASE_URL;
    } catch {
      errors.push('DATABASE_URL is not a valid URL');
    }
  }
  config.DATABASE_SSL = process.env.DATABASE_SSL;

  // Solana
  if (process.env.ANCHOR_PROVIDER_URL) {
    try {
      new URL(process.env.ANCHOR_PROVIDER_URL);
      config.ANCHOR_PROVIDER_URL = process.env.ANCHOR_PROVIDER_URL;
    } catch {
      errors.push('ANCHOR_PROVIDER_URL is not a valid URL');
    }
  }
  config.ANCHOR_WALLET = process.env.ANCHOR_WALLET;

  if (process.env.NEXT_PUBLIC_PROGRAM_ID) {
    try {
      new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID);
      config.NEXT_PUBLIC_PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;
    } catch {
      errors.push('NEXT_PUBLIC_PROGRAM_ID is not a valid public key');
    }
  }

  // Boolean configs
  try {
    config.ENABLE_INACTIVITY_TERMINATION = parseBool('ENABLE_INACTIVITY_TERMINATION', false);
    config.DRY_RUN = parseBool('DRY_RUN', true);
    config.STRICT_SYNC = parseBool('STRICT_SYNC', false);
    config.CLOB_ENFORCE_BALANCE_CHECK = parseBool('CLOB_ENFORCE_BALANCE_CHECK', true);
  } catch (e) {
    errors.push((e as Error).message);
  }

  // Number configs
  try {
    config.INACTIVITY_TIMEOUT_SECONDS = parseNum('INACTIVITY_TIMEOUT_SECONDS', 604800, { min: 1 });
    config.MAX_TERMINATIONS = parseNum('MAX_TERMINATIONS', 10, { min: 0 });
    config.CLOB_TICK_SIZE = parseNum('CLOB_TICK_SIZE', 0.001, { min: 0.0001, max: 0.1 });
  } catch (e) {
    errors.push((e as Error).message);
  }

  // Warnings for optional but recommended variables
  if (!process.env.CRON_SECRET) {
    warnings.push('CRON_SECRET not set - cron endpoints will be unprotected');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config,
  };
}

/**
 * Validate environment and exit if invalid
 * Useful for service startup
 */
export function validateEnvOrExit(required: string[]): EnvConfig {
  const result = validateEnv(required);
  
  // Log warnings
  for (const warning of result.warnings) {
    console.warn(`⚠️  ${warning}`);
  }
  
  // Exit on errors
  if (!result.valid) {
    console.error('❌ Environment validation failed:');
    for (const error of result.errors) {
      console.error(`   - ${error}`);
    }
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed');
  return result.config;
}

/**
 * Get service-specific required variables
 */
export const SERVICE_REQUIRED_VARS = {
  syncMarkets: ['DATABASE_URL', 'ANCHOR_PROVIDER_URL', 'ANCHOR_WALLET'],
  checkInactive: ['ANCHOR_PROVIDER_URL', 'ANCHOR_WALLET'],
  terminateInactive: ['ANCHOR_PROVIDER_URL', 'ANCHOR_WALLET'],
  clobApi: ['DATABASE_URL'],
  syncTrades: ['DATABASE_URL', 'ANCHOR_PROVIDER_URL'],
} as const;

export type ServiceName = keyof typeof SERVICE_REQUIRED_VARS;

/**
 * Validate environment for a specific service
 */
export function validateServiceEnv(service: ServiceName): EnvConfig {
  const required = SERVICE_REQUIRED_VARS[service];
  return validateEnvOrExit([...required]);
}
