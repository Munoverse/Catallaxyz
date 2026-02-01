/**
 * Health Check Utility
 * 
 * Provides comprehensive health checking for all backend services.
 * Used by the /health endpoint and Docker health checks.
 */

import { createServerClient } from './supabase.js';
import { getRedisClient } from './redis/client.js';
import { Connection } from '@solana/web3.js';
import { logger } from './logger.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    [key: string]: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  error?: string;
}

const startTime = Date.now();
const VERSION = process.env.npm_package_version || '1.0.0';

/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    if (!redis) {
      return { status: 'down', error: 'Redis client not initialized' };
    }
    await redis.ping();
    return { status: 'up', latency: Date.now() - start };
  } catch (error: any) {
    logger.error('health', 'Redis health check failed', error);
    return { status: 'down', error: error.message, latency: Date.now() - start };
  }
}

/**
 * Check Supabase/PostgreSQL connectivity
 */
async function checkSupabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      return { status: 'down', error: error.message, latency: Date.now() - start };
    }
    return { status: 'up', latency: Date.now() - start };
  } catch (error: any) {
    logger.error('health', 'Supabase health check failed', error);
    return { status: 'down', error: error.message, latency: Date.now() - start };
  }
}

/**
 * Check Solana RPC connectivity
 */
async function checkSolana(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const version = await connection.getVersion();
    if (!version) {
      return { status: 'down', error: 'Unable to get Solana version', latency: Date.now() - start };
    }
    return { status: 'up', latency: Date.now() - start };
  } catch (error: any) {
    logger.error('health', 'Solana health check failed', error);
    return { status: 'down', error: error.message, latency: Date.now() - start };
  }
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(): Promise<HealthStatus> {
  const services: { [key: string]: ServiceHealth } = {};
  
  // Check enabled services based on environment
  const enabledServices = (process.env.HEALTH_CHECK_SERVICES || 'redis,supabase,solana').split(',');
  
  const checks: Promise<void>[] = [];
  
  if (enabledServices.includes('redis')) {
    checks.push(checkRedis().then(result => { services.redis = result; }));
  }
  
  if (enabledServices.includes('supabase')) {
    checks.push(checkSupabase().then(result => { services.supabase = result; }));
  }
  
  if (enabledServices.includes('solana')) {
    checks.push(checkSolana().then(result => { services.solana = result; }));
  }
  
  // Run all checks in parallel with timeout
  await Promise.race([
    Promise.all(checks),
    new Promise(resolve => setTimeout(resolve, 5000)), // 5 second timeout
  ]);
  
  // Determine overall status
  const serviceStatuses = Object.values(services);
  const hasDown = serviceStatuses.some(s => s.status === 'down');
  const hasDegraded = serviceStatuses.some(s => s.status === 'degraded');
  
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (hasDown) {
    overallStatus = 'unhealthy';
  } else if (hasDegraded) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services,
  };
}

/**
 * Simple health check (for load balancers)
 */
export async function performSimpleHealthCheck(): Promise<{ ok: boolean }> {
  try {
    // Just check Redis since it's most critical for CLOB
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export default { performHealthCheck, performSimpleHealthCheck };
