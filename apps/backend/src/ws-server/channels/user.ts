/**
 * User Channel - Private user data streaming
 * Order updates, balance changes, fills
 */

import { createServerClient } from '../../lib/supabase.js';
import { verifyL2Signature, buildL2SignaturePayload } from '../../lib/auth.js';
import { logger } from '../../lib/logger.js';

interface UserAuth {
  apiKey: string;
  passphrase: string;
  signature: string;
  timestamp: string;
}

const subscriptions = new Map<string, Set<any>>();
const socketToUser = new Map<any, string>();

export const userChannel = {
  async subscribe(
    socket: any,
    channel: string,
    auth?: UserAuth
  ): Promise<{ success: boolean; error?: string }> {
    // channel format: user:{walletAddress}
    const walletAddress = channel.replace('user:', '');

    // Require authentication for user channels
    if (!auth || !auth.apiKey || !auth.passphrase || !auth.signature || !auth.timestamp) {
      return { success: false, error: 'Authentication required for user channel' };
    }

    // Verify API key and signature
    const supabase = createServerClient();
    const { data: apiRow, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key', auth.apiKey)
      .eq('api_passphrase', auth.passphrase)
      .single();

    if (error || !apiRow) {
      return { success: false, error: 'Invalid API credentials' };
    }

    // Verify wallet address matches
    if (apiRow.wallet_address !== walletAddress) {
      return { success: false, error: 'Wallet address mismatch' };
    }

    // Verify signature
    const payload = buildL2SignaturePayload({
      timestamp: auth.timestamp,
      method: 'SUBSCRIBE',
      path: `/ws/user/${walletAddress}`,
      body: '',
    });

    if (!verifyL2Signature({ apiSecret: apiRow.api_secret, signature: auth.signature, payload })) {
      return { success: false, error: 'Invalid signature' };
    }

    // Add to subscriptions
    if (!subscriptions.has(walletAddress)) {
      subscriptions.set(walletAddress, new Set());
    }
    subscriptions.get(walletAddress)!.add(socket);
    socketToUser.set(socket, walletAddress);

    return { success: true };
  },

  unsubscribe(socket: any, channel: string): void {
    const walletAddress = channel.replace('user:', '');
    const subs = subscriptions.get(walletAddress);
    if (subs) {
      subs.delete(socket);
      if (subs.size === 0) {
        subscriptions.delete(walletAddress);
      }
    }
    socketToUser.delete(socket);
  },

  removeSocket(socket: any): void {
    const walletAddress = socketToUser.get(socket);
    if (walletAddress) {
      this.unsubscribe(socket, `user:${walletAddress}`);
    }
  },

  broadcast(walletAddress: string, event: string, data: any): void {
    const subs = subscriptions.get(walletAddress);
    if (!subs) return;

    const message = JSON.stringify({
      channel: `user:${walletAddress}`,
      event,
      data,
      timestamp: Date.now(),
    });

    for (const socket of subs) {
      try {
        socket.send(message);
      } catch (err) {
        logger.error('ws-user-channel', 'Failed to broadcast to user channel', err);
      }
    }
  },

  // Broadcast order update
  broadcastOrderUpdate(walletAddress: string, order: any): void {
    this.broadcast(walletAddress, 'order', order);
  },

  // Broadcast balance update
  broadcastBalanceUpdate(walletAddress: string, balances: any): void {
    this.broadcast(walletAddress, 'balance', balances);
  },

  // Broadcast fill notification
  broadcastFill(walletAddress: string, fill: any): void {
    this.broadcast(walletAddress, 'fill', fill);
  },
};
