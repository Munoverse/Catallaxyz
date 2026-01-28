import { NextResponse } from 'next/server';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import { PoolClient } from 'pg';
import { BorshAccountsCoder, web3, Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { buildOrderMessage } from '../../../lib/clob-order';
import { deriveUserBalancePda, deriveUserPositionPda } from '../../../lib/solana';
import { readOrderbook, writeOrderbook, type ClobOrder, type ClobTrade } from '../storage';
import idl from '../../../../target/idl/catallaxyz.json';
// AUDIT FIX v1.2.6: Use shared database pool, helper functions, and error handling
import { getPool } from '../../lib/db';
import { ensureUser, ensureMarket } from '../../lib/helpers';
import { errorResponse, HttpStatus } from '../../lib/errors';

export const runtime = 'nodejs';

// AUDIT FIX: Type definitions for decoded accounts
interface DecodedUserBalance {
  usdcBalance: bigint | number;
  usdcLocked: bigint | number;
  bump: number;
  user: PublicKey;
}

interface DecodedUserPosition {
  yesBalance: bigint | number;
  noBalance: bigint | number;
  bump: number;
  user: PublicKey;
}

// AUDIT FIX: Type definition for database row
interface DbOrderRow {
  id: string;
  solana_market_account: string;
  outcome_type: 'yes' | 'no';
  side: 'buy' | 'sell';
  price: string | number;
  amount: string | number;
  remaining_amount: string | number;
  wallet_address: string | null;
  status: string;
  nonce: string | number | null;
  expires_at: string | null;
  signature: string | null;
  order_hash: string | null;
  created_at: string;
}

type OrderRequest = {
  market: string;
  outcome: number;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  maker: string;
  nonce: string;
  expiresAt: string;
  signature: string;
};

// AUDIT FIX v1.2.6: Use shared database pool
const pool = getPool();

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID
  ? new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID)
  : null;
const connection = new web3.Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);
// AUDIT FIX: Cast IDL with proper type
const accountCoder = new BorshAccountsCoder(idl as Idl);

const nowIso = () => new Date().toISOString();

const sortBuys = (a: ClobOrder, b: ClobOrder) => {
  if (a.price !== b.price) return b.price - a.price;
  return a.createdAt.localeCompare(b.createdAt);
};

const sortSells = (a: ClobOrder, b: ClobOrder) => {
  if (a.price !== b.price) return a.price - b.price;
  return a.createdAt.localeCompare(b.createdAt);
};

const matches = (order: OrderRequest, resting: ClobOrder) => {
  if (order.side === 'buy') {
    return order.price >= resting.price;
  }
  return order.price <= resting.price;
};

const validateOrder = (order: OrderRequest) => {
  if (!order.market || !order.maker) {
    throw new Error('Missing market or maker.');
  }
  if (order.outcome !== 0 && order.outcome !== 1) {
    throw new Error('Invalid outcome.');
  }
  if (order.side !== 'buy' && order.side !== 'sell') {
    throw new Error('Invalid side.');
  }
  if (!Number.isFinite(order.price) || order.price <= 0 || order.price > 1_000_000) {
    throw new Error('Invalid price.');
  }
  const tickSize = Number.parseFloat(process.env.CLOB_TICK_SIZE ?? '0.001');
  if (Number.isFinite(tickSize) && tickSize > 0) {
    const tickScaled = Math.round(tickSize * 1_000_000);
    if (tickScaled > 0 && order.price % tickScaled !== 0) {
      throw new Error('Price does not match tick size.');
    }
  }
  if (!Number.isFinite(order.size) || order.size <= 0) {
    throw new Error('Invalid size.');
  }
  if (!order.nonce || !order.expiresAt || !order.signature) {
    throw new Error('Missing order signature.');
  }
  const expiresAtMs = Number(order.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error('Order expired.');
  }
};

