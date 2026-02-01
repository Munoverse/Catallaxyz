/**
 * Exchange Executor (Polymarket-style)
 * 
 * Executes atomic swaps via match_orders instruction.
 */

import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionInstruction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import IDL from '../generated/catallaxyz/catallaxyz.json' with { type: 'json' };
import { Order, SignedOrder, serializeOrder, hashOrder } from './exchange-types.js';

// ============================================
// Provider and Program Setup
// ============================================

function getOperatorKeypair(): Keypair {
  const secretKey = process.env.OPERATOR_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing OPERATOR_SECRET_KEY');
  }
  const parsed = JSON.parse(secretKey);
  return Keypair.fromSecretKey(new Uint8Array(parsed));
}

function getProvider(): AnchorProvider {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error('Missing SOLANA_RPC_URL');
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const operator = getOperatorKeypair();
  const wallet = new anchor.Wallet(operator);
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

function loadProgram(provider: AnchorProvider): Program {
  const programId = new PublicKey(process.env.PROGRAM_ID || '95QAsSGtGqRPKVWrxEj9GnJcSfWnhxRdYdbeVq5WTEcy');
  return new (Program as any)(IDL, programId, provider) as Program;
}

// ============================================
// PDA Derivation
// ============================================

function deriveGlobalPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('global')], programId);
  return pda;
}

function deriveOrderStatusPda(orderHash: Buffer, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('order_status'), orderHash],
    programId
  );
  return pda;
}

function deriveUserNoncePda(user: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_nonce'), user.toBytes()],
    programId
  );
  return pda;
}

function deriveUserBalancePda(market: PublicKey, user: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_balance'), market.toBytes(), user.toBytes()],
    programId
  );
  return pda;
}

function deriveUserPositionPda(market: PublicKey, user: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), market.toBytes(), user.toBytes()],
    programId
  );
  return pda;
}

// ============================================
// Ed25519 Signature Verification Instruction
// ============================================

function createEd25519VerifyInstruction(
  publicKey: PublicKey,
  message: Buffer,
  signature: Uint8Array
): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: publicKey.toBytes(),
    message,
    signature,
  });
}

// ============================================
// Convert Order to Anchor Format
// ============================================

function orderToAnchor(order: Order) {
  return {
    salt: new BN(order.salt.toString()),
    maker: order.maker,
    signer: order.signer,
    taker: order.taker,
    market: order.market,
    tokenId: order.tokenId,
    makerAmount: new BN(order.makerAmount.toString()),
    takerAmount: new BN(order.takerAmount.toString()),
    expiration: new BN(order.expiration.toString()),
    nonce: new BN(order.nonce.toString()),
    feeRateBps: order.feeRateBps,
    side: order.side,
  };
}

function signedOrderToAnchor(signedOrder: SignedOrder) {
  return {
    order: orderToAnchor(signedOrder.order),
    signature: Array.from(signedOrder.signature),
  };
}

// ============================================
// Fill Order
// ============================================

