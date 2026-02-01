-- ============================================
-- Catallaxyz Database Schema Migration
-- AUDIT FIX CRIT-6: Database schema version control
-- Version: 001
-- Description: Create core tables
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    auth_provider TEXT DEFAULT 'wallet',
    magic_issuer TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Markets Table
-- ============================================
CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES users(id),
    title TEXT NOT NULL,
    question TEXT,
    description TEXT,
    category TEXT,
    
    -- Solana addresses
    solana_market_account TEXT UNIQUE,
    switchboard_queue TEXT,
    randomness_account TEXT,
    market_usdc_vault TEXT,
    
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'settled', 'terminated')),
    is_paused BOOLEAN DEFAULT FALSE,
    paused_at TIMESTAMPTZ,
    winning_outcome TEXT CHECK (winning_outcome IN ('yes', 'no')),
    settlement_price NUMERIC(20, 6),
    
    -- Statistics
    total_trades INTEGER DEFAULT 0,
    liquidity NUMERIC(20, 6) DEFAULT 0,
    current_yes_price NUMERIC(20, 6) DEFAULT 0.5,
    current_no_price NUMERIC(20, 6) DEFAULT 0.5,
    last_price NUMERIC(20, 6),
    total_volume NUMERIC(20, 6) DEFAULT 0,
    last_trade_at TIMESTAMPTZ,
    
    -- Termination
    termination_probability INTEGER DEFAULT 1000,
    termination_reason TEXT CHECK (termination_reason IN ('vrf', 'inactivity')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

-- ============================================
-- Orders Table
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id),
    user_id UUID NOT NULL REFERENCES users(id),
    
    -- Order details
    outcome_type TEXT NOT NULL CHECK (outcome_type IN ('yes', 'no')),
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type TEXT NOT NULL CHECK (order_type IN ('limit', 'market')),
    price NUMERIC(20, 6),
    amount NUMERIC(20, 0) NOT NULL,
    filled_amount NUMERIC(20, 0) DEFAULT 0,
    remaining_amount NUMERIC(20, 0),
    
    -- Status
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'partial', 'filled', 'cancelled')),
    
    -- Metadata
    client_order_id TEXT,
    order_hash TEXT,
    signature TEXT,
    nonce BIGINT,
    expires_at TIMESTAMPTZ,
    
    -- Exchange system fields (Polymarket-style)
    signer TEXT,                    -- Wallet address that signed the order
    taker TEXT,                     -- Specific taker address (optional)
    token_id SMALLINT,              -- Token ID: 0=USDC, 1=YES, 2=NO
    fee_rate_bps SMALLINT DEFAULT 0, -- Fee rate in basis points
    expiration BIGINT,              -- Unix timestamp expiration (0 = no expiry)
    on_chain_status TEXT DEFAULT 'unknown', -- On-chain status: unknown, open, partially_filled, filled, cancelled
    
    -- Optimistic locking
    version INTEGER DEFAULT 0,
    
    -- Timestamps
    placed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    filled_at TIMESTAMPTZ
);

-- ============================================
-- Trades Table
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id),
    user_id UUID REFERENCES users(id),
    
    -- Order references
    maker_order_id UUID REFERENCES orders(id),
    taker_order_id UUID REFERENCES orders(id),
    maker_user_id UUID REFERENCES users(id),
    taker_user_id UUID REFERENCES users(id),
    
    -- Trade details
    outcome_type TEXT NOT NULL CHECK (outcome_type IN ('yes', 'no')),
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    amount NUMERIC(20, 0) NOT NULL,
    price NUMERIC(20, 6) NOT NULL,
    total_cost NUMERIC(20, 0),
    
    -- Fees
    platform_fee NUMERIC(20, 0) DEFAULT 0,
    maker_fee NUMERIC(20, 0) DEFAULT 0,
    taker_fee NUMERIC(20, 0) DEFAULT 0,
    creator_fee NUMERIC(20, 0) DEFAULT 0,
    
    -- On-chain reference
    transaction_signature TEXT UNIQUE,
    slot BIGINT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Order Fills Table (individual fill events)