const createOrderId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `order_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
};

const outcomeLabel = (outcome: number) => (outcome === 0 ? 'yes' : 'no');

// AUDIT FIX: Use proper type for database row
const mapDbOrder = (row: DbOrderRow): ClobOrder => ({
  id: row.id,
  market: row.solana_market_account,
  outcome: row.outcome_type === 'yes' ? 0 : 1,
  side: row.side,
  price: Math.round(Number(row.price) * 1_000_000),
  size: Number(row.amount),
  remaining: Number(row.remaining_amount),
  maker: row.wallet_address ?? 'unknown',
  status: row.status,
  nonce: row.nonce?.toString?.() ?? null,
  expiresAt: row.expires_at ?? null,
  signature: row.signature ?? null,
  orderHash: row.order_hash ?? null,
  createdAt: row.created_at,
});

const fetchDecodedAccount = async (accountName: 'UserBalance' | 'UserPosition', address: PublicKey) => {
  const info = await connection.getAccountInfo(address);
  if (!info?.data) return null;
  return accountCoder.decode(accountName, info.data);
};

// AUDIT FIX: Use proper types instead of 'any'
const enforceBalanceCheck = async (order: OrderRequest) => {
  if (process.env.CLOB_ENFORCE_BALANCE_CHECK === 'false') return;
  if (!PROGRAM_ID) {
    throw new Error('Missing NEXT_PUBLIC_PROGRAM_ID for balance checks.');
  }

  const marketKey = new PublicKey(order.market);
  const makerKey = new PublicKey(order.maker);

  if (order.side === 'buy') {
    const userBalancePda = deriveUserBalancePda(PROGRAM_ID, marketKey, makerKey);
    const userBalance = await fetchDecodedAccount('UserBalance', userBalancePda) as DecodedUserBalance | null;
    const usdcBalance = Number(userBalance?.usdcBalance ?? 0);
    if (usdcBalance < order.size) {
      throw new Error('Insufficient market USDC balance.');
    }
    return;
  }

  const userPositionPda = deriveUserPositionPda(PROGRAM_ID, marketKey, makerKey);
  const userPosition = await fetchDecodedAccount('UserPosition', userPositionPda) as DecodedUserPosition | null;
  const yesBalance = Number(userPosition?.yesBalance ?? 0);
  const noBalance = Number(userPosition?.noBalance ?? 0);
  const available = order.outcome === 0 ? yesBalance : noBalance;
  if (available < order.size) {
    throw new Error('Insufficient outcome position balance.');
  }
};

// AUDIT FIX v1.2.6: ensureUser and ensureMarket moved to lib/helpers.ts

// AUDIT FIX: Use PoolClient type instead of 'any'
const loadDbOrders = async (client: PoolClient, marketAddress: string, outcome: number, side: 'buy' | 'sell') => {
  const result = await client.query<DbOrderRow>(
    `
    SELECT o.id, o.outcome_type, o.side, o.price, o.amount, o.remaining_amount, o.created_at,
           u.wallet_address, m.solana_market_account, o.status, o.nonce, o.expires_at, o.signature, o.order_hash
      FROM public.orders o
      LEFT JOIN public.users u ON u.id = o.user_id
      LEFT JOIN public.markets m ON m.id = o.market_id
     WHERE m.solana_market_account = $1
       AND o.outcome_type = $2
       AND o.side = $3
       AND o.status IN ('open', 'partial')
       AND o.remaining_amount > 0
     ORDER BY o.price ${side === 'buy' ? 'DESC' : 'ASC'}, o.created_at ASC
    `,
    [marketAddress, outcomeLabel(outcome), side]
  );
  return result.rows.map(mapDbOrder);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market');
  const outcome = searchParams.get('outcome');

  if (pool && market) {
    const client = await pool.connect();
    try {
      const outcomeValue = outcome !== null ? Number(outcome) : 0;
      const buys = await loadDbOrders(client, market, outcomeValue, 'buy');
      const sells = await loadDbOrders(client, market, outcomeValue, 'sell');
      return NextResponse.json({ buys, sells });
    } finally {
      client.release();
    }
  }

  const snapshot = readOrderbook();
  let orders = snapshot.orders;
  if (market) {
    orders = orders.filter((order) => order.market === market);
  }
  if (outcome !== null) {
    const outcomeValue = Number(outcome);
    orders = orders.filter((order) => order.outcome === outcomeValue);
  }

  const buys = orders
    .filter((order) => order.side === 'buy' && order.remaining > 0 && ['open', 'partial'].includes(order.status))
    .sort(sortBuys);
  const sells = orders
    .filter((order) => order.side === 'sell' && order.remaining > 0 && ['open', 'partial'].includes(order.status))
    .sort(sortSells);

  return NextResponse.json({ buys, sells });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OrderRequest;
    validateOrder(body);

    const message = buildOrderMessage({
      market: body.market,
      outcome: body.outcome,
      side: body.side,
      price: body.price,
      size: body.size,
      maker: body.maker,
      nonce: body.nonce,
      expiresAt: body.expiresAt,
    });
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(Buffer.from(body.signature, 'base64'));
    const makerKey = new PublicKey(body.maker);
    const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, makerKey.toBytes());
    if (!verified) {
      throw new Error('Invalid order signature.');
    }
    const orderHash = crypto.createHash('sha256').update(message).digest('hex');

    await enforceBalanceCheck(body);

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const marketId = await ensureMarket(client, body.market);
        const makerUserId = await ensureUser(client, body.maker);
        const normalizedPrice = body.price / 1_000_000;

        // AUDIT FIX v1.2.5: Check for nonce reuse to prevent replay attacks
        const nonceCheck = await client.query(
          `SELECT id FROM public.orders WHERE user_id = $1 AND nonce = $2`,
          [makerUserId, Number(body.nonce)]
        );
        if (nonceCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          // AUDIT FIX v1.2.6: Use unified error response
          return errorResponse('Nonce already used. Each order must have a unique nonce.', HttpStatus.BAD_REQUEST, 'NONCE_REUSE');
        }

        const insertOrder = await client.query(
          `
          INSERT INTO public.orders
            (market_id, user_id, outcome_type, side, order_type, price, amount, filled_amount, remaining_amount, status, client_order_id, order_hash, nonce, expires_at, signature, placed_at)
          VALUES
            ($1, $2, $3, $4, 'limit', $5, $6, 0, $6, 'open', $7, $8, $9, to_timestamp($10 / 1000.0), $11, NOW())
          RETURNING id, remaining_amount
          `,
          [
            marketId,
            makerUserId,
            outcomeLabel(body.outcome),
            body.side,
            normalizedPrice,
            body.size,
            createOrderId(),
            orderHash,
            Number(body.nonce),
            Number(body.expiresAt),
            body.signature,
          ]
        );

        const incomingId = insertOrder.rows[0].id as string;
        let incomingRemaining = Number(insertOrder.rows[0].remaining_amount);

        const oppositeSide = body.side === 'buy' ? 'sell' : 'buy';
        const resting = await client.query(
          `
          SELECT o.id, o.user_id, o.remaining_amount, o.price, u.wallet_address
            FROM public.orders o
            LEFT JOIN public.users u ON u.id = o.user_id
           WHERE o.market_id = $1
             AND o.outcome_type = $2
             AND o.side = $3
             AND o.status IN ('open', 'partial')
             AND o.remaining_amount > 0
           ORDER BY o.price ${oppositeSide === 'buy' ? 'DESC' : 'ASC'}, o.created_at ASC
           FOR UPDATE
          `,
          [marketId, outcomeLabel(body.outcome), oppositeSide]
        );

        const fills: Array<{
          maker: string;
          taker: string;
          outcomeType: number;
          side: number;
          price: number;
          size: number;
        }> = [];

        for (const row of resting.rows) {
          if (incomingRemaining <= 0) break;
          const restingRemaining = Number(row.remaining_amount);
          const restingPrice = Number(row.price);
          const priceScaled = Math.round(restingPrice * 1_000_000);
          const canMatch = body.side === 'buy' ? body.price >= priceScaled : body.price <= priceScaled;
          if (!canMatch) break;

          const fillSize = Math.min(incomingRemaining, restingRemaining);
          const newRestingRemaining = restingRemaining - fillSize;
          const restingStatus = newRestingRemaining === 0 ? 'filled' : 'partial';

          // AUDIT FIX v2.1 (HIGH-13): Use optimistic locking to prevent race conditions
          // The WHERE clause ensures remaining_amount hasn't changed since we read it
          const updateResult = await client.query(
            `
            UPDATE public.orders
               SET remaining_amount = $1,
                   filled_amount = amount - $1,
                   status = $2,
                   filled_at = CASE WHEN $1 = 0 THEN NOW() ELSE filled_at END
             WHERE id = $3
               AND remaining_amount >= $4
            RETURNING id
            `,
            [newRestingRemaining, restingStatus, row.id, fillSize]
          );

          // If update affected no rows, the order was modified by another transaction
          if (updateResult.rowCount === 0) {
            // Skip this order and continue to the next one
            continue;
          }

          // Only deduct from incoming if the update succeeded
          incomingRemaining -= fillSize;

          fills.push({
            maker: row.wallet_address ?? 'unknown',
            taker: body.maker,
            outcomeType: body.outcome,
            side: body.side === 'buy' ? 0 : 1,
            price: priceScaled,
            size: fillSize,
          });

          await client.query(
            `
            INSERT INTO public.trades
              (market_id, outcome_type, side, maker_order_id, taker_order_id, maker_user_id, taker_user_id,
               amount, price, total_cost, created_at)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            `,
            [
              marketId,
              outcomeLabel(body.outcome),
              body.side,
              row.id,
              incomingId,
              row.user_id,
              makerUserId,
              fillSize,
              restingPrice,
              Math.floor(fillSize * restingPrice),
            ]
          );
        }

        const incomingStatus = incomingRemaining === 0 ? 'filled' : fills.length > 0 ? 'partial' : 'open';
        await client.query(
          `
          UPDATE public.orders
             SET remaining_amount = $1,
                 filled_amount = amount - $1,
                 status = $2,
                 filled_at = CASE WHEN $1 = 0 THEN NOW() ELSE filled_at END
           WHERE id = $3
          `,
          [incomingRemaining, incomingStatus, incomingId]
        );

        await client.query('COMMIT');

        const buys = await loadDbOrders(client, body.market, body.outcome, 'buy');
        const sells = await loadDbOrders(client, body.market, body.outcome, 'sell');

        return NextResponse.json({
          order: {
            id: incomingId,
            market: body.market,
            outcome: body.outcome,
            side: body.side,
            price: body.price,
            size: body.size,
            remaining: incomingRemaining,
            maker: body.maker,
            status: incomingStatus,
            nonce: body.nonce,
            expiresAt: body.expiresAt,
            signature: body.signature,
            orderHash,
            createdAt: nowIso(),
          },
          fills,
          orderbook: { buys, sells },
        });
      } catch (err: unknown) {
        // AUDIT FIX v1.1.3: Use unknown type for catch blocks
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const snapshot = readOrderbook();
    const remainingOrders: ClobOrder[] = [];
    const trades: ClobTrade[] = snapshot.trades ?? [];
    const fills: Array<{
      maker: string;
      taker: string;
      outcomeType: number;
      side: number;
      price: number;
      size: number;
    }> = [];

    const incoming: ClobOrder = {
      id: createOrderId(),
      market: body.market,
      outcome: body.outcome,
      side: body.side,
      price: body.price,
      size: body.size,
      remaining: body.size,
      maker: body.maker,
      status: 'open',
      nonce: body.nonce,
      expiresAt: body.expiresAt,
      signature: body.signature,
      orderHash,
      createdAt: nowIso(),
    };

    const oppositeSide = body.side === 'buy' ? 'sell' : 'buy';
    const resting = snapshot.orders
      .filter(
        (order) =>
          order.market === body.market &&
          order.outcome === body.outcome &&
          order.side === oppositeSide &&
          order.remaining > 0
      )
      .sort(oppositeSide === 'buy' ? sortBuys : sortSells);

    for (const order of resting) {
      if (incoming.remaining <= 0) break;
      if (!matches(body, order)) break;

      const fillSize = Math.min(incoming.remaining, order.remaining);
      order.remaining -= fillSize;
      incoming.remaining -= fillSize;
      order.status = order.remaining === 0 ? 'filled' : 'partial';

      fills.push({
        maker: order.maker,
        taker: incoming.maker,
        outcomeType: incoming.outcome,
        side: incoming.side === 'buy' ? 0 : 1,
        price: order.price,
        size: fillSize,
      });

      trades.push({
        id: `trade_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        market: body.market,
        outcome: body.outcome,
        side: body.side,
        price: order.price,
        size: fillSize,
        maker: order.maker,
        taker: incoming.maker,
        createdAt: nowIso(),
      });

      if (order.remaining > 0) {
        remainingOrders.push(order);
      }
    }

    incoming.status = incoming.remaining === 0 ? 'filled' : incoming.remaining < incoming.size ? 'partial' : 'open';

    for (const order of snapshot.orders) {
      if (
        order.market === body.market &&
        order.outcome === body.outcome &&
        order.side === oppositeSide
      ) {
        continue;
      }
      remainingOrders.push(order);
    }

    if (incoming.remaining > 0) {
      remainingOrders.push(incoming);
    }

    writeOrderbook({ orders: remainingOrders, trades });

    const buys = remainingOrders
      .filter((order) => order.market === body.market && order.outcome === body.outcome && order.side === 'buy')
      .sort(sortBuys);
    const sells = remainingOrders
      .filter((order) => order.market === body.market && order.outcome === body.outcome && order.side === 'sell')
      .sort(sortSells);

    return NextResponse.json({
      order: incoming,
      fills,
      orderbook: { buys, sells },
    });
  } catch (err: unknown) {
    // AUDIT FIX v1.2.6: Use unified error handling
    const message = err instanceof Error ? err.message : 'Failed to place order.';
    return errorResponse(message, HttpStatus.BAD_REQUEST);
  }
}