export async function submitFillOrder(params: {
  signedOrder: SignedOrder;
  fillAmount: bigint;
}): Promise<string> {
  const provider = getProvider();
  const program = loadProgram(provider);
  const operator = getOperatorKeypair();

  const { signedOrder, fillAmount } = params;
  const order = signedOrder.order;
  const orderHash = hashOrder(order);

  // Create Ed25519 verify instruction for the order signature
  const ed25519Ix = createEd25519VerifyInstruction(
    order.signer,
    orderHash,
    signedOrder.signature
  );

  // Derive PDAs
  const global = deriveGlobalPda(program.programId);
  const orderStatus = deriveOrderStatusPda(orderHash, program.programId);
  const makerNonce = deriveUserNoncePda(order.maker, program.programId);
  const makerBalance = deriveUserBalancePda(order.market, order.maker, program.programId);
  const makerPosition = deriveUserPositionPda(order.market, order.maker, program.programId);
  const operatorBalance = deriveUserBalancePda(order.market, operator.publicKey, program.programId);
  const operatorPosition = deriveUserPositionPda(order.market, operator.publicKey, program.programId);

  // Build fill_order instruction
  const fillOrderIx = await program.methods
    .fillOrder({
      signedOrder: signedOrderToAnchor(signedOrder),
      fillAmount: new BN(fillAmount.toString()),
    })
    .accounts({
      operator: operator.publicKey,
      global,
      market: order.market,
      orderStatus,
      makerNonce,
      makerBalance,
      makerPosition,
      operatorBalance,
      operatorPosition,
      maker: order.maker,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();

  // Build and send transaction
  const tx = new Transaction().add(ed25519Ix).add(fillOrderIx);
  
  const signature = await sendAndConfirmTransaction(
    provider.connection,
    tx,
    [operator],
    { commitment: 'confirmed' }
  );

  return signature;
}

// ============================================
// Match Orders (Atomic Swap)
// ============================================

export async function submitMatchOrders(params: {
  takerOrder: SignedOrder;
  takerFillAmount: bigint;
  makerOrders: SignedOrder[];
  makerFillAmounts: bigint[];
}): Promise<string> {
  const provider = getProvider();
  const program = loadProgram(provider);
  const operator = getOperatorKeypair();

  const { takerOrder, takerFillAmount, makerOrders, makerFillAmounts } = params;
  
  if (makerOrders.length !== makerFillAmounts.length) {
    throw new Error('Maker orders and fill amounts length mismatch');
  }

  if (makerOrders.length === 0 || makerOrders.length > 5) {
    throw new Error('Must have 1-5 maker orders');
  }

  const taker = takerOrder.order;
  const takerOrderHash = hashOrder(taker);

  // Create Ed25519 verify instructions for all signatures
  const ed25519Instructions: TransactionInstruction[] = [];

  // Taker signature verification
  ed25519Instructions.push(
    createEd25519VerifyInstruction(taker.signer, takerOrderHash, takerOrder.signature)
  );

  // Maker signature verifications
  for (const makerOrder of makerOrders) {
    const makerOrderHash = hashOrder(makerOrder.order);
    ed25519Instructions.push(
      createEd25519VerifyInstruction(
        makerOrder.order.signer,
        makerOrderHash,
        makerOrder.signature
      )
    );
  }

  // Derive fixed account PDAs
  const global = deriveGlobalPda(program.programId);
  const takerOrderStatus = deriveOrderStatusPda(takerOrderHash, program.programId);
  const takerNonce = deriveUserNoncePda(taker.maker, program.programId);
  const takerBalance = deriveUserBalancePda(taker.market, taker.maker, program.programId);
  const takerPosition = deriveUserPositionPda(taker.market, taker.maker, program.programId);

  // Build remaining accounts for maker orders
  // Each maker needs: maker, makerNonce, makerBalance, makerPosition, makerOrderStatus
  const remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [];

  for (const makerOrder of makerOrders) {
    const maker = makerOrder.order;
    const makerOrderHash = hashOrder(maker);

    remainingAccounts.push(
      { pubkey: maker.maker, isSigner: false, isWritable: false }, // maker
      { pubkey: deriveUserNoncePda(maker.maker, program.programId), isSigner: false, isWritable: false }, // makerNonce
      { pubkey: deriveUserBalancePda(taker.market, maker.maker, program.programId), isSigner: false, isWritable: true }, // makerBalance
      { pubkey: deriveUserPositionPda(taker.market, maker.maker, program.programId), isSigner: false, isWritable: true }, // makerPosition
      { pubkey: deriveOrderStatusPda(makerOrderHash, program.programId), isSigner: false, isWritable: true }, // makerOrderStatus
    );
  }

  // Build match_orders instruction
  const matchOrdersIx = await program.methods
    .matchOrders({
      takerOrder: signedOrderToAnchor(takerOrder),
      takerFillAmount: new BN(takerFillAmount.toString()),
      makerOrders: makerOrders.map(signedOrderToAnchor),
      makerFillAmounts: makerFillAmounts.map(amt => new BN(amt.toString())),
    })
    .accounts({
      operator: operator.publicKey,
      global,
      market: taker.market,
      takerOrderStatus,
      takerNonce,
      takerBalance,
      takerPosition,
      taker: taker.maker,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();

  // Build transaction with all Ed25519 verifications followed by match_orders
  const tx = new Transaction();
  for (const ix of ed25519Instructions) {
    tx.add(ix);
  }
  tx.add(matchOrdersIx);

  // Send and confirm
  const signature = await sendAndConfirmTransaction(
    provider.connection,
    tx,
    [operator],
    { commitment: 'confirmed' }
  );

  return signature;
}

// ============================================
// Cancel Order (on behalf of maker)
// ============================================

export async function submitCancelOrder(params: {
  order: Order;
}): Promise<string> {
  const provider = getProvider();
  const program = loadProgram(provider);
  const operator = getOperatorKeypair();

  const { order } = params;
  const orderHash = hashOrder(order);

  // Derive PDAs
  const global = deriveGlobalPda(program.programId);
  const orderStatus = deriveOrderStatusPda(orderHash, program.programId);

  // Note: This should be called by the maker, not operator
  // For backend-initiated cancellation, we'd need maker's signature
  // This is a placeholder - actual implementation would require maker to sign

  const signature = await program.methods
    .cancelOrder({
      order: orderToAnchor(order),
    })
    .accounts({
      maker: order.maker,
      global,
      orderStatus,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  return signature;
}

// ============================================
// Get User Nonce
// ============================================

export async function getUserNonce(user: PublicKey): Promise<bigint> {
  const provider = getProvider();
  const program = loadProgram(provider);

  const userNoncePda = deriveUserNoncePda(user, program.programId);

  try {
    const accountInfo = await provider.connection.getAccountInfo(userNoncePda);
    if (!accountInfo) {
      return 0n;
    }
    // Parse the account data manually
    // UserNonce: discriminator(8) + user(32) + current_nonce(8) + bump(1)
    const data = accountInfo.data;
    const currentNonce = data.readBigUInt64LE(8 + 32); // Skip discriminator and user
    return currentNonce;
  } catch {
    // Account doesn't exist, nonce is 0
    return 0n;
  }
}

// ============================================
// Get Order Status
// ============================================

export interface OrderStatusInfo {
  orderHash: Buffer;
  isFilledOrCancelled: boolean;
  remaining: bigint;
}

export async function getOrderStatus(orderHash: Buffer): Promise<OrderStatusInfo | null> {
  const provider = getProvider();
  const program = loadProgram(provider);

  const orderStatusPda = deriveOrderStatusPda(orderHash, program.programId);

  try {
    const accountInfo = await provider.connection.getAccountInfo(orderStatusPda);
    if (!accountInfo) {
      return null;
    }
    // Parse the account data manually
    // OrderStatus: discriminator(8) + order_hash(32) + is_filled_or_cancelled(1) + remaining(8) + bump(1)
    const data = accountInfo.data;
    const orderHashBytes = data.subarray(8, 8 + 32);
    const isFilledOrCancelled = data[8 + 32] === 1;
    const remaining = data.readBigUInt64LE(8 + 32 + 1);
    
    return {
      orderHash: Buffer.from(orderHashBytes),
      isFilledOrCancelled,
      remaining,
    };
  } catch {
    return null;
  }
}
