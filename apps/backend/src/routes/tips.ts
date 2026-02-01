import type { FastifyInstance } from 'fastify';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { createServerClient } from '../lib/supabase.js';
import { getWalletAuthHeaders, verifyWalletAuth } from '../lib/auth.js';
import { isValidSolanaAddress } from '../lib/solana.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function verifyTipTransaction(params: {
  signature: string;
  tokenMint: string;
  amountRaw: bigint;
  senderWallet: string;
  recipientWallet: string;
}) {
  const connection = new Connection(RPC_URL, 'confirmed');
  const { signature, tokenMint, amountRaw, senderWallet, recipientWallet } = params;
  const parsedTx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });

  if (!parsedTx) {
    throw new Error('Transaction not found');
  }

  if (parsedTx.meta?.err) {
    throw new Error('Transaction failed');
  }

  const signerMatch = parsedTx.transaction.message.accountKeys.some((account) => {
    return account.pubkey.toBase58() === senderWallet && account.signer;
  });
  if (!signerMatch) {
    throw new Error('Transaction not signed by sender');
  }

  const mint = new PublicKey(tokenMint);
  const sender = new PublicKey(senderWallet);
  const recipient = new PublicKey(recipientWallet);

  const senderAta = await getAssociatedTokenAddress(mint, sender);
  const recipientAta = await getAssociatedTokenAddress(mint, recipient);

  const instructions = [
    ...parsedTx.transaction.message.instructions,
    ...(parsedTx.meta?.innerInstructions?.flatMap((ix) => ix.instructions) || []),
  ];

  let matched = false;
  for (const ix of instructions) {
    if (!('parsed' in ix)) continue;
    const parsed = (ix as any).parsed as any;
    if (!parsed || !parsed.type || !parsed.info) continue;

    const program = (ix as any).program;
    if (program !== 'spl-token' && program !== 'spl-token-2022') continue;

    if (parsed.type === 'transfer') {
      if (
        parsed.info.source === senderAta.toString() &&
        parsed.info.destination === recipientAta.toString() &&
        parsed.info.amount === amountRaw.toString()
      ) {
        matched = true;
        break;
      }
    }

    if (parsed.type === 'transferChecked') {
      if (
        parsed.info.source === senderAta.toString() &&
        parsed.info.destination === recipientAta.toString() &&
        parsed.info.mint === mint.toString() &&
        parsed.info.tokenAmount?.amount === amountRaw.toString()
      ) {
        matched = true;
        break;
      }
    }
  }

  if (!matched) {
    const senderAccount = await getAccount(connection, senderAta);
    const recipientAccount = await getAccount(connection, recipientAta);

    if (senderAccount.mint.toString() !== mint.toString()) {
      throw new Error('Sender token account mint mismatch');
    }
    if (recipientAccount.mint.toString() !== mint.toString()) {
      throw new Error('Recipient token account mint mismatch');
    }

    throw new Error('No matching token transfer found in transaction');
  }
}

type TipType = 'all' | 'market' | 'comment';
type Direction = 'all' | 'sent' | 'received';
type TimePeriod = 'day' | 'week' | 'month' | 'all';

function getStartDate(period: TimePeriod) {
  const now = new Date();
  switch (period) {
    case 'day':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return new Date(0);
  }
}

