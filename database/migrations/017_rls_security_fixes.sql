-- ============================================================
-- Migration: 015_rls_security_fixes.sql
-- Description: Fix RLS policies for sensitive tables
-- Date: 2026-01-20
-- ============================================================

-- ============================================
-- SECURITY FIX: Restrict order_fills INSERT policy
-- Previously: Anyone could insert (WITH CHECK (true))
-- Now: Only service role can insert (backend server)
-- ============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert order fills" ON public.order_fills;

-- Create a more restrictive policy that only allows service role
-- In Supabase, service_role bypasses RLS, so we deny all client inserts
CREATE POLICY "Only service role can insert order fills" ON public.order_fills
    FOR INSERT
    WITH CHECK (false);  -- Clients cannot insert; service_role bypasses RLS

-- ============================================
-- SECURITY FIX: Restrict trades INSERT policy
-- ============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert trades" ON public.trades;

-- Create a more restrictive policy
CREATE POLICY "Only service role can insert trades" ON public.trades
    FOR INSERT
    WITH CHECK (false);  -- Clients cannot insert; service_role bypasses RLS

-- ============================================
-- SECURITY FIX: Restrict pending_settlements access
-- ============================================

-- Enable RLS if not already enabled
ALTER TABLE public.pending_settlements ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Anyone can view pending settlements" ON public.pending_settlements;
DROP POLICY IF EXISTS "Anyone can insert pending settlements" ON public.pending_settlements;

-- Only allow service role to read/write pending_settlements
CREATE POLICY "Only service role can access pending settlements" ON public.pending_settlements
    FOR ALL
    USING (false)
    WITH CHECK (false);  -- Service role bypasses RLS

-- ============================================
-- SECURITY FIX: Restrict platform_settings access
-- ============================================

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read for fee config (needed by frontend)
CREATE POLICY "Platform settings are viewable by everyone" ON public.platform_settings
    FOR SELECT
    USING (true);

-- Only service role can modify
CREATE POLICY "Only service role can modify platform settings" ON public.platform_settings
    FOR INSERT
    WITH CHECK (false);

CREATE POLICY "Only service role can update platform settings" ON public.platform_settings
    FOR UPDATE
    USING (false);

CREATE POLICY "Only service role can delete platform settings" ON public.platform_settings
    FOR DELETE
    USING (false);

-- ============================================
-- SECURITY FIX: Restrict user_balances INSERT policy
-- User balances should only be created/modified by the service
-- ============================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "User balances are viewable by owner" ON public.user_balances;
DROP POLICY IF EXISTS "User balances are updated by owner" ON public.user_balances;

-- Users can only view their own balances
CREATE POLICY "User balances are viewable by owner" ON public.user_balances
    FOR SELECT
    USING (auth.uid()::text = user_id::text);

-- Only service role can insert/update balances
CREATE POLICY "Only service role can insert user balances" ON public.user_balances
    FOR INSERT
    WITH CHECK (false);

CREATE POLICY "Only service role can update user balances" ON public.user_balances
    FOR UPDATE
    USING (false);

-- ============================================
-- SECURITY FIX: Restrict market_stats access
-- ============================================

ALTER TABLE public.market_stats ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Market stats are viewable by everyone" ON public.market_stats
    FOR SELECT
    USING (true);

-- Only service role can modify
CREATE POLICY "Only service role can modify market stats" ON public.market_stats
    FOR INSERT
    WITH CHECK (false);

CREATE POLICY "Only service role can update market stats" ON public.market_stats
    FOR UPDATE
    USING (false);

-- ============================================
-- SECURITY FIX: Restrict inactive_market_candidates access
-- ============================================

ALTER TABLE public.inactive_market_candidates ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Only service role can access inactive candidates" ON public.inactive_market_candidates
    FOR ALL
    USING (false)
    WITH CHECK (false);

-- ============================================
-- Add comments explaining the security model
-- ============================================

COMMENT ON POLICY "Only service role can insert order fills" ON public.order_fills IS
'Security: Prevents client-side insertion of order fills. Service role (backend) bypasses RLS.';

COMMENT ON POLICY "Only service role can insert trades" ON public.trades IS
'Security: Prevents client-side insertion of trades. Service role (backend) bypasses RLS.';

COMMENT ON POLICY "Only service role can access pending settlements" ON public.pending_settlements IS
'Security: Pending settlements contain sensitive settlement queue data. Only backend can access.';

-- ============================================================
-- Migration complete
-- ============================================================

SELECT 'RLS security fixes applied successfully' AS status;
