/**
 * Unified Transaction Hook
 * AUDIT FIX: Centralized transaction submission to eliminate code duplication
 * 
 * Provides:
 * - Consistent error handling
 * - Transaction signing
 * - Status tracking
 * - Retry logic
 */

import { useCallback, useState } from 'react';
import { Transaction, VersionedTransaction, Connection } from '@solana/web3.js';
import { useNotifications } from '../components/notifications';
import { getConnection } from '../lib/solana';
import { retryRpc } from '../lib/transactions';

// ============================================
// Types
// ============================================

export type TransactionStatus = 
  | 'idle'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error';

export interface TransactionResult {
  signature: string;
  success: boolean;
  error?: string;
}

export interface TransactionOptions {
  /** Description for logging/UI */
  description?: string;
  /** Number of retry attempts (default: 2) */
  retries?: number;
  /** Skip confirmation check (default: false) */
  skipConfirmation?: boolean;
  /** Callback on success */
  onSuccess?: (signature: string) => void | Promise<void>;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseTransactionReturn {
  /** Current transaction status */
  status: TransactionStatus;
  /** Whether a transaction is in progress */
  isSubmitting: boolean;
  /** Last error message if any */
  error: string | null;
  /** Last successful signature */
  lastSignature: string | null;
  /** Submit a transaction */
  submitTransaction: (
    signAndSend: () => Promise<string>,
    options?: TransactionOptions
  ) => Promise<TransactionResult>;
  /** Reset state */
  reset: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useTransaction(): UseTransactionReturn {
  const { notify } = useNotifications();
  const [status, setStatus] = useState<TransactionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const isSubmitting = status !== 'idle' && status !== 'success' && status !== 'error';

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setLastSignature(null);
  }, []);

  const submitTransaction = useCallback(
    async (
      signAndSend: () => Promise<string>,
      options: TransactionOptions = {}
    ): Promise<TransactionResult> => {
      const {
        description = 'Transaction',
        retries = 2,
        skipConfirmation = false,
        onSuccess,
        onError,
      } = options;

      try {
        setStatus('signing');
        setError(null);

        // Execute transaction with retry
        const signature = await retryRpc(signAndSend, retries);
        
        setStatus('confirming');
        setLastSignature(signature);

        // Optionally confirm transaction
        if (!skipConfirmation) {
          const connection = getConnection();
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
          }
        }

        setStatus('success');
        notify('success', `${description} successful`);
        
        if (onSuccess) {
          await onSuccess(signature);
        }

        return { signature, success: true };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
        
        setStatus('error');
        setError(errorMessage);
        notify('error', errorMessage);
        
        if (onError && err instanceof Error) {
          onError(err);
        }

        return { signature: '', success: false, error: errorMessage };
      }
    },
    [notify]
  );

  return {
    status,
    isSubmitting,
    error,
    lastSignature,
    submitTransaction,
    reset,
  };
}

// ============================================
// Helper Hooks
// ============================================

/**
 * Hook for Anchor program method calls
 */
export function useAnchorTransaction() {
  const transaction = useTransaction();

  const submitAnchorMethod = useCallback(
    async <T>(
      methodCall: () => Promise<string>,
      options?: TransactionOptions
    ) => {
      return transaction.submitTransaction(methodCall, options);
    },
    [transaction]
  );

  return {
    ...transaction,
    submitAnchorMethod,
  };
}

/**
 * Hook for batch transactions
 */
export function useBatchTransaction() {
  const { notify } = useNotifications();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<TransactionResult[]>([]);

  const submitBatch = useCallback(
    async (
      transactions: Array<() => Promise<string>>,
      options: { stopOnError?: boolean; description?: string } = {}
    ) => {
      const { stopOnError = true, description = 'Batch transaction' } = options;
      setIsSubmitting(true);
      const newResults: TransactionResult[] = [];

      try {
        for (let i = 0; i < transactions.length; i++) {
          try {
            const signature = await retryRpc(transactions[i], 2);
            newResults.push({ signature, success: true });
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
            newResults.push({ signature: '', success: false, error: errorMessage });
            
            if (stopOnError) {
              throw err;
            }
          }
        }

        const successCount = newResults.filter(r => r.success).length;
        notify('success', `${description}: ${successCount}/${transactions.length} succeeded`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Batch failed';
        notify('error', errorMessage);
      } finally {
        setIsSubmitting(false);
        setResults(newResults);
      }

      return newResults;
    },
    [notify]
  );

  return {
    isSubmitting,
    results,
    submitBatch,
  };
}

export default useTransaction;
