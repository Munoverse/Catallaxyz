-- ============================================
-- Catallaxyz Database Schema
-- Optimized for Supabase/PostgreSQL
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM TYPES (skip if already exists)
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_status') THEN
        CREATE TYPE market_status AS ENUM ('active', 'running', 'paused', 'settled', 'terminated', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_state') THEN
        CREATE TYPE order_state AS ENUM ('open', 'partial', 'filled', 'cancelled', 'expired');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_side') THEN
        CREATE TYPE order_side AS ENUM ('buy', 'sell');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
        CREATE TYPE order_type AS ENUM ('limit', 'market');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outcome_type') THEN
        CREATE TYPE outcome_type AS ENUM ('yes', 'no');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM ('trade', 'settlement', 'system', 'reward', 'follow');
    END IF;
END
$$;

-- ============================================
-- CORE TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    email TEXT,
    avatar_url TEXT,
    bio TEXT,
    display_name TEXT,
    twitter_handle TEXT,
    
    -- Stats (denormalized for performance)
    total_markets_created INTEGER DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    total_volume BIGINT DEFAULT 0,
    total_pnl BIGINT DEFAULT 0,
    termination_count INTEGER DEFAULT 0,
    
    -- Metadata
    is_verified BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Markets table
CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Basic info
    title TEXT NOT NULL,
    description TEXT,
    question TEXT NOT NULL,
    category TEXT,
    frequency TEXT,
    image_url TEXT,
    
    -- Solana references
    solana_market_account TEXT UNIQUE,
    market_usdc_vault TEXT,
    switchboard_queue TEXT,
    randomness_account TEXT,
    creator_wallet TEXT,
    
    -- Status
    status market_status DEFAULT 'active',
    is_paused BOOLEAN DEFAULT FALSE,
    paused_at TIMESTAMPTZ,
    paused_reason TEXT,
    
    -- Pricing (scaled by 10^6)
    current_yes_price NUMERIC(18,6),
    current_no_price NUMERIC(18,6),
    probability NUMERIC(18,6),
    final_yes_price NUMERIC(18,6),
    final_no_price NUMERIC(18,6),
    winning_outcome outcome_type,
    
    -- Termination
    can_redeem BOOLEAN DEFAULT FALSE,
    is_randomly_terminated BOOLEAN DEFAULT FALSE,
    termination_triggered_at TIMESTAMPTZ,
    
    -- Volume & liquidity (in lamports)
    total_volume BIGINT DEFAULT 0,
    volume_24h BIGINT DEFAULT 0,
    liquidity BIGINT DEFAULT 0,
    open_interest BIGINT DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    participants_count INTEGER DEFAULT 0,
    
    -- Fees
    rent_paid BIGINT,
    platform_fee BIGINT,
    tip_amount BIGINT DEFAULT 0,
    
    -- Settlement tracking
    current_settlement_index INTEGER DEFAULT 0,
    last_checked_slot BIGINT,
    
    -- Timestamps
    last_trade_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Order details
    client_order_id TEXT,
    question_index INTEGER DEFAULT 0,
    outcome_type outcome_type NOT NULL,
    side order_side NOT NULL,
    order_type order_type NOT NULL,
    
    -- Amounts (in lamports)
    price NUMERIC(18,6),
    amount BIGINT NOT NULL,
    filled_amount BIGINT DEFAULT 0,
    remaining_amount BIGINT,
    
    -- Fees
    maker_fee BIGINT DEFAULT 0,
    taker_fee BIGINT DEFAULT 0,
    
    -- Status
    status order_state DEFAULT 'open',
    
    -- Blockchain reference
    transaction_signature TEXT,
    order_hash TEXT,
    salt TEXT,
    nonce BIGINT,
    slot BIGINT,
    
    -- Timestamps
    expires_at TIMESTAMPTZ,
    filled_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Trade participants (for matched orders)
    maker_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    taker_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    maker_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    taker_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    
    -- Trade details
    outcome_type outcome_type NOT NULL,
    side order_side NOT NULL,
    amount BIGINT NOT NULL,
    price NUMERIC(18,6) NOT NULL,
    total_cost BIGINT,
    
    -- Fees
    maker_fee BIGINT DEFAULT 0,
    taker_fee BIGINT DEFAULT 0,
    
    -- Match type
    match_type TEXT, -- 'complementary', 'mint', 'merge'
    
    -- Blockchain reference
    transaction_signature TEXT UNIQUE,
    slot BIGINT,
    block_time TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order fills (detailed fill records)
CREATE TABLE IF NOT EXISTS order_fills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    maker_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    taker_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    outcome_type outcome_type NOT NULL,
    side order_side NOT NULL,
    price NUMERIC(18,6) NOT NULL,
    amount BIGINT NOT NULL,
    total_cost BIGINT,
    
    -- Fees
    maker_fee BIGINT DEFAULT 0,
    taker_fee BIGINT DEFAULT 0,
    platform_fee BIGINT DEFAULT 0,
    creator_fee BIGINT DEFAULT 0,
    maker_rebate BIGINT DEFAULT 0,
    
    transaction_signature TEXT,
    slot BIGINT,
    block_time TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User positions (stakes)
CREATE TABLE IF NOT EXISTS stakes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    outcome_type outcome_type NOT NULL,
    amount BIGINT NOT NULL DEFAULT 0,
    average_price NUMERIC(18,6),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, market_id, outcome_type)
);

