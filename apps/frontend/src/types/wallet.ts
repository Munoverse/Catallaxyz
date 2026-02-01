/**
 * Unified Wallet Type Definitions
 * 
 * AUDIT FIX F-A8: Consolidated wallet types from contract-calls.ts, admin.ts, etc.
 */

import { PublicKey } from '@solana/web3.js';
import type { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { Address } from '@solana/addresses';

/**
 * Basic wallet interface for signing transactions
 * Compatible with @solana/wallet-adapter-react
 */
export interface WalletSigner {
  publicKey: PublicKey | null;
  signTransaction?<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions?<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}

/**
 * Extended wallet interface with all optional methods
 * Used when full wallet functionality is needed
 */
export interface WalletAdapterLike extends WalletSigner {
  connected?: boolean;
  connecting?: boolean;
  disconnecting?: boolean;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  sendTransaction?(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: any
  ): Promise<string>;
}

/**
 * Wallet context returned from useWallet hook
 */
export interface WalletContext {
  wallet: WalletAdapterLike | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  select(walletName: string): void;
  signTransaction: WalletSigner['signTransaction'];
  signAllTransactions: WalletSigner['signAllTransactions'];
}

/**
 * Solana wallet adapter interface (from @solana/wallet-adapter-base)
 */
export interface SolanaWalletAdapter {
  name: string;
  url?: string;
  icon?: string;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  readyState: 'installed' | 'loadable' | 'unsupported' | 'notDetected';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Type guard to check if a wallet has signing capability
 */
export function isSigningWallet(wallet: any): wallet is WalletSigner {
  return (
    wallet &&
    wallet.publicKey instanceof PublicKey &&
    typeof wallet.signTransaction === 'function'
  );
}

/**
 * Type guard to check if wallet is connected
 */
export function isConnectedWallet(wallet: any): wallet is WalletAdapterLike & { publicKey: PublicKey } {
  return (
    wallet &&
    wallet.publicKey instanceof PublicKey &&
    wallet.connected === true
  );
}
