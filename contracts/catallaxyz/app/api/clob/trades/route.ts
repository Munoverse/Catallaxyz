import { NextResponse } from 'next/server';
import { readOrderbook } from '../storage';
// AUDIT FIX v1.2.6: Use shared database pool
import { getPool } from '../../lib/db';

export const runtime = 'nodejs';

// AUDIT FIX v1.2.6: Use shared database pool
const pool = getPool();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market');
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Number(limitParam ?? 50) || 50, 200);

  if (pool && market) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT t.id, t.outcome_type, t.side, t.price, t.amount, t.created_at,
               mu.wallet_address AS maker_wallet,
               tu.wallet_address AS taker_wallet,
               m.solana_market_account
          FROM public.trades t
          LEFT JOIN public.users mu ON mu.id = t.maker_user_id
          LEFT JOIN public.users tu ON tu.id = t.taker_user_id
          LEFT JOIN public.markets m ON m.id = t.market_id
         WHERE m.solana_market_account = $1
         ORDER BY t.created_at DESC
         LIMIT $2
        `,
        [market, limit]
      );
      const trades = result.rows.map((row) => ({
        id: row.id,
        market: row.solana_market_account,
        outcome: row.outcome_type === 'yes' ? 0 : 1,
        side: row.side,
        price: Math.round(Number(row.price) * 1_000_000),
        size: Number(row.amount),
        maker: row.maker_wallet ?? 'unknown',
        taker: row.taker_wallet ?? 'unknown',
        createdAt: row.created_at,
      }));
      return NextResponse.json({ trades });
    } finally {
      client.release();
    }
  }

  const snapshot = readOrderbook();
  let trades = snapshot.trades ?? [];
  if (market) {
    trades = trades.filter((trade) => trade.market === market);
  }
  trades = trades.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  return NextResponse.json({ trades });
}
