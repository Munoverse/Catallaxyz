-- ============================================================
-- Migration: 019_audit_fixes.sql
-- Description: Fix issues identified in v1.0.0 code audit
-- Date: 2026-01-28
-- ============================================================

-- ============================================
-- 1. Add missing composite indexes for common query patterns
-- ============================================

-- Speed up user's trades in a market queries
CREATE INDEX IF NOT EXISTS idx_trades_market_user 
    ON public.trades(market_id, user_id);

-- Speed up user's active positions queries
CREATE INDEX IF NOT EXISTS idx_stakes_user_status 
    ON public.stakes(user_id, status);

-- Speed up user's orders in a market queries
CREATE INDEX IF NOT EXISTS idx_orders_user_market_status 
    ON public.orders(user_id, market_id, status);

-- Speed up market comment feed queries
CREATE INDEX IF NOT EXISTS idx_comments_market_created 
    ON public.comments(market_id, created_at DESC);

-- Speed up order fill lookups
CREATE INDEX IF NOT EXISTS idx_trades_maker_order 
    ON public.trades(maker_order_id);
CREATE INDEX IF NOT EXISTS idx_trades_taker_order 
    ON public.trades(taker_order_id);

-- Speed up user rewards lookup
CREATE INDEX IF NOT EXISTS idx_liquidity_scores_user_market 
    ON public.liquidity_scores(user_id, market_id);

-- ============================================
-- 2. Enable RLS on liquidity tables
-- ============================================

-- liquidity_snapshots - public read, service_role only write
ALTER TABLE public.liquidity_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Liquidity snapshots are viewable by everyone" ON public.liquidity_snapshots;
CREATE POLICY "Liquidity snapshots are viewable by everyone" 
    ON public.liquidity_snapshots FOR SELECT USING (true);
CREATE POLICY "Liquidity snapshots insert denied for clients" 
    ON public.liquidity_snapshots FOR INSERT WITH CHECK (false);
CREATE POLICY "Liquidity snapshots update denied for clients" 
    ON public.liquidity_snapshots FOR UPDATE USING (false);
CREATE POLICY "Liquidity snapshots delete denied for clients" 
    ON public.liquidity_snapshots FOR DELETE USING (false);

-- liquidity_scores - public read, service_role only write
ALTER TABLE public.liquidity_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Liquidity scores are viewable by everyone" ON public.liquidity_scores;
CREATE POLICY "Liquidity scores are viewable by everyone" 
    ON public.liquidity_scores FOR SELECT USING (true);
CREATE POLICY "Liquidity scores insert denied for clients" 
    ON public.liquidity_scores FOR INSERT WITH CHECK (false);
CREATE POLICY "Liquidity scores update denied for clients" 
    ON public.liquidity_scores FOR UPDATE USING (false);
CREATE POLICY "Liquidity scores delete denied for clients" 
    ON public.liquidity_scores FOR DELETE USING (false);

-- liquidity_score_state - users can view own state, service_role only write
ALTER TABLE public.liquidity_score_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own liquidity state" ON public.liquidity_score_state;
CREATE POLICY "Users can view own liquidity state" 
    ON public.liquidity_score_state FOR SELECT 
    USING (auth.uid()::text = user_id::text);
CREATE POLICY "Liquidity state insert denied for clients" 
    ON public.liquidity_score_state FOR INSERT WITH CHECK (false);
CREATE POLICY "Liquidity state update denied for clients" 
    ON public.liquidity_score_state FOR UPDATE USING (false);
CREATE POLICY "Liquidity state delete denied for clients" 
    ON public.liquidity_score_state FOR DELETE USING (false);

-- ============================================
-- 3. Add missing constraints
-- ============================================

-- Add CHECK constraint for probability range (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'markets_probability_check' 
        AND conrelid = 'public.markets'::regclass
    ) THEN
        ALTER TABLE public.markets ADD CONSTRAINT markets_probability_check
            CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1));
    END IF;
END $$;

-- Add CHECK constraint for order price range
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_price_check' 
        AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_price_check
            CHECK (price >= 0 AND price <= 1);
    END IF;
END $$;

-- Add CHECK constraint for positive order amount
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_amount_check' 
        AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_amount_check
            CHECK (amount > 0);
    END IF;
END $$;

-- ============================================
-- 4. Fix liquidity_rewards RLS policy conflict
-- ============================================

-- Remove conflicting policies (one allows all, one restricts to owner)
DROP POLICY IF EXISTS "Liquidity rewards are viewable by everyone" ON public.liquidity_rewards;
DROP POLICY IF EXISTS "Users can view own liquidity rewards" ON public.liquidity_rewards;

-- Keep only the public read policy
CREATE POLICY "Liquidity rewards are viewable by everyone" 
    ON public.liquidity_rewards FOR SELECT USING (true);