-- ============================================
CREATE TABLE IF NOT EXISTS order_fills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id),
    maker_order_id UUID REFERENCES orders(id),
    taker_order_id UUID REFERENCES orders(id),
    maker_user_id UUID REFERENCES users(id),
    taker_user_id UUID REFERENCES users(id),
    
    outcome_type TEXT NOT NULL,
    side TEXT NOT NULL,
    price NUMERIC(20, 6) NOT NULL,
    size NUMERIC(20, 0) NOT NULL,
    total_cost NUMERIC(20, 0),
    maker_fee NUMERIC(20, 0) DEFAULT 0,
    taker_fee NUMERIC(20, 0) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- User Balances Table (CLOB balances snapshot)
-- ============================================
CREATE TABLE IF NOT EXISTS user_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
    
    usdc_available NUMERIC(20, 0) DEFAULT 0,
    usdc_locked NUMERIC(20, 0) DEFAULT 0,
    yes_available NUMERIC(20, 0) DEFAULT 0,
    yes_locked NUMERIC(20, 0) DEFAULT 0,
    no_available NUMERIC(20, 0) DEFAULT 0,
    no_locked NUMERIC(20, 0) DEFAULT 0,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Pending Settlements Table (DEPRECATED - use exchange_order_fills for new orders)
-- Kept for backward compatibility with old settlement system
-- ============================================
CREATE TABLE IF NOT EXISTS pending_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID NOT NULL REFERENCES markets(id),
    fill_id UUID REFERENCES order_fills(id),
    
    maker_wallet TEXT NOT NULL,
    taker_wallet TEXT NOT NULL,
    outcome_type TEXT NOT NULL,
    side TEXT NOT NULL,
    size NUMERIC(20, 0) NOT NULL,
    price NUMERIC(20, 0) NOT NULL,
    
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
    signature TEXT,
    tx_signature TEXT,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    
    submitted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Exchange Order Fills Table (Polymarket-style atomic swaps)
-- Records fills from the new exchange system with user-signed orders
-- ============================================
CREATE TABLE IF NOT EXISTS exchange_order_fills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Order references (using order hashes from signed orders)
    taker_order_hash TEXT NOT NULL,
    maker_order_hash TEXT NOT NULL,
    
    -- Market
    market_id UUID NOT NULL REFERENCES markets(id),
    
    -- Participants
    taker_user_id UUID REFERENCES users(id),
    maker_user_id UUID REFERENCES users(id),
    taker_wallet TEXT NOT NULL,
    maker_wallet TEXT NOT NULL,
    
    -- Fill details
    match_type TEXT NOT NULL CHECK (match_type IN ('complementary', 'mint', 'merge')),
    taker_fill_amount NUMERIC(20, 0) NOT NULL,
    maker_fill_amount NUMERIC(20, 0) NOT NULL,
    taker_asset_id SMALLINT NOT NULL,  -- 0=USDC, 1=YES, 2=NO
    maker_asset_id SMALLINT NOT NULL,
    fee NUMERIC(20, 0) DEFAULT 0,
    
    -- On-chain data
    transaction_signature TEXT,
    slot BIGINT,
    block_time TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- User Nonces Table (for exchange order system)
-- Tracks user nonces for preventing replay attacks
-- ============================================
CREATE TABLE IF NOT EXISTS user_nonces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    wallet_address TEXT NOT NULL,
    current_nonce BIGINT NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_wallet_nonce UNIQUE (user_id, wallet_address)
);

-- ============================================
-- Sync State Table
-- ============================================
CREATE TABLE IF NOT EXISTS sync_state (
    service TEXT PRIMARY KEY,
    last_slot BIGINT,
    last_signature TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- User Operations Table (deposits/withdrawals history)
-- ============================================
CREATE TABLE IF NOT EXISTS user_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    market_id UUID REFERENCES markets(id),
    
    operation_type TEXT NOT NULL CHECK (operation_type IN ('deposit', 'withdraw', 'split', 'merge')),
    amount NUMERIC(20, 0) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    tx_signature TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CLOB API Keys Table
-- ============================================
CREATE TABLE IF NOT EXISTS clob_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    wallet_address TEXT NOT NULL,
    
    api_key TEXT UNIQUE NOT NULL,
    passphrase_hash TEXT NOT NULL,
    secret_encrypted TEXT NOT NULL,
    
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Favorites Table
-- ============================================
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    market_id UUID NOT NULL REFERENCES markets(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, market_id)
);

-- ============================================
-- Notifications Table
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    market_id UUID REFERENCES markets(id),
    trade_id UUID REFERENCES trades(id),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
