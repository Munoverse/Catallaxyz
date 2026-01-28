import fs from 'fs';
import path from 'path';

export type ClobOrder = {
  id: string;
  market: string;
  outcome: number;
  side: 'buy' | 'sell';
  price: number; // scaled by 1e6
  size: number; // scaled by 1e6
  remaining: number;
  maker: string;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
  nonce: string;
  expiresAt: string;
  signature: string;
  orderHash: string;
  createdAt: string;
};

type OrderbookSnapshot = {
  orders: ClobOrder[];
  trades?: ClobTrade[];
};

export type ClobTrade = {
  id: string;
  market: string;
  outcome: number;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  maker: string;
  taker: string;
  createdAt: string;
};

const resolveOrderbookPath = () => {
  const customPath = process.env.CLOB_ORDERBOOK_PATH;
  if (customPath) {
    return customPath;
  }
  return path.resolve(process.cwd(), 'backend/db/orderbook.json');
};

export const readOrderbook = (): OrderbookSnapshot => {
  const filePath = resolveOrderbookPath();
  if (!fs.existsSync(filePath)) {
    return { orders: [], trades: [] };
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return { orders: [], trades: [] };
  }
  try {
    const parsed = JSON.parse(raw) as OrderbookSnapshot;
    const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
    return {
      // AUDIT FIX: Use Partial<ClobOrder> instead of 'any'
      orders: orders.map((order: Partial<ClobOrder>) => ({
        status: order.status ?? 'open',
        nonce: order.nonce ?? '',
        expiresAt: order.expiresAt ?? '',
        signature: order.signature ?? '',
        orderHash: order.orderHash ?? '',
        ...order,
      } as ClobOrder)),
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    };
  } catch {
    return { orders: [], trades: [] };
  }
};

export const writeOrderbook = (snapshot: OrderbookSnapshot) => {
  const filePath = resolveOrderbookPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
};
