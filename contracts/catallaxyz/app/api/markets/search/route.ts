import { NextResponse } from 'next/server';
// AUDIT FIX v1.2.6: Use shared database pool and error handling
import { getPool } from '../../lib/db';
import { errorResponse, HttpStatus } from '../../lib/errors';

export const runtime = 'nodejs';

// AUDIT FIX v1.2.6: Use shared database pool
const pool = getPool();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') ?? '').trim();
  const limitParam = Number(searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  if (!pool) {
    return NextResponse.json({ markets: [] });
  }

  if (!query) {
    return NextResponse.json({ markets: [] });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT solana_market_account, title, question
        FROM public.markets
       WHERE title ILIKE $1
          OR question ILIKE $1
          OR solana_market_account ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2
      `,
      [`%${query}%`, limit]
    );
    const markets = result.rows.map((row) => ({
      address: row.solana_market_account,
      title: row.title,
      question: row.question,
    }));
    return NextResponse.json({ markets });
  } catch (err: unknown) {
    // AUDIT FIX v1.2.6: Use unified error handling
    const message = err instanceof Error ? err.message : 'Search failed.';
    return errorResponse(message, HttpStatus.BAD_REQUEST);
  } finally {
    client.release();
  }
}
