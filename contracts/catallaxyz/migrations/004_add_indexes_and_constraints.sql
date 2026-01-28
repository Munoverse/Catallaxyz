-- AUDIT FIX v2.1: Add missing indexes and constraints
-- MED-19: Nonce unique constraint
-- MED-24: Performance indexes

-- ============================================
-- Unique Constraints
-- ============================================

-- MED-19: Prevent nonce reuse per user (replay attack prevention)
-- This ensures each user can only use a nonce once
ALTER TABLE public.orders 
ADD CONSTRAINT orders_user_nonce_unique 
UNIQUE (user_id, nonce);

-- Prevent duplicate trade signatures
ALTER TABLE public.trades 
ADD CONSTRAINT trades_signature_unique 
UNIQUE (transaction_signature);

-- ============================================
-- Performance Indexes
-- ============================================

-- Orders table indexes for CLOB performance
CREATE INDEX IF NOT EXISTS idx_orders_market_outcome_side_status 
ON public.orders (market_id, outcome_type, side, status) 
WHERE status IN ('open', 'partial');

CREATE INDEX IF NOT EXISTS idx_orders_market_status_remaining 
ON public.orders (market_id, status, remaining_amount) 
WHERE remaining_amount > 0;

CREATE INDEX IF NOT EXISTS idx_orders_user_id 
ON public.orders (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_price_time 
ON public.orders (market_id, outcome_type, side, price, created_at);

-- Trades table indexes
CREATE INDEX IF NOT EXISTS idx_trades_market_id 
ON public.trades (market_id);

CREATE INDEX IF NOT EXISTS idx_trades_maker_user_id 
ON public.trades (maker_user_id);

CREATE INDEX IF NOT EXISTS idx_trades_taker_user_id 
ON public.trades (taker_user_id);

CREATE INDEX IF NOT EXISTS idx_trades_created_at 
ON public.trades (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_slot 
ON public.trades (slot DESC);

-- Markets table indexes
CREATE INDEX IF NOT EXISTS idx_markets_status 
ON public.markets (status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_markets_created_at 
ON public.markets (created_at DESC);

-- Full text search on market title
CREATE INDEX IF NOT EXISTS idx_markets_title_search 
ON public.markets USING gin(to_tsvector('english', title));

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_wallet_address 
ON public.users (wallet_address);

-- ============================================
-- Check Constraints for Data Integrity
-- ============================================

-- Ensure valid order status
ALTER TABLE public.orders 
ADD CONSTRAINT chk_order_status 
CHECK (status IN ('open', 'partial', 'filled', 'cancelled'));

-- Ensure valid outcome type
ALTER TABLE public.orders 
ADD CONSTRAINT chk_order_outcome_type 
CHECK (outcome_type IN ('yes', 'no'));

-- Ensure valid side
ALTER TABLE public.orders 
ADD CONSTRAINT chk_order_side 
CHECK (side IN ('buy', 'sell'));

-- Ensure positive amounts
ALTER TABLE public.orders 
ADD CONSTRAINT chk_order_amounts 
CHECK (amount > 0 AND remaining_amount >= 0 AND filled_amount >= 0);

-- Ensure price is valid (0 to 1 range, stored as decimal)
ALTER TABLE public.orders 
ADD CONSTRAINT chk_order_price 
CHECK (price >= 0 AND price <= 1);

-- Trade amount must be positive
ALTER TABLE public.trades 
ADD CONSTRAINT chk_trade_amount 
CHECK (amount > 0);
