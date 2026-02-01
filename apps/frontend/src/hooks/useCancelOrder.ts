/**
 * useCancelOrder Hook
 * 
 * React hook for cancelling orders on-chain.
 * Supports both individual order cancellation and batch cancellation via nonce increment.
 * 
 * Note: This hook requires the IDL to be updated with the new instructions.
 * Until then, use the API-based cancellation instead.
 */

import { useState, useCallback } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { PublicKey } from '@solana/web3.js';
import { Order } from '@/lib/exchange';
import { createExchangeClient } from '@/lib/exchange/exchange-client';

// ============================================
// Hook
// ============================================

interface CancelOrderState {
  isCancelling: boolean;
  isIncrementingNonce: boolean;
  lastError: string | null;
  lastTxSignature: string | null;
}

export function useCancelOrder() {
  const { publicKey, isConnected } = usePhantomWallet();
  const exchangeClient = createExchangeClient();
  
  const [state, setState] = useState<CancelOrderState>({
    isCancelling: false,
    isIncrementingNonce: false,
    lastError: null,
    lastTxSignature: null,
  });

  /**
   * Cancel a single order via API
   * The API will handle on-chain cancellation
   */
  const cancelOrder = useCallback(async (order: Order): Promise<{ success: boolean; error?: string; txSignature?: string }> => {
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Verify caller is the order maker
    if (!order.maker.equals(publicKey)) {
      return { success: false, error: 'Only the order maker can cancel' };
    }

    setState(prev => ({ ...prev, isCancelling: true, lastError: null }));

    try {
      // Calculate order hash
      const { hashOrder } = await import('@/lib/exchange');
      const orderHash = await hashOrder(order);
      const orderHashHex = Buffer.from(orderHash).toString('hex');

      // For now, return a placeholder - actual implementation will use
      // the on-chain cancel_order instruction when IDL is updated
      setState(prev => ({
        ...prev,
        isCancelling: false,
        lastError: 'On-chain cancellation requires IDL update',
      }));

      return { 
        success: false, 
        error: 'On-chain cancellation requires IDL update. Please use the API to cancel orders.' 
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to cancel order';
      setState(prev => ({ ...prev, isCancelling: false, lastError: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [publicKey]);

  /**
   * Increment nonce to batch-cancel all orders with lower nonce
   * This requires the IDL to be updated with the new instruction
   */
  const incrementNonce = useCallback(async (): Promise<{ success: boolean; error?: string; txSignature?: string; newNonce?: string }> => {
    if (!publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    setState(prev => ({ ...prev, isIncrementingNonce: true, lastError: null }));

    try {
      // This requires the IDL to be updated with increment_nonce instruction
      setState(prev => ({
        ...prev,
        isIncrementingNonce: false,
        lastError: 'Nonce increment requires IDL update',
      }));

      return { 
        success: false, 
        error: 'Nonce increment requires IDL update. Build and deploy the program first.' 
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to increment nonce';
      setState(prev => ({ ...prev, isIncrementingNonce: false, lastError: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }, [publicKey]);

  return {
    // State
    isCancelling: state.isCancelling,
    isIncrementingNonce: state.isIncrementingNonce,
    lastError: state.lastError,
    lastTxSignature: state.lastTxSignature,
    
    // Derived
    isReady: !!publicKey,
    
    // Actions
    cancelOrder,
    incrementNonce,
  };
}
