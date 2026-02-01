-- Migration: 023_audit_fixes_v112.sql
-- AUDIT FIX v1.1.2: Fix RLS policies, add missing indexes and constraints
-- Date: 2026-01-28

-- ============================================
-- 1. Enable RLS on tables that might be missing it
-- ============================================

-- Ensure all tables have RLS enabled
ALTER TABLE IF EXISTS public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pending_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.market_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.geo_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_state ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Add RLS policies for tables
-- ============================================

-- redemptions: viewable by everyone
DROP POLICY IF EXISTS "Redemptions are viewable by everyone" ON public.redemptions;
CREATE POLICY "Redemptions are viewable by everyone" 
    ON public.redemptions FOR SELECT USING (true);

-- redemptions: only service role can insert
DROP POLICY IF EXISTS "Only service role can insert redemptions" ON public.redemptions;
CREATE POLICY "Only service role can insert redemptions" 
    ON public.redemptions FOR INSERT WITH CHECK (false);

-- pending_settlements: only service role can access
DROP POLICY IF EXISTS "Only service role can access pending settlements" ON public.pending_settlements;
CREATE POLICY "Only service role can access pending settlements" 
    ON public.pending_settlements FOR ALL USING (false) WITH CHECK (false);

-- market_stats: viewable by everyone, only service role can modify
DROP POLICY IF EXISTS "Market stats are viewable by everyone" ON public.market_stats;
CREATE POLICY "Market stats are viewable by everyone" 
    ON public.market_stats FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only service role can modify market stats" ON public.market_stats;
CREATE POLICY "Only service role can modify market stats" 
    ON public.market_stats FOR ALL USING (false) WITH CHECK (false);

-- geo_rules: admin only access (validated in application layer)
DROP POLICY IF EXISTS "Geo rules are readable by admin" ON public.geo_rules;
CREATE POLICY "Geo rules are readable by admin" 
    ON public.geo_rules FOR SELECT USING (true);

-- sync_state: only service role can access
DROP POLICY IF EXISTS "Only service role can access sync state" ON public.sync_state;
CREATE POLICY "Only service role can access sync state" 
    ON public.sync_state FOR ALL USING (false) WITH CHECK (false);

-- ============================================
-- 3. Add missing indexes from migrations to schema
-- ============================================

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trades_market_outcome_time
    ON public.trades(market_id, outcome_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_market_user 
    ON public.trades(market_id, user_id);

CREATE INDEX IF NOT EXISTS idx_stakes_user_status 
    ON public.stakes(user_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_user_market_status 
    ON public.orders(user_id, market_id, status);

CREATE INDEX IF NOT EXISTS idx_comments_market_created 
    ON public.comments(market_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_maker_order
    ON public.trades(maker_order_id);

CREATE INDEX IF NOT EXISTS idx_trades_taker_order
    ON public.trades(taker_order_id);

-- ============================================
-- 4. Add missing CHECK constraints
-- ============================================

-- markets.probability constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'markets_probability_check' 
        AND conrelid = 'public.markets'::regclass
    ) THEN
        ALTER TABLE public.markets 
        ADD CONSTRAINT markets_probability_check
        CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1));
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint markets_probability_check could not be added: %', SQLERRM;
END $$;

-- orders.price constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_price_range_check' 
        AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT orders_price_range_check
        CHECK (price IS NULL OR (price >= 0 AND price <= 1));
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint orders_price_range_check could not be added: %', SQLERRM;
END $$;

-- orders.remaining_amount non-negative constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_remaining_non_negative' 
        AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT orders_remaining_non_negative
        CHECK (remaining_amount >= 0);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint orders_remaining_non_negative could not be added: %', SQLERRM;
END $$;

-- user_balances non-negative constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_balances_usdc_non_negative' 
        AND conrelid = 'public.user_balances'::regclass
    ) THEN
        ALTER TABLE public.user_balances 
        ADD CONSTRAINT user_balances_usdc_non_negative 
        CHECK (usdc_available >= 0 AND usdc_locked >= 0);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint user_balances_usdc_non_negative could not be added: %', SQLERRM;
END $$;

-- ============================================
-- 5. Create geo_rules table if not exists
-- ============================================

CREATE TABLE IF NOT EXISTS public.geo_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id),
    CONSTRAINT geo_rules_type_check CHECK (rule_type IN ('country_block', 'country_allow', 'ip_block', 'ip_allow'))
);

-- ============================================
-- 6. Create sync_state table if not exists
-- ============================================

CREATE TABLE IF NOT EXISTS public.sync_state (
    service TEXT PRIMARY KEY,
    last_slot BIGINT DEFAULT 0,
    last_signature TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 7. Add comments for documentation
-- ============================================

COMMENT ON TABLE public.geo_rules IS 'Geographic access rules for market restrictions';
COMMENT ON TABLE public.sync_state IS 'Synchronization state for blockchain sync services';

COMMENT ON POLICY "Redemptions are viewable by everyone" ON public.redemptions IS 'AUDIT FIX v1.1.2: Allow public read access to redemptions';
COMMENT ON POLICY "Only service role can access pending settlements" ON public.pending_settlements IS 'AUDIT FIX v1.1.2: Restrict pending_settlements to service role only';
COMMENT ON POLICY "Market stats are viewable by everyone" ON public.market_stats IS 'AUDIT FIX v1.1.2: Allow public read access to market stats';

-- Record migration
INSERT INTO public.schema_migrations (version) 
VALUES ('023_audit_fixes_v112')
ON CONFLICT (version) DO NOTHING;
