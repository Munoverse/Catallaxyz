import { NextResponse } from 'next/server';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { buildCancelMessage } from '../../../lib/clob-order';
import { readOrderbook, writeOrderbook } from '../storage';
// AUDIT FIX v1.2.6: Use shared database pool and validation
import { getPool } from '../../lib/db';
import { validateTimestamp } from '../../lib/validation';

export const runtime = 'nodejs';

// AUDIT FIX v1.2.6: Use shared database pool
const pool = getPool();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market');
  const maker = searchParams.get('maker');

  if (pool && market) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT o.id, o.outcome_type, o.side, o.price, o.amount, o.remaining_amount, o.status,
               o.nonce, o.expires_at, o.signature, o.order_hash, o.created_at,
               u.wallet_address, m.solana_market_account
          FROM public.orders o
          LEFT JOIN public.users u ON u.id = o.user_id
          LEFT JOIN public.markets m ON m.id = o.market_id
         WHERE m.solana_market_account = $1
           AND o.status IN ('open', 'partial')
           AND o.remaining_amount > 0
           ${maker ? 'AND u.wallet_address = $2' : ''}
         ORDER BY o.created_at DESC
        `,
        maker ? [market, maker] : [market]
      );
      const orders = result.rows.map((row) => ({
        id: row.id,
        market: row.solana_market_account,
        outcome: row.outcome_type === 'yes' ? 0 : 1,
        side: row.side,
        price: Math.round(Number(row.price) * 1_000_000),
        size: Number(row.amount),
        remaining: Number(row.remaining_amount),
        status: row.status,
        nonce: row.nonce?.toString?.() ?? null,
        expiresAt: row.expires_at ?? null,
        signature: row.signature ?? null,
        orderHash: row.order_hash ?? null,
        maker: row.wallet_address ?? 'unknown',
        createdAt: row.created_at,
      }));
      return NextResponse.json({ orders });
    } finally {
      client.release();
    }
  }

  const snapshot = readOrderbook();
  let orders = snapshot.orders.filter((order) => order.remaining > 0 && ['open', 'partial'].includes(order.status));
  if (market) {
    orders = orders.filter((order) => order.market === market);
  }
  if (maker) {
    orders = orders.filter((order) => order.maker === maker);
  }
  return NextResponse.json({ orders });
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');
    const maker = searchParams.get('maker');
    const timestamp = searchParams.get('timestamp');
    const signature = searchParams.get('signature');

    if (!orderId || !maker || !timestamp || !signature) {
      return NextResponse.json({ error: 'Missing cancel parameters.' }, { status: 400 });
    }

    // AUDIT FIX v1.2.6: Use shared timestamp validation
    const tsValidation = validateTimestamp(timestamp);
    if (!tsValidation.valid) {
      return NextResponse.json({ error: tsValidation.error }, { status: 400 });
    }

    const message = buildCancelMessage({ orderId, maker, timestamp });
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
    const makerKey = new PublicKey(maker);
    const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, makerKey.toBytes());
    if (!verified) {
      return NextResponse.json({ error: 'Invalid cancel signature.' }, { status: 400 });
    }

    if (pool) {
      const client = await pool.connect();
      try {
        const existing = await client.query(
          `
          SELECT o.id, u.wallet_address
            FROM public.orders o
            LEFT JOIN public.users u ON u.id = o.user_id
           WHERE o.id = $1
          `,
          [orderId]
        );
        if (existing.rows.length === 0) {
          return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
        }
        // AUDIT FIX v1.2.5: Require wallet_address to be set for authorization
        if (!existing.rows[0].wallet_address) {
          return NextResponse.json({ error: 'Order owner unknown, cannot verify authorization.' }, { status: 403 });
        }
        if (existing.rows[0].wallet_address !== maker) {
          return NextResponse.json({ error: 'Order owner mismatch.' }, { status: 403 });
        }
        const result = await client.query(
          `
          UPDATE public.orders
             SET status = 'cancelled',
                 remaining_amount = 0,
                 cancelled_at = NOW()
           WHERE id = $1
          RETURNING id
          `,
          [orderId]
        );
        if (result.rows.length === 0) {
          return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
        }
        return NextResponse.json({ success: true, orderId });
      } finally {
        client.release();
      }
    }

    const snapshot = readOrderbook();
    const updated = snapshot.orders.map((order) => {
      if (order.id === orderId) {
        return { ...order, status: 'cancelled', remaining: 0 };
      }
      return order;
    });
    writeOrderbook({ orders: updated });
    return NextResponse.json({ success: true, orderId });
  } catch (err: unknown) {
    // AUDIT FIX: Use unknown type with type guard
    const message = err instanceof Error ? err.message : 'Failed to cancel order.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
