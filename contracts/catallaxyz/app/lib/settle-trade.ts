import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

type BigintLike = bigint | number | string | BN;

export type FillInputMessage = {
  maker: PublicKey;
  taker: PublicKey;
  outcomeType: number;
  side: number;
  size: BigintLike;
  price: BigintLike;
};

const toBigInt = (value: BigintLike) => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  return BigInt(value.toString());
};

const writeU64LE = (buffer: Uint8Array, offset: number, value: BigintLike) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setBigUint64(offset, toBigInt(value), true);
};

export const encodeSettleTradeMessage = (args: {
  market: PublicKey;
  nonce: BigintLike;
  fill: FillInputMessage;
}) => {
  const message = new Uint8Array(32 + 8 + 32 + 32 + 1 + 1 + 8 + 8);
  let offset = 0;

  message.set(args.market.toBytes(), offset);
  offset += 32;

  writeU64LE(message, offset, args.nonce);
  offset += 8;

  message.set(args.fill.maker.toBytes(), offset);
  offset += 32;

  message.set(args.fill.taker.toBytes(), offset);
  offset += 32;

  message[offset] = args.fill.outcomeType;
  offset += 1;

  message[offset] = args.fill.side;
  offset += 1;

  writeU64LE(message, offset, args.fill.size);
  offset += 8;

  writeU64LE(message, offset, args.fill.price);
  offset += 8;

  return message;
};
