-- ============================================
-- Catallaxyz Database Indexes Migration
-- AUDIT FIX HIGH-2: Add missing database indexes
-- Version: 002
-- Description: Create performance-critical indexes
-- ============================================

-- ============================================
-- Users Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_magic_issuer ON users(magic_issuer) WHERE magic_issuer IS NOT NULL;

-- ============================================
-- Markets Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_markets_creator ON markets(creator_id);
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_status_created ON markets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_markets_solana_account ON markets(solana_market_account) WHERE solana_market_account IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category) WHERE category IS NOT NULL;

-- Full-text search index for market search
CREATE INDEX IF NOT EXISTS idx_markets_search ON markets 
USING gin(to_tsvector('english', title || ' ' || COALESCE(question, '') || ' ' || COALESCE(description, '')));

-- ============================================
-- Orders Indexes (CRITICAL for CLOB performance)
-- ============================================

-- Main orderbook query index
CREATE INDEX IF NOT EXISTS idx_orders_orderbook ON orders(market_id, outcome_type, side, status) 
WHERE remaining_amount > 0;

-- Price-time priority index for matching
CREATE INDEX IF NOT EXISTS idx_orders_price_priority ON orders(market_id, outcome_type, side, price DESC, created_at ASC) 
WHERE status IN ('open', 'partial') AND remaining_amount > 0;

-- User orders index
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_market ON orders(user_id, market_id, status);

-- Nonce uniqueness (for replay protection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_nonce ON orders(user_id, nonce) 
WHERE nonce IS NOT NULL;

-- Status and timestamps
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ============================================
-- Trades Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_maker ON trades(maker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_taker ON trades(taker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_tx_signature ON trades(transaction_signature) WHERE transaction_signature IS NOT NULL;

-- ============================================
-- Order Fills Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_order_fills_market ON order_fills(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_fills_maker ON order_fills(maker_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_fills_taker ON order_fills(taker_user_id, created_at DESC);

-- ============================================
-- User Balances Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_balances_updated ON user_balances(updated_at DESC);

-- ============================================
-- Pending Settlements Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pending_settlements_status ON pending_settlements(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_pending_settlements_market ON pending_settlements(market_id);
CREATE INDEX IF NOT EXISTS idx_pending_settlements_retry ON pending_settlements(status, retry_count) 
WHERE status IN ('pending', 'failed');

-- ============================================
-- Sync State Indexes
-- ============================================
-- Primary key is sufficient

-- ============================================
-- User Operations Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_operations_user ON user_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_operations_type ON user_operations(operation_type, status);

-- ============================================
-- CLOB API Keys Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_clob_api_keys_user ON clob_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_clob_api_keys_wallet ON clob_api_keys(wallet_address);
CREATE INDEX IF NOT EXISTS idx_clob_api_keys_active ON clob_api_keys(is_active) WHERE is_active = TRUE;

-- ============================================
-- Favorites Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_market ON favorites(market_id);

-- ============================================
-- Notifications Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read, created_at DESC) 
WHERE is_read = FALSE;