-- User balances (USDC balance per market)
CREATE TABLE IF NOT EXISTS user_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    usdc_balance BIGINT NOT NULL DEFAULT 0,
    locked_balance BIGINT NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, market_id)
);

-- Market settlements
CREATE TABLE IF NOT EXISTS market_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    settlement_type TEXT NOT NULL, -- 'random_vrf', 'auto_terminated', 'manual'
    settlement_index INTEGER DEFAULT 0,
    winning_outcome outcome_type,
    winning_probability NUMERIC(18,6),
    settlement_probability NUMERIC(18,6),
    yes_price NUMERIC(18,6),
    no_price NUMERIC(18,6),
    
    last_trader_id UUID REFERENCES users(id) ON DELETE SET NULL,
    total_payout BIGINT DEFAULT 0,
    
    transaction_signature TEXT,
    slot BIGINT,
    settled_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Redemptions
CREATE TABLE IF NOT EXISTS redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    outcome_type outcome_type NOT NULL,
    amount BIGINT NOT NULL,
    usdc_received BIGINT NOT NULL,
    
    transaction_signature TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLATFORM TABLES
-- ============================================

-- Platform settings
CREATE TABLE IF NOT EXISTS platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value JSONB,
    
    -- Fee configuration
    platform_fee_rate NUMERIC(18,6),
    maker_rebate_rate NUMERIC(18,6),
    creator_incentive_rate NUMERIC(18,6),
    center_taker_fee_rate NUMERIC(18,6),
    extreme_taker_fee_rate NUMERIC(18,6),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    display_order INTEGER DEFAULT 0,
    name_zh TEXT,
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Category stats (materialized view or table)
CREATE TABLE IF NOT EXISTS category_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL,
    market_count INTEGER DEFAULT 0,
    total_volume BIGINT DEFAULT 0,
    total_liquidity BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys (for CLOB API)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    api_key TEXT UNIQUE NOT NULL,
    api_secret TEXT NOT NULL,
    name TEXT,
    
    permissions TEXT[] DEFAULT ARRAY['read', 'trade'],
    is_active BOOLEAN DEFAULT TRUE,
    
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auth nonces (for wallet authentication)
CREATE TABLE IF NOT EXISTS auth_nonces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User nonces (for CLOB order cancellation - synced from on-chain UserNonce account)
CREATE TABLE IF NOT EXISTS user_nonces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_address TEXT UNIQUE NOT NULL,
    current_nonce BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global state (synced from on-chain Global account)
CREATE TABLE IF NOT EXISTS global_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Authority and wallets
    authority TEXT NOT NULL,
    usdc_mint TEXT NOT NULL,
    keeper TEXT,
    
    -- Fee configuration (scaled by 10^6)
    center_taker_fee_rate INTEGER DEFAULT 0,
    extreme_taker_fee_rate INTEGER DEFAULT 0,
    platform_fee_rate INTEGER DEFAULT 0,
    maker_rebate_rate INTEGER DEFAULT 0,
    creator_incentive_rate INTEGER DEFAULT 0,
    
    -- Fee collection totals (in lamports)
    total_trading_fees_collected BIGINT DEFAULT 0,
    total_creation_fees_collected BIGINT DEFAULT 0,
    
    -- Operators
    operator_count INTEGER DEFAULT 0,
    operators TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Status
    trading_paused BOOLEAN DEFAULT FALSE,
    
    -- Sync metadata
    last_synced_slot BIGINT,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync state (tracks blockchain sync progress for each service)
CREATE TABLE IF NOT EXISTS sync_state (
    service TEXT PRIMARY KEY,
    last_slot BIGINT DEFAULT 0,
    last_signature TEXT,
    last_block_time TIMESTAMPTZ,
    events_processed BIGINT DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order status (synced from on-chain OrderStatus PDAs)
CREATE TABLE IF NOT EXISTS order_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_hash TEXT UNIQUE NOT NULL,
    is_filled_or_cancelled BOOLEAN DEFAULT FALSE,
    remaining BIGINT NOT NULL DEFAULT 0,
    
    -- Sync metadata
    last_synced_slot BIGINT,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event log (stores all indexed blockchain events for audit trail)
CREATE TABLE IF NOT EXISTS event_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Event identification
    event_type TEXT NOT NULL,
    transaction_signature TEXT NOT NULL,
    slot BIGINT NOT NULL,
    block_time TIMESTAMPTZ,
    
    -- Event data
    program_id TEXT NOT NULL,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Raw event data (JSON)
    event_data JSONB NOT NULL,
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate events
    UNIQUE(transaction_signature, event_type)
);

