/**
 * Order Builder
 * 
 * Simplified API for creating and signing orders.
 */

import { PublicKey } from '@solana/web3.js';
import { 
  Order, 
  SignedOrder, 
  TOKEN_ID, 
  SIDE, 
  PRICE_SCALE,
  validateOrder,
} from './order-types';
import { signOrder, WalletSignMessageAdapter } from './order-signing';

// ============================================
// Order Builder Parameters
// ============================================

export interface CreateOrderParams {
  /** Market public key */
  market: PublicKey;
  /** Token to trade: 'yes' or 'no' */
  outcome: 'yes' | 'no';
  /** Order side: 'buy' or 'sell' */
  side: 'buy' | 'sell';
  /** Price as decimal (0.01 - 0.99) */
  price: number;
  /** Size in token units (will be converted to lamports) */
  size: number;
  /** User's current nonce (fetch from chain or API) */
  nonce: bigint;
  /** Optional fee rate in basis points */
  feeRateBps?: number;
  /** Optional expiration timestamp (Unix seconds) */
  expiration?: number;
  /** Optional specific taker address */
  taker?: PublicKey;
}

// ============================================
// Salt Generation
// ============================================

/**
 * Generate a random salt for order uniqueness
 */
function generateSalt(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);
  return view.getBigUint64(0, true);
}

// ============================================
// Order Builder Class
// ============================================

export class OrderBuilder {
  private wallet: WalletSignMessageAdapter;
  
  constructor(wallet: WalletSignMessageAdapter) {
    this.wallet = wallet;
  }
  
  /**
   * Create an order from simplified parameters
   */
  createOrder(params: CreateOrderParams): Order {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    
    const {
      market,
      outcome,
      side,
      price,
      size,
      nonce,
      feeRateBps = 0,
      expiration = 0,
      taker,
    } = params;
    
    // Validate price
    if (price <= 0 || price >= 1) {
      throw new Error('Price must be between 0 and 1 (exclusive)');
    }
    
    // Validate size
    if (size <= 0) {
      throw new Error('Size must be positive');
    }
    
    // Convert outcome to token ID
    const tokenId = outcome === 'yes' ? TOKEN_ID.YES : TOKEN_ID.NO;
    
    // Convert side
    const sideValue = side === 'buy' ? SIDE.BUY : SIDE.SELL;
    
    // Convert price to scaled value
    const priceScaled = BigInt(Math.floor(price * 1_000_000));
    
    // Convert size to lamports (assuming 6 decimals like USDC)
    const sizeScaled = BigInt(Math.floor(size * 1_000_000));
    
    // Calculate maker and taker amounts
    let makerAmount: bigint;
    let takerAmount: bigint;
    
    if (sideValue === SIDE.BUY) {
      // BUY: maker provides USDC, receives tokens
      // makerAmount = price * size
      takerAmount = sizeScaled;
      makerAmount = (priceScaled * sizeScaled) / PRICE_SCALE;
    } else {
      // SELL: maker provides tokens, receives USDC
      makerAmount = sizeScaled;
      takerAmount = (priceScaled * sizeScaled) / PRICE_SCALE;
    }
    
    const order: Order = {
      salt: generateSalt(),
      maker: this.wallet.publicKey,
      signer: this.wallet.publicKey,
      taker: taker || PublicKey.default,
      market,
      tokenId,
      makerAmount,
      takerAmount,
      expiration: BigInt(expiration),
      nonce,
      feeRateBps,
      side: sideValue,
    };
    
    // Validate the order
    const validation = validateOrder(order);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    return order;
  }
  
  /**
   * Create and sign an order
   */
  async createSignedOrder(params: CreateOrderParams): Promise<SignedOrder> {
    const order = this.createOrder(params);
    return signOrder(order, this.wallet);
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create an order builder with the given wallet
 */
export function createOrderBuilder(wallet: WalletSignMessageAdapter): OrderBuilder {
  return new OrderBuilder(wallet);
}

/**
 * Quick function to create and sign an order
 */
export async function createAndSignOrder(
  wallet: WalletSignMessageAdapter,
  params: CreateOrderParams
): Promise<SignedOrder> {
  const builder = new OrderBuilder(wallet);
  return builder.createSignedOrder(params);
}
