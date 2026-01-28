export type OrderSignaturePayload = {
  market: string;
  outcome: number;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  maker: string;
  nonce: string;
  expiresAt: string;
};

export type CancelSignaturePayload = {
  orderId: string;
  maker: string;
  timestamp: string;
};

export const buildOrderMessage = (payload: OrderSignaturePayload) =>
  [
    'v1',
    payload.market,
    payload.outcome,
    payload.side,
    payload.price,
    payload.size,
    payload.maker,
    payload.nonce,
    payload.expiresAt,
  ].join('|');

export const buildCancelMessage = (payload: CancelSignaturePayload) =>
  ['cancel_v1', payload.orderId, payload.maker, payload.timestamp].join('|');
