/**
 * WebSocket Server
 * Real-time data streaming for orderbook, trades, and user updates
 */

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { loadEnv } from '../lib/env.js';
import { getRedisClient, getRedisSubscriber } from '../lib/redis/client.js';
import { marketChannel } from './channels/market.js';
import { userChannel } from './channels/user.js';
import { logger } from '../lib/logger.js';

const env = loadEnv();

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(websocket);

// AUDIT FIX v2.0.3: Connection limits
const MAX_CONNECTIONS_TOTAL = parseInt(process.env.WS_MAX_CONNECTIONS || '10000', 10);
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.WS_MAX_CONNECTIONS_PER_IP || '50', 10);
const MAX_SUBSCRIPTIONS_PER_CONNECTION = parseInt(process.env.WS_MAX_SUBSCRIPTIONS || '20', 10);

// Store active connections
const connections = new Map<string, Set<any>>();

// Track connections per IP for rate limiting
const connectionsByIp = new Map<string, number>();
let totalConnections = 0;

/**
 * Get client IP from request
 */
function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim();
  }
  return req.ip || 'unknown';
}

/**
 * Check if connection is allowed
 */
function canAcceptConnection(ip: string): { allowed: boolean; reason?: string } {
  if (totalConnections >= MAX_CONNECTIONS_TOTAL) {
    return { allowed: false, reason: 'Server at maximum capacity' };
  }
  
  const ipConnections = connectionsByIp.get(ip) || 0;
  if (ipConnections >= MAX_CONNECTIONS_PER_IP) {
    return { allowed: false, reason: 'Too many connections from this IP' };
  }
  
  return { allowed: true };
}

/**
 * Track new connection
 */
function trackConnection(ip: string): void {
  totalConnections++;
  connectionsByIp.set(ip, (connectionsByIp.get(ip) || 0) + 1);
  logger.debug('ws-server', `Connection opened from ${ip}. Total: ${totalConnections}`);
}

/**
 * Remove connection tracking
 */
function untrackConnection(ip: string): void {
  totalConnections = Math.max(0, totalConnections - 1);
  const current = connectionsByIp.get(ip) || 1;
  if (current <= 1) {
    connectionsByIp.delete(ip);
  } else {
    connectionsByIp.set(ip, current - 1);
  }
  logger.debug('ws-server', `Connection closed from ${ip}. Total: ${totalConnections}`);
}

// Subscribe to Redis channels
async function setupRedisSubscription() {
  const subscriber = getRedisSubscriber();
  if (!subscriber) {
    logger.warn('ws-server', 'Redis subscriber not available, WebSocket will not receive real-time updates');
    return;
  }

  subscriber.on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message);
      broadcastToChannel(channel, data);
    } catch (err) {
      logger.error('ws-server', 'Failed to parse Redis message', err);
    }
  });

  // Subscribe to all relevant channels
  await subscriber.subscribe('stream:fills');
  await subscriber.subscribe('stream:orders');
  await subscriber.subscribe('stream:orderbook');
  await subscriber.subscribe('stream:notifications');
  
  logger.info('ws-server', 'Redis subscription established');
}

function broadcastToChannel(channel: string, data: any) {
  if (channel === 'stream:notifications' && data?.walletAddress) {
    const userChannel = `user:${data.walletAddress}`;
    const message = {
      channel: userChannel,
      event: 'notification',
      data: data.notification || data,
      timestamp: Date.now(),
    };
    const subscribers = connections.get(userChannel);
    if (!subscribers) return;
    const payload = JSON.stringify(message);
    for (const socket of subscribers) {
      try {
        socket.send(payload);
      } catch (err) {
        logger.error('ws-server', 'Failed to send notification to socket', err);
      }
    }
    return;
  }

  const subscribers = connections.get(channel);
  if (!subscribers) return;

  const message = JSON.stringify({
    channel,
    event: data.event || 'update',
    data: data.data || data,
    timestamp: Date.now(),
  });

  for (const socket of subscribers) {
    try {
      socket.send(message);
    } catch (err) {
      logger.error('ws-server', 'Failed to send to socket', err);
    }
  }
}

