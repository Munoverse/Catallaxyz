import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import autoload from '@fastify/autoload';
import rateLimit from '@fastify/rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadEnv } from './lib/env.js';
import { fastifyErrorHandler } from './lib/error-handler.js';
import { performHealthCheck, performSimpleHealthCheck } from './lib/health.js';
import { logger } from './lib/logger.js';
import { initSentry, captureException, flush as flushSentry } from './lib/sentry.js';

// Initialize Sentry before anything else
initSentry();

const env = loadEnv();
const isProduction = process.env.NODE_ENV === 'production';

const app = Fastify({
  logger: true,
  // Generate request ID for tracing
  genReqId: () => `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
});

// AUDIT FIX B-03: Global error handler to prevent error message leakage
app.setErrorHandler(fastifyErrorHandler);

if (isProduction && !process.env.CRON_SECRET) {
  throw new Error('CRON_SECRET is required in production');
}

// SECURITY: Add security headers
await app.register(helmet, {
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// SECURITY: Configure CORS based on environment
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : isProduction
    ? ['https://catallaxyz.app', 'https://www.catallaxyz.app']
    : true;

await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'poly_api_key',
    'poly_passphrase',
    'poly_signature',
    'poly_timestamp',
    'poly_address',
    'poly_nonce',
    'x-cron-secret',
  ],
});

// SECURITY: Rate limiting
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX || 120),
  timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  allowList: (request) => request.url.startsWith('/health'),
  keyGenerator: (request) => {
    // Use X-Forwarded-For if behind a proxy
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }
    return request.ip;
  },
});

// Request logging hook - add request ID to all requests
app.addHook('onRequest', async (request, reply) => {
  // AUDIT FIX: Add X-Request-ID header for tracing
  reply.header('X-Request-ID', request.id);
  
  logger.debug('server', `${request.method} ${request.url}`, {
    requestId: request.id,
    ip: request.ip,
  });
});

// Response logging hook with timing
app.addHook('onResponse', async (request, reply) => {
  const level = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'debug';
  logger[level]('server', `${request.method} ${request.url} - ${reply.statusCode}`, {
    requestId: request.id,
    duration: reply.elapsedTime,
    statusCode: reply.statusCode,
  });
});

const __dirname = dirname(fileURLToPath(import.meta.url));
await app.register(autoload, {
  dir: join(__dirname, 'routes'),
  options: { prefix: '/api' },
});

// Simple health check (for load balancers)
app.get('/health', async () => {
  return performSimpleHealthCheck();
});

// Detailed health check (for monitoring)
app.get('/health/detailed', async (request, reply) => {
  const health = await performHealthCheck();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  return reply.code(statusCode).send(health);
});

// Ready check (for Kubernetes)
app.get('/ready', async (request, reply) => {
  const health = await performHealthCheck();
  if (health.status === 'unhealthy') {
    return reply.code(503).send({ ready: false });
  }
  return { ready: true };
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info('server', `Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    await app.close();
    logger.info('server', 'Server closed');
    
    // Flush Sentry events
    await flushSentry();
    logger.info('server', 'Sentry flushed');
    
    process.exit(0);
  } catch (error) {
    logger.error('server', 'Error during shutdown', error);
    captureException(error as Error);
    await flushSentry();
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('server', 'Unhandled Rejection', { reason, promise });
  captureException(reason as Error, { type: 'unhandledRejection' });
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('server', 'Uncaught Exception', error);
  captureException(error, { type: 'uncaughtException' });
  // Give Sentry time to send the error before crashing
  flushSentry().then(() => process.exit(1));
});

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info('server', `Server started on ${env.HOST}:${env.PORT}`);
} catch (error) {
  logger.error('server', 'Failed to start server', error);
  captureException(error as Error);
  await flushSentry();
  process.exit(1);
}