-- ============================================
-- SOCIAL FEATURES
-- ============================================

-- Comments
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment likes
CREATE TABLE IF NOT EXISTS comment_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(comment_id, user_id)
);

-- Tips
CREATE TABLE IF NOT EXISTS tips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    comment_id UUID REFERENCES comments(id) ON DELETE SET NULL,
    
    amount BIGINT NOT NULL,
    transaction_signature TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market tips
CREATE TABLE IF NOT EXISTS market_tips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    amount BIGINT NOT NULL,
    transaction_signature TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment tips
CREATE TABLE IF NOT EXISTS comment_tips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    amount BIGINT NOT NULL,
    transaction_signature TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User favorites
CREATE TABLE IF NOT EXISTS user_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, market_id)
);

-- User follows
CREATE TABLE IF NOT EXISTS user_follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(follower_id, following_id),
    CHECK(follower_id != following_id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANALYTICS & STATS TABLES
-- ============================================

-- User operations (activity log)
CREATE TABLE IF NOT EXISTS user_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    
    operation_type TEXT NOT NULL, -- 'deposit', 'withdraw', 'trade', 'settlement'
    amount BIGINT,
    
    transaction_signature TEXT,
    slot BIGINT,
    
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User stats (aggregated)
CREATE TABLE IF NOT EXISTS user_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    total_trades INTEGER DEFAULT 0,
    total_volume BIGINT DEFAULT 0,
    total_pnl BIGINT DEFAULT 0,
    win_rate NUMERIC(5,2),
    
    markets_participated INTEGER DEFAULT 0,
    markets_created INTEGER DEFAULT 0,
    
    best_trade_pnl BIGINT,
    worst_trade_pnl BIGINT,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User market performance
CREATE TABLE IF NOT EXISTS user_market_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    trades INTEGER DEFAULT 0,
    volume BIGINT DEFAULT 0,
    pnl BIGINT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, market_id)
);

-- Market stats (time-series friendly)
CREATE TABLE IF NOT EXISTS market_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    timestamp TIMESTAMPTZ NOT NULL,
    yes_price NUMERIC(18,6),
    no_price NUMERIC(18,6),
    volume BIGINT DEFAULT 0,
    trades INTEGER DEFAULT 0,
    liquidity BIGINT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market probability history (for charts)
CREATE TABLE IF NOT EXISTS market_probability_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    timestamp TIMESTAMPTZ NOT NULL,
    probability NUMERIC(18,6) NOT NULL,
    volume BIGINT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orderbook depth (aggregated for display)
CREATE TABLE IF NOT EXISTS orderbook_depth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    
    question_index INTEGER DEFAULT 0,
    outcome_type outcome_type NOT NULL,
    side order_side NOT NULL,
    price NUMERIC(18,6) NOT NULL,
    
    total_size BIGINT NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(market_id, question_index, outcome_type, side, price)
);

-- Liquidity rewards
CREATE TABLE IF NOT EXISTS liquidity_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    
    amount BIGINT NOT NULL,
    reward_type TEXT NOT NULL, -- 'maker_rebate', 'liquidity_mining'
    
    transaction_signature TEXT,
    is_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geo rules (for compliance)
CREATE TABLE IF NOT EXISTS geo_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code TEXT NOT NULL,
    is_blocked BOOLEAN DEFAULT FALSE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_twitter_handle ON users(twitter_handle);

