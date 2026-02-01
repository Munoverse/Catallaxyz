-- ============================================================
-- Migration: Medium Priority Fixes
-- Date: 2026-01-28
-- Description: Add missing indexes, constraints, and comments
-- ============================================================

-- ============================================================
-- 1. Missing Composite Indexes
-- ============================================================

-- Orders lookup by user and status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_status
    ON public.orders(user_id, status);

-- Orders lookup by market, user, status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_market_user_status
    ON public.orders(market_id, user_id, status);

-- Trades lookup by market and timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_market_created
    ON public.trades(market_id, created_at DESC);

-- Trades lookup by user
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_maker_created
    ON public.trades(maker_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_taker_created
    ON public.trades(taker_id, created_at DESC);

-- Stakes lookup by user and status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stakes_user_status
    ON public.stakes(user_id, status);

-- User balances lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_balances_user
    ON public.user_balances(user_id);

-- ============================================================
-- 2. Missing Constraints
-- ============================================================

-- Orders price and amount constraints (if not exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'orders' AND constraint_name = 'orders_price_positive'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_price_positive CHECK (price > 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'orders' AND constraint_name = 'orders_amount_positive'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_amount_positive CHECK (amount > 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'orders' AND constraint_name = 'orders_remaining_non_negative'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_remaining_non_negative CHECK (remaining_amount >= 0);
    END IF;
END $$;

-- Trades price and amount constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'trades' AND constraint_name = 'trades_price_positive'
    ) THEN
        ALTER TABLE public.trades ADD CONSTRAINT trades_price_positive CHECK (price > 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'trades' AND constraint_name = 'trades_amount_positive'
    ) THEN
        ALTER TABLE public.trades ADD CONSTRAINT trades_amount_positive CHECK (amount > 0);
    END IF;
END $$;

-- User balances non-negative constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'user_balances' AND constraint_name = 'user_balances_usdc_non_negative'
    ) THEN
        ALTER TABLE public.user_balances ADD CONSTRAINT user_balances_usdc_non_negative 
            CHECK (usdc_available >= 0 AND usdc_locked >= 0);
    END IF;
END $$;

-- ============================================================
-- 3. Missing Foreign Keys
-- ============================================================

-- Add foreign key for termination_trade_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'markets' AND constraint_name = 'markets_termination_trade_fk'
    ) THEN
        ALTER TABLE public.markets 
            ADD CONSTRAINT markets_termination_trade_fk 
            FOREIGN KEY (termination_trade_id) 
            REFERENCES public.trades(id) 
            ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN undefined_column THEN
        NULL; -- Column doesn't exist, skip
END $$;

-- ============================================================
-- 4. Sync State Table (for trade sync service)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sync_state (
    service TEXT PRIMARY KEY,
    last_slot BIGINT DEFAULT 0,
    last_signature TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_state_service ON public.sync_state(service);

-- ============================================================
-- 5. Add COMMENT to tables and columns
-- ============================================================

-- Orders table comments
COMMENT ON TABLE public.orders IS 'CLOB limit orders for prediction market trading';
COMMENT ON COLUMN public.orders.price IS 'Order price (0.0 to 1.0)';
COMMENT ON COLUMN public.orders.amount IS 'Original order amount in USDC lamports';
COMMENT ON COLUMN public.orders.remaining_amount IS 'Remaining unfilled amount in USDC lamports';
COMMENT ON COLUMN public.orders.status IS 'Order status: open, partial, filled, cancelled';

-- Trades table comments
COMMENT ON TABLE public.trades IS 'Executed trades from order matching';
COMMENT ON COLUMN public.trades.price IS 'Execution price (0.0 to 1.0)';
COMMENT ON COLUMN public.trades.amount IS 'Trade amount in USDC lamports';
COMMENT ON COLUMN public.trades.transaction_signature IS 'On-chain transaction signature';

-- User balances comments
COMMENT ON TABLE public.user_balances IS 'User balance tracking for CLOB trading';
COMMENT ON COLUMN public.user_balances.usdc_available IS 'Available USDC balance in lamports';
COMMENT ON COLUMN public.user_balances.usdc_locked IS 'USDC locked in open orders in lamports';

-- Sync state comments
COMMENT ON TABLE public.sync_state IS 'State tracking for blockchain sync services';
COMMENT ON COLUMN public.sync_state.last_slot IS 'Last processed Solana slot';
COMMENT ON COLUMN public.sync_state.last_signature IS 'Last processed transaction signature';

-- ============================================================
-- 6. Function Comments
-- ============================================================

COMMENT ON FUNCTION public.calculate_dynamic_taker_fee IS 
    'Calculate dynamic taker fee based on price distance from 0.5 (center)';

COMMENT ON FUNCTION public.lock_funds_for_order IS 
    'Lock user funds when placing a new order';

COMMENT ON FUNCTION public.apply_trade_fill IS 
    'Apply a trade fill to update orders and user balances';

COMMENT ON FUNCTION public.unlock_cancelled_order IS 
    'Unlock funds when an order is cancelled';

COMMENT ON FUNCTION public.update_user_win_rate IS 
    'Recalculate user win rate after market settlement';

-- ============================================================
-- 7. Migration Version Tracking
-- ============================================================

INSERT INTO public.schema_migrations (version) 
VALUES ('021_medium_priority_fixes')
ON CONFLICT (version) DO NOTHING;

SELECT 'Medium priority fixes migration completed!' AS status;
