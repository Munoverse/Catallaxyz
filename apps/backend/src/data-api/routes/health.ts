/**
 * Health Check Routes for Data API
 * GET / - Simple health check (Polymarket style)
 * GET /health - Detailed health status
 */

import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../../lib/supabase.js';
import { getRedisClient } from '../../lib/redis/client.js';

async function checkPostgres(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('platform_settings').select('key').limit(1);
    if (error) throw error;
    return { status: 'healthy', latency: Date.now() - start };
  } catch (err) {
    return { status: 'unhealthy' };
  }
}

async function checkRedis(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    if (!redis) {
      return { status: 'not_configured' };
    }
    await redis.ping();
    return { status: 'healthy', latency: Date.now() - start };
  } catch (err) {
    return { status: 'unhealthy' };
  }
}

export default async function healthRoutes(app: FastifyInstance) {
  // Polymarket-style simple health check
  app.get('/', async () => {
    return { data: 'OK' };
  });

  // Detailed health check
  app.get('/health', async () => {
    const [database, redis] = await Promise.all([
      checkPostgres(),
      checkRedis(),
    ]);

    const allHealthy = database.status === 'healthy' && 
      (redis.status === 'healthy' || redis.status === 'not_configured');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database,
        redis,
      },
    };
  });
}
