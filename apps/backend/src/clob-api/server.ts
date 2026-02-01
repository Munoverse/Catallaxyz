/**
 * CLOB API Server - Authenticated trading API
 * Handles order placement, cancellation, and balance management
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from '../lib/env.js';
import { geoCheckMiddleware } from '../lib/geo/ip-check.js';
import authRoutes from './routes/auth.js';
import ordersRoutes from './routes/orders.js';
import balancesRoutes from './routes/balances.js';
import exchangeOrdersRoutes from './routes/exchange-orders.js';
import { logger } from '../lib/logger.js';

const env = loadEnv();

const app = Fastify({
  logger: true,
  trustProxy: true, // Required for IP detection behind load balancer
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(rateLimit, {
  max: Number(process.env.CLOB_RATE_LIMIT_MAX || 60),
  timeWindow: Number(process.env.CLOB_RATE_LIMIT_WINDOW_MS || 60_000),
  allowList: (request) => request.url === '/health',
});

// Health check (simple, for load balancer)
app.get('/health', async () => ({ status: 'ok' }));

// Apply geo restriction middleware to all routes except health
app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/health') return;
  
  // Skip geo check if disabled
  if (process.env.GEO_CHECK_ENABLED !== 'true') return;
  
  return geoCheckMiddleware(request, reply);
});

// Register routes
await app.register(authRoutes, { prefix: '/auth' });
await app.register(ordersRoutes, { prefix: '/orders' });
await app.register(balancesRoutes, { prefix: '/balances' });
await app.register(exchangeOrdersRoutes, { prefix: '/exchange' }); // Polymarket-style exchange routes

const CLOB_API_PORT = parseInt(process.env.CLOB_API_PORT || '3002', 10);
const HOST = env.HOST || '0.0.0.0';

export async function startClobAPI() {
  try {
    await app.listen({ port: CLOB_API_PORT, host: HOST });
    logger.info('clob-api', `Server listening on ${HOST}:${CLOB_API_PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

export { app };

// Run if executed directly
if (process.argv[1]?.endsWith('clob-api/server.js') || process.argv[1]?.endsWith('clob-api/server.ts')) {
  startClobAPI();
}