function addToChannel(channel: string, socket: any) {
  if (!connections.has(channel)) {
    connections.set(channel, new Set());
  }
  connections.get(channel)!.add(socket);
}

function removeFromChannel(channel: string, socket: any) {
  const subs = connections.get(channel);
  if (subs) {
    subs.delete(socket);
    if (subs.size === 0) {
      connections.delete(channel);
    }
  }
}

function removeFromAllChannels(socket: any) {
  for (const [channel, subs] of connections.entries()) {
    subs.delete(socket);
    if (subs.size === 0) {
      connections.delete(channel);
    }
  }
}

// Health check
app.get('/health', async () => ({ status: 'ok' }));

// Main WebSocket endpoint
app.get('/ws', { websocket: true }, (connection: any, req) => {
  const socket = connection.socket || connection;
  const clientIp = getClientIp(req);
  const subscribedChannels = new Set<string>();

  // AUDIT FIX: Check connection limits
  const { allowed, reason } = canAcceptConnection(clientIp);
  if (!allowed) {
    logger.warn('ws-server', `Connection rejected from ${clientIp}: ${reason}`);
    socket.send(JSON.stringify({ error: reason }));
    socket.close();
    return;
  }

  trackConnection(clientIp);
  logger.info('ws-server', `New WebSocket connection from ${clientIp}`);

  socket.on('message', async (rawMessage: Buffer) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      const { action, channel, auth } = message;

      switch (action) {
        case 'subscribe':
          if (!channel) {
            socket.send(JSON.stringify({ error: 'Channel required for subscribe' }));
            return;
          }

          // AUDIT FIX: Check subscription limit
          if (subscribedChannels.size >= MAX_SUBSCRIPTIONS_PER_CONNECTION) {
            socket.send(JSON.stringify({ 
              error: `Maximum ${MAX_SUBSCRIPTIONS_PER_CONNECTION} subscriptions per connection` 
            }));
            return;
          }

          // Handle user channel subscription (requires auth)
          if (channel.startsWith('user:')) {
            const result = await userChannel.subscribe(socket, channel, auth);
            if (!result.success) {
              socket.send(JSON.stringify({ error: result.error }));
              return;
            }
          }

          // Handle market channel subscription (public)
          if (channel.startsWith('market:')) {
            await marketChannel.subscribe(socket, channel);
          }

          addToChannel(channel, socket);
          subscribedChannels.add(channel);
          socket.send(JSON.stringify({
            event: 'subscribed',
            channel,
            timestamp: Date.now(),
          }));
          break;

        case 'unsubscribe':
          if (!channel) {
            socket.send(JSON.stringify({ error: 'Channel required for unsubscribe' }));
            return;
          }
          removeFromChannel(channel, socket);
          subscribedChannels.delete(channel);
          socket.send(JSON.stringify({
            event: 'unsubscribed',
            channel,
            timestamp: Date.now(),
          }));
          break;

        case 'ping':
          socket.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
          break;

        default:
          socket.send(JSON.stringify({ error: 'Unknown action' }));
      }
    } catch (err) {
      logger.error('ws-server', 'WebSocket message error', err);
      socket.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  socket.on('close', () => {
    logger.info('ws-server', 'WebSocket connection closed');
    removeFromAllChannels(socket);
    untrackConnection(clientIp);
  });

  socket.on('error', (err: Error) => {
    logger.error('ws-server', 'WebSocket error', err);
    removeFromAllChannels(socket);
    untrackConnection(clientIp);
  });

  // Send welcome message
  socket.send(JSON.stringify({
    event: 'connected',
    timestamp: Date.now(),
    message: 'Connected to Catallaxyz WebSocket',
  }));
});

const WS_PORT = parseInt(process.env.WS_PORT || '3003', 10);
const HOST = env.HOST || '0.0.0.0';

export async function startWSServer() {
  try {
    await setupRedisSubscription();
    await app.listen({ port: WS_PORT, host: HOST });
    logger.info('ws-server', `Server listening on ${HOST}:${WS_PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

export { app, broadcastToChannel, addToChannel, removeFromChannel };

// Run if executed directly
if (process.argv[1]?.endsWith('ws-server/server.js') || process.argv[1]?.endsWith('ws-server/server.ts')) {
  startWSServer();
}
