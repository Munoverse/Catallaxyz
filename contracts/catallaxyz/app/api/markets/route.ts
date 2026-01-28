import { NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
// AUDIT FIX v1.2.6: Use shared database pool and validation
import { getPool } from '../lib/db';
import { validateTimestamp } from '../lib/validation';

export const runtime = 'nodejs';

// AUDIT FIX v1.2.6: Use shared database pool
const pool = getPool();

type SortBy = 'created_desc' | 'created_asc' | 'trades_desc';

const decodeCursor = (cursor: string | null) => {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    return JSON.parse(decoded) as { value: string | number; id: string; sortBy: SortBy };
  } catch {
    return null;
  }
};

const encodeCursor = (payload: { value: string | number; id: string; sortBy: SortBy }) =>
  Buffer.from(JSON.stringify(payload)).toString('base64');

export async function GET(request: Request) {
  if (!pool) {
    return NextResponse.json({ markets: [], nextCursor: null });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') ?? '').trim();
  const status = searchParams.get('status');
  const sortBy = (searchParams.get('sortBy') ?? 'created_desc') as SortBy;
  const limitParam = Number(searchParams.get('limit') ?? 20);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;
  const cursor = decodeCursor(searchParams.get('cursor'));

  const where: string[] = [];
  const params: Array<string | number> = [];
  let paramIndex = 1;

  if (query) {
    where.push(
      `(m.title ILIKE $${paramIndex} OR m.question ILIKE $${paramIndex} OR m.solana_market_account ILIKE $${paramIndex})`
    );
    params.push(`%${query}%`);
    paramIndex += 1;
  }

  if (status && status !== 'all') {
    where.push(`m.status = $${paramIndex}`);
    params.push(status);
    paramIndex += 1;
  }

  let orderBy = 'm.created_at DESC, m.id DESC';
  if (sortBy === 'created_asc') {
    orderBy = 'm.created_at ASC, m.id ASC';
  } else if (sortBy === 'trades_desc') {
    orderBy = 'm.total_trades DESC, m.id DESC';
  }

  if (cursor && cursor.sortBy === sortBy) {
    const comparator = sortBy === 'created_asc' ? '>' : '<';
    const field = sortBy === 'trades_desc' ? 'm.total_trades' : 'm.created_at';
    where.push(`(${field}, m.id) ${comparator} ($${paramIndex}, $${paramIndex + 1})`);
    params.push(cursor.value);
    params.push(cursor.id);
    paramIndex += 2;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT m.id, m.solana_market_account, m.title, m.question, m.status, m.created_at, m.total_trades,
             u.wallet_address AS creator_wallet
        FROM public.markets m
        LEFT JOIN public.users u ON u.id = m.creator_id
        ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex}
      `,
      [...params, limit + 1]
    );

    const rows = result.rows;
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;

    const markets = trimmed.map((row) => ({
      id: row.id,
      address: row.solana_market_account,
      creator: row.creator_wallet ?? 'Unknown',
      status: row.status,
      createdAt: row.created_at ? new Date(row.created_at).getTime() / 1000 : null,
      totalTrades: Number(row.total_trades ?? 0),
      question: row.question ?? row.title ?? null,
    }));

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = trimmed[trimmed.length - 1];
      const value =
        sortBy === 'trades_desc'
          ? Number(last.total_trades ?? 0)
          : new Date(last.created_at).toISOString();
      nextCursor = encodeCursor({ value, id: last.id, sortBy });
    }

    return NextResponse.json({ markets, nextCursor });
  } finally {
    client.release();
  }
}

// AUDIT FIX v1.2.5: Helper function to build market creation message for signature verification
const buildMarketCreationMessage = (params: { address: string; creator: string; title: string; timestamp: string }) => {
  return `Create Market|${params.address}|${params.creator}|${params.title}|${params.timestamp}`;
};

export async function POST(request: Request) {
  if (!pool) {
    return NextResponse.json({ error: 'DATABASE_URL not configured.' }, { status: 400 });
  }
  try {
    const body = (await request.json()) as {
      address: string;
      creator: string;
      title: string;
      question?: string;
      timestamp?: string;
      signature?: string;
    };
    if (!body?.address || !body?.creator || !body?.title) {
      return NextResponse.json({ error: 'Missing market payload.' }, { status: 400 });
    }

    // AUDIT FIX v1.2.5: Require signature verification for market creation
    // Skip verification only in development mode with explicit flag
    const skipAuth = process.env.NODE_ENV !== 'production' && process.env.SKIP_MARKET_AUTH === 'true';
    
    if (!skipAuth) {
      if (!body.timestamp || !body.signature) {
        return NextResponse.json({ error: 'Missing authentication parameters (timestamp, signature).' }, { status: 401 });
      }
      
      // AUDIT FIX v1.2.6: Use shared timestamp validation
      const tsValidation = validateTimestamp(body.timestamp);
      if (!tsValidation.valid) {
        return NextResponse.json({ error: tsValidation.error }, { status: 400 });
      }
      
      // Verify signature
      const message = buildMarketCreationMessage({
        address: body.address,
        creator: body.creator,
        title: body.title,
        timestamp: body.timestamp,
      });
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Uint8Array.from(Buffer.from(body.signature, 'base64'));
      
      try {
        const creatorKey = new PublicKey(body.creator);
        const verified = nacl.sign.detached.verify(messageBytes, signatureBytes, creatorKey.toBytes());
        if (!verified) {
          return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid creator address or signature format.' }, { status: 400 });
      }
    }

    const client = await pool.connect();
    try {
      const user = await client.query(
        `
        INSERT INTO public.users (wallet_address, auth_provider)
        VALUES ($1, 'wallet')
        ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
        RETURNING id
        `,
        [body.creator]
      );
      const creatorId = user.rows[0].id as string;

      await client.query(
        `
        INSERT INTO public.markets (creator_id, title, question, solana_market_account, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (solana_market_account) DO UPDATE SET
          creator_id = EXCLUDED.creator_id,
          title = EXCLUDED.title,
          question = EXCLUDED.question,
          updated_at = NOW()
        `,
        [creatorId, body.title, body.question ?? body.title, body.address]
      );

      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    // AUDIT FIX: Use unknown type with type guard
    const message = err instanceof Error ? err.message : 'Market upsert failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
