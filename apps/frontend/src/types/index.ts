// Market Types - Binary markets only (YES/NO)
export type MarketStatus = 'active' | 'paused' | 'settled' | 'closed' | 'terminated';
export type MarketFrequency = 'all' | 'daily' | 'weekly' | 'monthly';

export interface Market {
  id: string;
  creator_id: string;
  title: string;
  description?: string;
  question: string;
  status: MarketStatus;
  category?: string;
  frequency?: MarketFrequency;
  created_at: string;
  updated_at: string;
  tip_amount?: string | number;
  tip_count?: number;
  solana_market_account?: string;
  switchboard_queue?: string;
  randomness_account?: string;
  // Binary market specific fields
  current_yes_price?: number;
  current_no_price?: number;
  probability?: number;
  total_volume?: number;
  volume_24h?: number;
  liquidity?: number;
  total_liquidity?: number;
  total_trades?: number;
  settlement_count?: number;
  max_settlements?: number;
  unique_traders?: number;
  is_paused?: boolean;
  creator_wallet?: string;
  // Random termination fields
  random_termination_enabled?: boolean;
  termination_probability?: number;
  is_randomly_terminated?: boolean;
  final_yes_price?: number;
  final_no_price?: number;
  can_redeem?: boolean;
  creator?: {
    id?: string;
    wallet_address?: string;
    username?: string | null;
    avatar?: string | null;
  } | null;
  metadata?: {
    outcomes?: Array<{
      label?: string;
      symbol?: string;
    }>;
  };
}

// AUDIT FIX v1.2.7: Updated Order type to match API response
export interface Order {
  id: string;
  // API returns both formats, support both
  user_id?: string;
  userId?: string;
  market_id?: string;
  marketId?: string;
  // Order details
  outcome_type?: number | 'yes' | 'no';
  outcomeType?: number | 'yes' | 'no';
  side: 'buy' | 'sell';
  order_type?: 'limit' | 'market';
  orderType?: 'limit' | 'market';
  price: number | null;
  amount?: number;
  quantity?: number;
  size?: number;
  remaining_amount?: number;
  remainingAmount?: number;
  remaining?: number;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
  // Nonce and signature for CLOB
  nonce?: string | null;
  signature?: string | null;
  order_hash?: string | null;
  orderHash?: string | null;
  expires_at?: string | null;
  expiresAt?: string | null;
  // Timestamps
  created_at?: string;
  createdAt?: string;
  filled_at?: string;
  filledAt?: string;
  cancelled_at?: string;
  cancelledAt?: string;
  // User info (from join)
  user?: {
    username?: string | null;
    wallet_address?: string | null;
  } | null;
  maker?: string;
}

// AUDIT FIX v1.2.7: Updated Trade type to match API response
export interface Trade {
  id: string;
  // API returns both formats, support both
  market_id?: string;
  marketId?: string;
  market?: string;
  user_id?: string | null;
  userId?: string | null;
  // Trade parties
  maker_user_id?: string;
  makerUserId?: string;
  maker?: string;
  taker_user_id?: string;
  takerUserId?: string;
  taker?: string;
  // Trade details
  outcome_type?: number | 'yes' | 'no';
  outcomeType?: number | 'yes' | 'no';
  outcome?: number;
  side: 'buy' | 'sell';
  amount?: number;
  size?: number;
  price: number;
  total_cost?: number;
  totalCost?: number;
  // Transaction info
  transaction_signature?: string | null;
  txSignature?: string | null;
  slot?: number | null;
  block_time?: string | null;
  blockTime?: string | null;
  // Timestamps
  created_at?: string;
  createdAt?: string;
  // User info (from join)
  user?: {
    username?: string | null;
    avatar_url?: string | null;
    wallet_address?: string | null;
  } | null;
}

export interface Comment {
  id: string;
  user_id: string;
  market_id: string;
  parent_id?: string;
  content: any; // Tiptap JSON content
  created_at: string;
  updated_at: string;
  tip_amount?: string | number;
  tip_count?: number;
  user?: {
    id?: string;
    wallet_address?: string;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface User {
  id: string;
  wallet_address: string;
  username?: string;
  avatar_url?: string;
  bio?: string;
  created_at: string;
  updated_at: string;
}

// Token2022 Metadata
export interface TokenMetadata {
  marketId: string;
  settlementIndex: number;
  createdAt: number;
}
