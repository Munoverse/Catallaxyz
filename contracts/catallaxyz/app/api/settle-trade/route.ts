import { NextResponse } from 'next/server';
import { BN } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { encodeSettleTradeMessage } from '../../lib/settle-trade';

export const runtime = 'nodejs';

type FillInputPayload = {
  maker: string;
  taker: string;
  outcomeType: number;
  side: number;
  size: number | string;
  price: number | string;
};

type RequestBody = {
  market: string;
  nonce: number | string;
  fill: FillInputPayload;
};

const getSignerKeypair = () => {
  const raw = process.env.SETTLEMENT_SIGNER_SECRET_KEY;
  if (!raw) {
    throw new Error('Missing env var SETTLEMENT_SIGNER_SECRET_KEY');
  }
  let secretKey: Uint8Array;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('SETTLEMENT_SIGNER_SECRET_KEY must be a JSON array');
    }
    secretKey = Uint8Array.from(parsed);
  } catch (err: unknown) {
    // AUDIT FIX v1.1.3: Use unknown type for catch blocks
    throw new Error('SETTLEMENT_SIGNER_SECRET_KEY must be a JSON array');
  }
  return Keypair.fromSecretKey(secretKey);
};

const parseFillInput = (input: FillInputPayload) => {
  const maker = new PublicKey(input.maker);
  const taker = new PublicKey(input.taker);
  const outcomeType = Number(input.outcomeType);
  const side = Number(input.side);
  const size = new BN(input.size);
  const price = new BN(input.price);

  if (outcomeType !== 0 && outcomeType !== 1) {
    throw new Error('Invalid outcomeType');
  }
  if (side !== 0 && side !== 1) {
    throw new Error('Invalid side');
  }
  if (size.lte(new BN(0))) {
    throw new Error('Invalid size');
  }
  if (price.lte(new BN(0)) || price.gt(new BN(1_000_000))) {
    throw new Error('Invalid price');
  }

  return {
    maker,
    taker,
    outcomeType,
    side,
    size,
    price,
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    if (!body?.fill || !body?.market || body.nonce === undefined || body.nonce === null) {
      return NextResponse.json({ error: 'Missing fill payload.' }, { status: 400 });
    }

    const market = new PublicKey(body.market);
    const nonce = new BN(body.nonce);
    const fill = parseFillInput(body.fill);
    const payload = encodeSettleTradeMessage({
      market,
      nonce: nonce.toString(),
      fill,
    });

    const keypair = getSignerKeypair();
    const signature = nacl.sign.detached(payload, keypair.secretKey);

    return NextResponse.json({
      signature: Array.from(signature),
      nonce: nonce.toString(),
      signer: keypair.publicKey.toString(),
    });
  } catch (err: unknown) {
    // AUDIT FIX: Use unknown type with type guard
    const message = err instanceof Error ? err.message : 'Failed to sign trade.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
