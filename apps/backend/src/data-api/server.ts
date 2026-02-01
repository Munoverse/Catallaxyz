/**
 * Data API Server - Read-only public API
 * Serves market data, orderbook snapshots, trades, and user public data
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import healthRoutes from './routes/health.js';
import marketsRoutes from './routes/markets.js';
import orderbookRoutes from './routes/orderbook.js';
import tradesRoutes from './routes/trades.js';
import usersRoutes from './routes/users.js';

const env = loadEnv();

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(rateLimit, {
  max: Number(process.env.DATA_RATE_LIMIT_MAX || 300),
  timeWindow: Number(process.env.DATA_RATE_LIMIT_WINDOW_MS || 60_000),
});

// Register routes
await app.register(healthRoutes);
await app.register(marketsRoutes, { prefix: '/markets' });
await app.register(orderbookRoutes, { prefix: '/orderbook' });
await app.register(tradesRoutes, { prefix: '/trades' });
await app.register(usersRoutes, { prefix: '/users' });

const DATA_API_PORT = parseInt(process.env.DATA_API_PORT || '3001', 10);
const HOST = env.HOST || '0.0.0.0';

export async function startDataAPI() {
  try {
    await app.listen({ port: DATA_API_PORT, host: HOST });
    logger.info('data-api', `Server listening on ${HOST}:${DATA_API_PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

export { app };

// Run if executed directly
if (process.argv[1]?.endsWith('data-api/server.js') || process.argv[1]?.endsWith('data-api/server.ts')) {
  startDataAPI();
}