export default async function tipsRoutes(app: FastifyInstance) {
  app.post('/tips', {
    config: {
      rateLimit: {
        max: Number(process.env.TIP_RATE_LIMIT_MAX || 10),
        timeWindow: Number(process.env.TIP_RATE_LIMIT_WINDOW_MS || 60_000),
      },
    },
  }, async (request, reply) => {
    try {
      const supabase = createServerClient();
      const body = request.body as Record<string, any>;

      const {
        target_type,
        target_id,
        amount_raw,
        token_mint,
        tx_signature,
        sender_wallet,
        recipient_wallet,
      } = body || {};

      if (
        !target_type ||
        !target_id ||
        !amount_raw ||
        !token_mint ||
        !tx_signature ||
        !sender_wallet ||
        !recipient_wallet
      ) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }
      if (!isValidSolanaAddress(sender_wallet)) {
        return reply.code(400).send({ error: 'Invalid sender wallet address' });
      }
      if (!isValidSolanaAddress(recipient_wallet)) {
        return reply.code(400).send({ error: 'Invalid recipient wallet address' });
      }
      if (!isValidSolanaAddress(token_mint)) {
        return reply.code(400).send({ error: 'Invalid token mint address' });
      }

      // SECURITY FIX: Verify that the caller is the sender via wallet signature
      const walletHeaders = getWalletAuthHeaders(request);
      if (!walletHeaders.address || !walletHeaders.signature || !walletHeaders.timestamp || !walletHeaders.nonce) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing wallet auth headers' },
        });
      }

      try {
        await verifyWalletAuth({
          supabase,
          walletAddress: walletHeaders.address,
          signature: walletHeaders.signature,
          timestamp: walletHeaders.timestamp,
          nonce: walletHeaders.nonce,
        });
      } catch (authError: any) {
        return reply.code(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: authError.message || 'Invalid wallet signature' },
        });
      }

      // Verify that the authenticated wallet matches the sender_wallet
      if (walletHeaders.address !== sender_wallet) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Authenticated wallet does not match sender_wallet' },
        });
      }

      if (!['market', 'comment'].includes(target_type)) {
        return reply.code(400).send({ error: 'Invalid target_type' });
      }

      const amount = BigInt(amount_raw);
      if (amount <= 0n) {
        return reply.code(400).send({ error: 'Invalid amount' });
      }

      const { data: sender } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', sender_wallet)
        .single();

      if (!sender) {
        return reply.code(404).send({ error: 'Sender not found' });
      }

      const { data: recipient } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', recipient_wallet)
        .single();

      try {
        await verifyTipTransaction({
          signature: tx_signature,
          tokenMint: token_mint,
          amountRaw: amount,
          senderWallet: sender_wallet,
          recipientWallet: recipient_wallet,
        });
      } catch (error: any) {
        return reply.code(400).send({ error: error?.message || 'Invalid transaction' });
      }

      if (target_type === 'market') {
        const { data: market } = await supabase
          .from('markets')
          .select(
            `
          id,
          creator:creator_id (
            wallet_address
          )
        `
          )
          .eq('id', target_id)
          .single();

        if (!market) {
          return reply.code(404).send({ error: 'Market not found' });
        }

        // Supabase returns joined relations as arrays, get the first element
        const marketCreator = Array.isArray(market.creator) ? market.creator[0] : market.creator;
        if (marketCreator?.wallet_address && marketCreator.wallet_address !== recipient_wallet) {
          return reply.code(400).send({ error: 'Recipient does not match market creator' });
        }

        const { error } = await supabase.from('market_tips').insert([
          {
            market_id: target_id,
            from_user_id: sender.id,
            to_user_id: recipient?.id || null,
            sender_wallet,
            recipient_wallet,
            amount_raw: amount.toString(),
            token_mint,
            tx_signature,
          },
        ]);

        if (error) {
          return reply.code(500).send({ error: error.message });
        }
      } else {
        const { data: comment } = await supabase
          .from('comments')
          .select('id, user_id')
          .eq('id', target_id)
          .single();

        if (!comment) {
          return reply.code(404).send({ error: 'Comment not found' });
        }

        const { data: commentUser } = await supabase
          .from('users')
          .select('wallet_address')
          .eq('id', comment.user_id)
          .single();

        if (commentUser?.wallet_address && commentUser.wallet_address !== recipient_wallet) {
          return reply.code(400).send({ error: 'Recipient does not match comment author' });
        }

        const { error } = await supabase.from('comment_tips').insert([
          {
            comment_id: target_id,
            from_user_id: sender.id,
            to_user_id: recipient?.id || null,
            sender_wallet,
            recipient_wallet,
            amount_raw: amount.toString(),
            token_mint,
            tx_signature,
          },
        ]);

        if (error) {
          return reply.code(500).send({ error: error.message });
        }
      }

      return reply.send({ success: true });
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  app.get('/tips/history', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const query = request.query as Record<string, string | undefined>;
      const wallet = query.wallet;
      const type = (query.type || 'all') as TipType;
      const direction = (query.direction || 'all') as Direction;
      const limit = Number.parseInt(query.limit || '50', 10);
      const offset = Number.parseInt(query.offset || '0', 10);
      const refresh = query.refresh;

      if (!wallet) {
        return reply.code(400).send({ success: false, error: 'wallet is required' });
      }

      const shouldRefresh =
        refresh === '1' ||
        refresh === 'true' ||
        refresh === 'yes' ||
        refresh === 'refresh';

      if (shouldRefresh) {
        const { error: refreshError } = await supabase.rpc('refresh_tips_materialized');
        if (refreshError) {
          return reply.code(500).send({ success: false, error: refreshError.message });
        }
      }

      let tipsQuery = supabase
        .from('tips')
        .select(
          `
          id,
          target_type,
          target_id,
          market_id,
          comment_id,
          sender_wallet,
          recipient_wallet,
          amount_raw,
          token_mint,
          tx_signature,
          created_at,
          market_title,
          comment_content,
          comment_market_id,
          sender_username,
          sender_avatar_url,
          sender_wallet_address,
          recipient_username,
          recipient_avatar_url,
          recipient_wallet_address
        `
        )
        .order('created_at', { ascending: false });

      if (type !== 'all') {
        tipsQuery = tipsQuery.eq('target_type', type);
      }

      if (direction === 'sent') {
        tipsQuery = tipsQuery.eq('sender_wallet', wallet);
      } else if (direction === 'received') {
        tipsQuery = tipsQuery.eq('recipient_wallet', wallet);
      } else {
        tipsQuery = tipsQuery.or(`sender_wallet.eq.${wallet},recipient_wallet.eq.${wallet}`);
      }

      const { data: tips } = await tipsQuery.range(offset, Math.max(offset + limit - 1, 0));

      const history = (tips || []).map((tip: any) => ({
        id: tip.id,
        target_type: tip.target_type,
        target_id: tip.target_id,
        sender_wallet: tip.sender_wallet,
        recipient_wallet: tip.recipient_wallet,
        amount_raw: tip.amount_raw,
        token_mint: tip.token_mint,
        tx_signature: tip.tx_signature,
        created_at: tip.created_at,
        market: tip.market_id
          ? { id: tip.market_id, title: tip.market_title }
          : null,
        comment: tip.comment_id
          ? { id: tip.comment_id, content: tip.comment_content, market_id: tip.comment_market_id }
          : null,
        sender: tip.sender_wallet
          ? {
              username: tip.sender_username,
              avatar_url: tip.sender_avatar_url,
              wallet_address: tip.sender_wallet_address,
            }
          : null,
        recipient: tip.recipient_wallet
          ? {
              username: tip.recipient_username,
              avatar_url: tip.recipient_avatar_url,
              wallet_address: tip.recipient_wallet_address,
            }
          : null,
      }));

      return reply.send({ success: true, data: { history } });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  app.get('/tips/leaderboard', async (request, reply) => {
    try {
      const supabase = createServerClient();
      const query = request.query as Record<string, string | undefined>;
      const period = (query.period || 'week') as TimePeriod;
      const type = (query.type || 'all') as TipType;
      const limit = Number.parseInt(query.limit || '50', 10);
      const refresh = query.refresh;
      const startDate = getStartDate(period);

      const shouldRefresh =
        refresh === '1' ||
        refresh === 'true' ||
        refresh === 'yes' ||
        refresh === 'refresh';

      if (shouldRefresh) {
        const { error: refreshError } = await supabase.rpc('refresh_tips_materialized');
        if (refreshError) {
          return reply.code(500).send({ success: false, error: refreshError.message });
        }
      }

      let tipsQuery = supabase
        .from('tips')
        .select(
          `
          recipient_wallet,
          amount_raw,
          recipient_username,
          recipient_avatar_url
        `
        )
        .gte('created_at', startDate.toISOString());

      if (type !== 'all') {
        tipsQuery = tipsQuery.eq('target_type', type);
      }

      const { data: entries } = await tipsQuery;

      const stats = new Map<
        string,
        {
          recipient_wallet: string;
          total_amount: bigint;
          tip_count: number;
          username?: string | null;
          avatar_url?: string | null;
        }
      >();

      for (const tip of entries || []) {
        const key = tip.recipient_wallet;
        if (!key) continue;
        const current = stats.get(key) || {
          recipient_wallet: key,
          total_amount: 0n,
          tip_count: 0,
          username: tip.recipient_username ?? null,
          avatar_url: tip.recipient_avatar_url ?? null,
        };

        current.total_amount += BigInt(tip.amount_raw || '0');
        current.tip_count += 1;
        current.username = current.username || tip.recipient_username || null;
        current.avatar_url = current.avatar_url || tip.recipient_avatar_url || null;
        stats.set(key, current);
      }

      const leaderboard = Array.from(stats.values())
        .sort((a, b) => Number(b.total_amount - a.total_amount))
        .slice(0, limit)
        .map((entry, index) => ({
          rank: index + 1,
          recipient_wallet: entry.recipient_wallet,
          username: entry.username,
          avatar_url: entry.avatar_url,
          total_amount: entry.total_amount.toString(),
          tip_count: entry.tip_count,
        }));

      return reply.send({ success: true, data: { leaderboard } });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