-- Markets indexes (CRITICAL for scalability)
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_status_category ON markets(status, category);
CREATE INDEX IF NOT EXISTS idx_markets_created_at ON markets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_last_trade_at ON markets(last_trade_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_total_volume ON markets(total_volume DESC);
CREATE INDEX IF NOT EXISTS idx_markets_volume_24h ON markets(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_markets_liquidity ON markets(liquidity DESC);
CREATE INDEX IF NOT EXISTS idx_markets_tip_amount ON markets(tip_amount DESC);
CREATE INDEX IF NOT EXISTS idx_markets_solana_account ON markets(solana_market_account);
CREATE INDEX IF NOT EXISTS idx_markets_creator_id ON markets(creator_id);
CREATE INDEX IF NOT EXISTS idx_markets_frequency ON markets(frequency);
CREATE INDEX IF NOT EXISTS idx_markets_settlement_index ON markets(current_settlement_index);

-- Composite index for inactive market queries
CREATE INDEX IF NOT EXISTS idx_markets_inactive_candidates 
    ON markets(status, last_trade_at) 
    WHERE status IN ('active', 'running', 'paused') AND last_trade_at IS NOT NULL;

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_market_id ON orders(market_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_market_status ON orders(market_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_client_order_id ON orders(client_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_hash ON orders(order_hash);

-- Composite index for active orders
CREATE INDEX IF NOT EXISTS idx_orders_active 
    ON orders(market_id, status, side, price) 
    WHERE status IN ('open', 'partial');

-- Trades indexes
CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_maker_user_id ON trades(maker_user_id);
CREATE INDEX IF NOT EXISTS idx_trades_taker_user_id ON trades(taker_user_id);
CREATE INDEX IF NOT EXISTS idx_trades_block_time ON trades(block_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_transaction_signature ON trades(transaction_signature);

-- Stakes indexes
CREATE INDEX IF NOT EXISTS idx_stakes_user_id ON stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_stakes_market_id ON stakes(market_id);
CREATE INDEX IF NOT EXISTS idx_stakes_user_market ON stakes(user_id, market_id);

-- User balances indexes
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_market_id ON user_balances(market_id);

-- Market settlements indexes
CREATE INDEX IF NOT EXISTS idx_market_settlements_market_id ON market_settlements(market_id);
CREATE INDEX IF NOT EXISTS idx_market_settlements_transaction ON market_settlements(transaction_signature);

-- Order fills indexes
CREATE INDEX IF NOT EXISTS idx_order_fills_market_id ON order_fills(market_id);
CREATE INDEX IF NOT EXISTS idx_order_fills_order_id ON order_fills(order_id);
CREATE INDEX IF NOT EXISTS idx_order_fills_block_time ON order_fills(block_time DESC);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Comments indexes
CREATE INDEX IF NOT EXISTS idx_comments_market_id ON comments(market_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- User favorites indexes
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_market_id ON user_favorites(market_id);

-- User follows indexes
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);

-- Orderbook depth indexes
CREATE INDEX IF NOT EXISTS idx_orderbook_depth_market ON orderbook_depth(market_id);
CREATE INDEX IF NOT EXISTS idx_orderbook_depth_lookup 
    ON orderbook_depth(market_id, outcome_type, side, price);

-- Market stats indexes (time-series)
CREATE INDEX IF NOT EXISTS idx_market_stats_market_time ON market_stats(market_id, timestamp DESC);

-- Market probability history indexes
CREATE INDEX IF NOT EXISTS idx_market_prob_history_market_time 
    ON market_probability_history(market_id, timestamp DESC);

-- API keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key);

-- Auth nonces indexes
CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet ON auth_nonces(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);

-- User operations indexes
CREATE INDEX IF NOT EXISTS idx_user_operations_user_id ON user_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_operations_market_id ON user_operations(market_id);
CREATE INDEX IF NOT EXISTS idx_user_operations_created_at ON user_operations(created_at DESC);

-- Liquidity rewards indexes
CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_user_id ON liquidity_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_unpaid ON liquidity_rewards(is_paid) WHERE is_paid = FALSE;

-- Redemptions indexes
CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_market_id ON redemptions(market_id);

-- ============================================
-- INDEXES FOR VIEWS
-- ============================================

-- Market tips indexes (for tips_view, tip_leaderboard)
CREATE INDEX IF NOT EXISTS idx_market_tips_market_id ON market_tips(market_id);
CREATE INDEX IF NOT EXISTS idx_market_tips_user_id ON market_tips(user_id);
CREATE INDEX IF NOT EXISTS idx_market_tips_created_at ON market_tips(created_at DESC);

-- Comment tips indexes (for tips_view, tip_leaderboard)
CREATE INDEX IF NOT EXISTS idx_comment_tips_comment_id ON comment_tips(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_tips_user_id ON comment_tips(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_tips_created_at ON comment_tips(created_at DESC);

-- Stakes indexes for views (user_positions_summary, redeemable_positions)
CREATE INDEX IF NOT EXISTS idx_stakes_outcome_type ON stakes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_stakes_user_market_outcome 
    ON stakes(user_id, market_id, outcome_type);
CREATE INDEX IF NOT EXISTS idx_stakes_amount_positive 
    ON stakes(user_id, market_id) 
    WHERE amount > 0;

-- User market performance indexes (for user_market_performance_view)
CREATE INDEX IF NOT EXISTS idx_user_market_perf_user_id ON user_market_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_user_market_perf_market_id ON user_market_performance(market_id);
CREATE INDEX IF NOT EXISTS idx_user_market_perf_user_market 
    ON user_market_performance(user_id, market_id);

-- User stats indexes (for trading_leaderboard, user_stats_view)
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);

-- Markets indexes for views (redeemable_positions, market_overview)
CREATE INDEX IF NOT EXISTS idx_markets_can_redeem ON markets(can_redeem) WHERE can_redeem = true;
CREATE INDEX IF NOT EXISTS idx_markets_winning_outcome ON markets(winning_outcome);

-- Comments index for market_overview (active comments count)
CREATE INDEX IF NOT EXISTS idx_comments_market_active 
    ON comments(market_id) 
    WHERE is_deleted = false;

-- Users indexes for leaderboard sorting
CREATE INDEX IF NOT EXISTS idx_users_total_pnl ON users(total_pnl DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_users_total_volume ON users(total_volume DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_users_total_trades ON users(total_trades DESC NULLS LAST);

-- Categories indexes (for category_stats_view)
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_categories_featured ON categories(is_featured) WHERE is_featured = TRUE;

-- User nonces indexes
CREATE INDEX IF NOT EXISTS idx_user_nonces_user_id ON user_nonces(user_id);
CREATE INDEX IF NOT EXISTS idx_user_nonces_wallet ON user_nonces(wallet_address);

-- Order status indexes
CREATE INDEX IF NOT EXISTS idx_order_status_order_hash ON order_status(order_hash);
CREATE INDEX IF NOT EXISTS idx_order_status_is_filled ON order_status(is_filled_or_cancelled) WHERE is_filled_or_cancelled = false;

-- Event log indexes
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_slot ON event_log(slot DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_tx_sig ON event_log(transaction_signature);
CREATE INDEX IF NOT EXISTS idx_event_log_market_id ON event_log(market_id);
CREATE INDEX IF NOT EXISTS idx_event_log_user_id ON event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_unprocessed ON event_log(processed, created_at) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_event_log_type_market ON event_log(event_type, market_id);

-- Sync state indexes
CREATE INDEX IF NOT EXISTS idx_sync_state_updated ON sync_state(updated_at DESC);

-- ============================================
-- VIEWS
-- ============================================

-- Inactive market candidates view
CREATE OR REPLACE VIEW inactive_market_candidates AS
SELECT 
    m.id,
    m.title,
    m.solana_market_account,
    m.last_trade_at,
    m.status,
    m.creator_wallet,
    EXTRACT(EPOCH FROM (NOW() - m.last_trade_at)) / 86400 AS days_inactive
FROM markets m
WHERE m.status IN ('active', 'running', 'paused')
    AND m.last_trade_at IS NOT NULL
    AND m.last_trade_at < NOW() - INTERVAL '7 days'
ORDER BY m.last_trade_at ASC;

-- User stats view (aggregated user statistics)
CREATE OR REPLACE VIEW user_stats_view AS
SELECT 
    u.id AS user_id,
    u.wallet_address,
    u.username,
    u.avatar_url,
    u.created_at,
    u.last_login_at,
    COALESCE(u.total_trades, 0) AS total_trades,
    COALESCE(u.total_volume, 0) AS total_volume,
    COALESCE(u.total_pnl, 0) AS total_pnl,
    COALESCE(u.total_markets_created, 0) AS markets_created,
    COALESCE(u.termination_count, 0) AS terminations_count,
    -- Calculated stats from trades
    COALESCE(ts.win_count, 0) AS win_count,
    COALESCE(ts.loss_count, 0) AS loss_count,
    CASE 
        WHEN COALESCE(ts.win_count, 0) + COALESCE(ts.loss_count, 0) > 0 
        THEN ROUND(ts.win_count::NUMERIC / (ts.win_count + ts.loss_count) * 100, 2)
        ELSE 0 
    END AS win_rate,
    COALESCE(ts.best_trade_pnl, 0) AS best_trade_pnl,
    COALESCE(ts.worst_trade_pnl, 0) AS worst_trade_pnl,
    COALESCE(ts.markets_participated, 0) AS markets_participated,
    -- Positions
    COALESCE(ps.active_positions, 0) AS active_positions,
    COALESCE(ps.total_position_value, 0) AS total_position_value
FROM users u
LEFT JOIN LATERAL (
    SELECT 
        COUNT(DISTINCT market_id) AS markets_participated,
        MAX(CASE WHEN t.amount > 0 THEN t.amount * t.price END) AS best_trade_pnl,
        MIN(CASE WHEN t.amount > 0 THEN -t.amount * t.price END) AS worst_trade_pnl,
        COUNT(*) FILTER (WHERE t.side = 'buy') AS win_count,
        COUNT(*) FILTER (WHERE t.side = 'sell') AS loss_count
    FROM trades t
    WHERE t.user_id = u.id OR t.maker_user_id = u.id OR t.taker_user_id = u.id
) ts ON true
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*) FILTER (WHERE s.amount > 0) AS active_positions,
        SUM(s.amount) AS total_position_value
    FROM stakes s
    WHERE s.user_id = u.id
) ps ON true;

-- User market performance view
CREATE OR REPLACE VIEW user_market_performance_view AS
SELECT 
    ump.id,
    ump.user_id,
    ump.market_id,
    m.title AS market_title,
    m.status AS market_status,
    ump.trades AS num_trades,
    ump.volume AS total_volume,
    ump.pnl AS total_pnl,
    -- Calculate positions
    COALESCE(yes_stake.amount, 0) AS yes_position,
    COALESCE(no_stake.amount, 0) AS no_position,
    (COALESCE(yes_stake.amount, 0) + COALESCE(no_stake.amount, 0)) AS total_position_value,
    ump.created_at AS first_position_date,
    ump.updated_at AS last_activity_date
FROM user_market_performance ump
JOIN markets m ON m.id = ump.market_id
LEFT JOIN stakes yes_stake ON yes_stake.user_id = ump.user_id 
    AND yes_stake.market_id = ump.market_id 
    AND yes_stake.outcome_type = 'yes'
LEFT JOIN stakes no_stake ON no_stake.user_id = ump.user_id 
    AND no_stake.market_id = ump.market_id 
    AND no_stake.outcome_type = 'no';

-- Category stats view
CREATE OR REPLACE VIEW category_stats_view AS
SELECT 
    c.id,
    c.name,
    c.slug,
    c.description,
    c.icon,
    c.color,
    c.display_order,
    c.name_zh,
    c.is_featured,
    c.is_active,
    COUNT(m.id) AS market_count,
    COALESCE(SUM(m.total_volume), 0) AS total_volume,
    COALESCE(SUM(m.liquidity), 0) AS total_liquidity,
    COUNT(m.id) FILTER (WHERE m.status = 'active') AS active_markets,
    NOW() AS updated_at
FROM categories c
LEFT JOIN markets m ON m.category = c.name OR m.category = c.slug
GROUP BY c.id, c.name, c.slug, c.description, c.icon, c.color, c.display_order, c.name_zh, c.is_featured, c.is_active;

-- Tips unified view (combines market_tips and comment_tips)
CREATE OR REPLACE VIEW tips_view AS
SELECT 
    mt.id,
    'market' AS target_type,
    mt.market_id AS target_id,
    mt.market_id,
    NULL::UUID AS comment_id,
    u_from.wallet_address AS sender_wallet,
    u_to.wallet_address AS recipient_wallet,
    mt.amount AS amount_raw,
    'USDC' AS token_mint,
    mt.transaction_signature AS tx_signature,
    mt.created_at,
    m.title AS market_title,
    NULL::TEXT AS comment_content,
    NULL::UUID AS comment_market_id,
    u_from.username AS sender_username,
    u_from.avatar_url AS sender_avatar_url,
    u_from.wallet_address AS sender_wallet_address,
    u_to.username AS recipient_username,
    u_to.avatar_url AS recipient_avatar_url,
    u_to.wallet_address AS recipient_wallet_address
FROM market_tips mt
JOIN markets m ON m.id = mt.market_id
JOIN users u_from ON u_from.id = mt.user_id
LEFT JOIN users u_to ON u_to.id = m.creator_id

UNION ALL

SELECT 
    ct.id,
    'comment' AS target_type,
    ct.comment_id AS target_id,
    c.market_id,
    ct.comment_id,
    u_from.wallet_address AS sender_wallet,
    u_to.wallet_address AS recipient_wallet,
    ct.amount AS amount_raw,
    'USDC' AS token_mint,
    ct.transaction_signature AS tx_signature,
    ct.created_at,
    NULL::TEXT AS market_title,
    c.content AS comment_content,
    c.market_id AS comment_market_id,
    u_from.username AS sender_username,
    u_from.avatar_url AS sender_avatar_url,
    u_from.wallet_address AS sender_wallet_address,
    u_to.username AS recipient_username,
    u_to.avatar_url AS recipient_avatar_url,
    u_to.wallet_address AS recipient_wallet_address
FROM comment_tips ct
JOIN comments c ON c.id = ct.comment_id
JOIN users u_from ON u_from.id = ct.user_id
LEFT JOIN users u_to ON u_to.id = c.user_id;

-- Tips unified view (alternative structure combining market_tips and comment_tips)
CREATE OR REPLACE VIEW tips_unified AS
SELECT 
    mt.id,
    'market' AS target_type,
    mt.market_id AS target_id,
    mt.market_id,
    NULL::UUID AS comment_id,
    u_sender.wallet_address AS sender_wallet,
    COALESCE(u_recipient.wallet_address, m.creator_wallet) AS recipient_wallet,
    mt.amount::TEXT AS amount_raw,
    'USDC' AS token_mint,
    mt.transaction_signature AS tx_signature,
    mt.created_at,
    m.title AS market_title,
    NULL::TEXT AS comment_content,
    NULL::UUID AS comment_market_id,
    u_sender.username AS sender_username,
    u_sender.avatar_url AS sender_avatar_url,
    u_sender.wallet_address AS sender_wallet_address,
    u_recipient.username AS recipient_username,
    u_recipient.avatar_url AS recipient_avatar_url,
    u_recipient.wallet_address AS recipient_wallet_address
FROM market_tips mt
LEFT JOIN users u_sender ON mt.user_id = u_sender.id
LEFT JOIN markets m ON mt.market_id = m.id
LEFT JOIN users u_recipient ON m.creator_id = u_recipient.id

UNION ALL

SELECT 
    ct.id,
    'comment' AS target_type,
    ct.comment_id AS target_id,
    c.market_id,
    ct.comment_id,
    u_sender.wallet_address AS sender_wallet,
    u_recipient.wallet_address AS recipient_wallet,
    ct.amount::TEXT AS amount_raw,
    'USDC' AS token_mint,
    ct.transaction_signature AS tx_signature,
    ct.created_at,
    m.title AS market_title,
    c.content AS comment_content,
    c.market_id AS comment_market_id,
    u_sender.username AS sender_username,
    u_sender.avatar_url AS sender_avatar_url,
    u_sender.wallet_address AS sender_wallet_address,
    u_recipient.username AS recipient_username,
    u_recipient.avatar_url AS recipient_avatar_url,
    u_recipient.wallet_address AS recipient_wallet_address
FROM comment_tips ct
LEFT JOIN users u_sender ON ct.user_id = u_sender.id
LEFT JOIN comments c ON ct.comment_id = c.id
LEFT JOIN users u_recipient ON c.user_id = u_recipient.id
LEFT JOIN markets m ON c.market_id = m.id;

-- User positions view (YES/NO balances per user per market)
CREATE OR REPLACE VIEW user_positions_view AS
SELECT 
    s.user_id,
    s.market_id,
    u.wallet_address,
    COALESCE(SUM(CASE WHEN s.outcome_type = 'yes' THEN s.amount ELSE 0 END), 0) AS yes_balance,
    COALESCE(SUM(CASE WHEN s.outcome_type = 'no' THEN s.amount ELSE 0 END), 0) AS no_balance,
    MAX(s.updated_at) AS updated_at
FROM stakes s
JOIN users u ON s.user_id = u.id
GROUP BY s.user_id, s.market_id, u.wallet_address;

-- Tip leaderboard view
CREATE OR REPLACE VIEW tip_leaderboard AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY SUM(t.amount_raw) DESC) AS rank,
    t.recipient_wallet,
    u.username,
    u.avatar_url,
    SUM(t.amount_raw) AS total_amount,
    COUNT(*) AS tip_count
FROM tips_view t
LEFT JOIN users u ON u.wallet_address = t.recipient_wallet
GROUP BY t.recipient_wallet, u.username, u.avatar_url
ORDER BY total_amount DESC;

-- Trading leaderboard view
CREATE OR REPLACE VIEW trading_leaderboard AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY COALESCE(u.total_pnl, 0) DESC) AS rank,
    u.id AS user_id,
    u.username,
    u.avatar_url,
    COALESCE(u.total_pnl, 0) AS profit,
    CASE 
        WHEN COALESCE(u.total_volume, 0) > 0 
        THEN ROUND(u.total_pnl::NUMERIC / u.total_volume * 100, 2)
        ELSE 0 
    END AS profit_percentage,
    COALESCE(u.total_volume, 0) AS volume,
    COALESCE(u.total_trades, 0) AS trades,
    COALESCE(us.win_rate, 0) AS win_rate,
    COALESCE(u.total_markets_created, 0) AS markets_created,
    COALESCE(u.termination_count, 0) AS terminations_count
FROM users u
LEFT JOIN user_stats us ON us.user_id = u.id
WHERE u.total_trades > 0 OR u.total_volume > 0
ORDER BY profit DESC;

-- Market overview view (for market list with aggregated data)
CREATE OR REPLACE VIEW market_overview AS
SELECT 
    m.id,
    m.title,
    m.description,
    m.question,
    m.category,
    m.frequency,
    m.status,
    m.solana_market_account,
    m.current_yes_price,
    m.current_no_price,
    m.probability,
    m.total_volume,
    m.volume_24h,
    m.liquidity,
    m.total_trades,
    m.participants_count,
    m.tip_amount,
    m.is_paused,
    m.can_redeem,
    m.is_randomly_terminated,
    m.final_yes_price,
    m.final_no_price,
    m.winning_outcome,
    m.created_at,
    m.updated_at,
    m.last_trade_at,
    m.settled_at,
    -- Creator info
    u.id AS creator_id,
    u.wallet_address AS creator_wallet_address,
    u.username AS creator_username,
    u.avatar_url AS creator_avatar_url,
    -- Comment count
    COALESCE(cc.comment_count, 0) AS comment_count,
    -- Tip count
    COALESCE(tc.tip_count, 0) AS tip_count
FROM markets m
LEFT JOIN users u ON u.id = m.creator_id
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS comment_count 
    FROM comments c 
    WHERE c.market_id = m.id AND c.is_deleted = false
) cc ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS tip_count 
    FROM market_tips mt 
    WHERE mt.market_id = m.id
) tc ON true;

-- User positions summary view
CREATE OR REPLACE VIEW user_positions_summary AS
SELECT 
    s.user_id,
    s.market_id,
    m.title AS market_title,
    m.status AS market_status,
    m.current_yes_price,
    m.current_no_price,
    m.final_yes_price,
    m.final_no_price,
    m.can_redeem,
    m.is_randomly_terminated,
    m.solana_market_account AS market_address,
    m.market_usdc_vault,
    m.winning_outcome,
    m.settled_at AS terminated_at,
    SUM(CASE WHEN s.outcome_type = 'yes' THEN s.amount ELSE 0 END) AS yes_tokens,
    SUM(CASE WHEN s.outcome_type = 'no' THEN s.amount ELSE 0 END) AS no_tokens,
    MAX(s.average_price) AS average_price,
    MAX(s.updated_at) AS last_updated
FROM stakes s
JOIN markets m ON m.id = s.market_id
GROUP BY 
    s.user_id, 
    s.market_id, 
    m.title, 
    m.status,
    m.current_yes_price,
    m.current_no_price,
    m.final_yes_price,
    m.final_no_price,
    m.can_redeem,
    m.is_randomly_terminated,
    m.solana_market_account,
    m.market_usdc_vault,
    m.winning_outcome,
    m.settled_at;

-- Redeemable positions view (for redemption panel)
CREATE OR REPLACE VIEW redeemable_positions AS
SELECT 
    ups.user_id,
    ups.market_id,
    ups.market_address,
    ups.market_title,
    ups.yes_tokens,
    ups.no_tokens,
    ups.final_yes_price,
    ups.final_no_price,
    ups.terminated_at,
    ups.is_randomly_terminated,
    ups.can_redeem,
    ups.market_status AS status,
    ups.winning_outcome,
    ups.market_usdc_vault
FROM user_positions_summary ups
WHERE ups.can_redeem = true
    AND (ups.yes_tokens > 0 OR ups.no_tokens > 0);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to check and terminate inactive market
CREATE OR REPLACE FUNCTION check_and_terminate_inactive_market(p_market_id UUID)
RETURNS TABLE(
    should_terminate BOOLEAN,
    termination_reason TEXT,
    days_inactive NUMERIC,
    last_trade_price NUMERIC
) AS $$
DECLARE
    v_market RECORD;
    v_days NUMERIC;
BEGIN
    SELECT * INTO v_market FROM markets WHERE id = p_market_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Market not found'::TEXT, 0::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;
    
    IF v_market.status NOT IN ('active', 'running', 'paused') THEN
        RETURN QUERY SELECT FALSE, 'Market is not active'::TEXT, 0::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;
    
    IF v_market.last_trade_at IS NULL THEN
        RETURN QUERY SELECT FALSE, 'No trades recorded'::TEXT, 0::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;
    
    v_days := EXTRACT(EPOCH FROM (NOW() - v_market.last_trade_at)) / 86400;
    
    IF v_days < 7 THEN
        RETURN QUERY SELECT FALSE, 
            format('Market inactive for %.1f days (7 required)', v_days)::TEXT, 
            v_days, 
            v_market.current_yes_price;
        RETURN;
    END IF;
    
    RETURN QUERY SELECT TRUE, 
        format('Market inactive for %.1f days', v_days)::TEXT, 
        v_days, 
        v_market.current_yes_price;
END;
$$ LANGUAGE plpgsql;

-- Function to increment user terminations
CREATE OR REPLACE FUNCTION increment_user_terminations(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET termination_count = COALESCE(termination_count, 0) + 1,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update timestamps
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stakes_updated_at
    BEFORE UPDATE ON stakes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_balances_updated_at
    BEFORE UPDATE ON user_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Markets are viewable by everyone" ON markets
    FOR SELECT USING (true);

CREATE POLICY "Trades are viewable by everyone" ON trades
    FOR SELECT USING (true);

CREATE POLICY "Comments are viewable by everyone" ON comments
    FOR SELECT USING (is_deleted = false);

CREATE POLICY "Categories are viewable by everyone" ON categories
    FOR SELECT USING (is_active = true);

-- Note: Additional RLS policies should be configured based on your auth setup
-- The service role bypasses RLS, so backend operations work normally

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default platform settings
INSERT INTO platform_settings (key, platform_fee_rate, maker_rebate_rate, creator_incentive_rate, center_taker_fee_rate, extreme_taker_fee_rate)
VALUES ('fee_config', 0.75, 0.20, 0.05, 0.032, 0.002)
ON CONFLICT (key) DO NOTHING;

-- Insert default categories
INSERT INTO categories (name, slug, display_order, name_zh) VALUES
    ('Politics', 'politics', 1, '政治'),
    ('Sports', 'sports', 2, '体育'),
    ('Crypto', 'crypto', 3, '加密货币'),
    ('Finance', 'finance', 4, '金融'),
    ('Entertainment', 'entertainment', 5, '娱乐'),
    ('Science', 'science', 6, '科学'),
    ('Other', 'other', 99, '其他')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE markets IS 'Prediction markets with Solana on-chain integration';
COMMENT ON TABLE orders IS 'Order book entries for CLOB trading';
COMMENT ON TABLE trades IS 'Executed trades from order matching';
COMMENT ON TABLE stakes IS 'User positions (YES/NO token holdings)';
COMMENT ON INDEX idx_markets_inactive_candidates IS 'Optimized index for keeper inactive market queries';
COMMENT ON INDEX idx_orders_active IS 'Optimized index for orderbook queries';
COMMENT ON VIEW tips_unified IS 'Unified view of market and comment tips with user info';
COMMENT ON VIEW user_positions_view IS 'User positions aggregated by market with YES/NO balances';
