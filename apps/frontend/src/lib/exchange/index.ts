/**
 * Exchange Module (Polymarket-style)
 * 
 * Exports all exchange-related types and utilities.
 */

// Order Types
export {
  type Order,
  type SignedOrder,
  type OrderApiFormat,
  TOKEN_ID,
  SIDE,
  MAX_FEE_RATE_BPS,
  PRICE_SCALE,
  DOMAIN_SEPARATOR,
  serializeOrder,
  hashOrder,
  validateOrder,
  isOrderExpired,
  calculateOrderPrice,
  orderToApiFormat,
  orderFromApiFormat,
} from './order-types';

// Order Signing
export {
  type WalletSignMessageAdapter,
  type SignedOrderApiFormat,
  signOrder,
  verifyOrderSignature,
  encodeSignature,
  decodeSignature,
  signedOrderToApiFormat,
} from './order-signing';

// Order Builder
export {
  type CreateOrderParams,
  OrderBuilder,
  createOrderBuilder,
  createAndSignOrder,
} from './order-builder';

// Exchange Client
export {
  type ExchangeClient,
  createExchangeClient,
} from './exchange-client';
