-- ============================================================
-- Catallaxyz database migration script (combined)
-- Includes improvements, cleanup, and new features
-- Date: 2026-01-09
-- Note: excludes leverage/margin/insurance fund features
-- ============================================================

-- ============================================================
-- Part 1: database improvements and new features
-- ============================================================

-- ============================================================
-- 1. Update category/tag system
-- ============================================================

-- Create category enum type
DO $$ BEGIN
    CREATE TYPE market_category AS ENUM (
        'wealth',              -- Wealth
        'physical_health',     -- Physical health
        'mental_health',       -- Mental health
        'family_friends',      -- Family and friends
        'happiness',           -- Happiness
        'self_growth',         -- Self growth
        'career_achievement',  -- Career and achievement
        'relationships',       -- Relationships
        'luck',               -- Luck
        'macro_vision'        -- Macro vision
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update markets.category type if needed
-- Keep TEXT for compatibility but add constraint
ALTER TABLE public.markets DROP CONSTRAINT IF EXISTS markets_category_check;
ALTER TABLE public.markets ADD CONSTRAINT markets_category_check 
    CHECK (category IN (
        'wealth', 'physical_health', 'mental_health', 'family_friends', 
        'happiness', 'self_growth', 'career_achievement', 'relationships', 
        'luck', 'macro_vision'
    ));

-- ============================================================
-- 2. Update market type system - add random termination
-- ============================================================

-- Ensure Switchboard randomness fields exist for per-market VRF
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS switchboard_queue TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS randomness_account TEXT;

-- Add random termination fields to markets
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS random_termination_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS termination_probability NUMERIC(10, 6) DEFAULT 0.001; -- 0.1%
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS is_randomly_terminated BOOLEAN DEFAULT false;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS termination_triggered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS termination_trade_id UUID REFERENCES public.trades(id);
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS final_yes_price NUMERIC(10, 6);
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS final_no_price NUMERIC(10, 6);
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS can_redeem BOOLEAN DEFAULT false;
-- VRF uniqueness counter for termination checks
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS trade_nonce BIGINT DEFAULT 0;

-- Column comments
COMMENT ON COLUMN public.markets.random_termination_enabled IS 'Enable random termination';
COMMENT ON COLUMN public.markets.termination_probability IS 'Termination probability per trade (default 0.001 = 0.1%)';
COMMENT ON COLUMN public.markets.is_randomly_terminated IS 'Whether market has been randomly terminated';
COMMENT ON COLUMN public.markets.termination_triggered_at IS 'Termination timestamp';
COMMENT ON COLUMN public.markets.termination_trade_id IS 'Trade ID that triggered termination';
COMMENT ON COLUMN public.markets.final_yes_price IS 'Final YES price at termination';
COMMENT ON COLUMN public.markets.final_no_price IS 'Final NO price at termination';
COMMENT ON COLUMN public.markets.can_redeem IS 'Whether redemption is allowed';
COMMENT ON COLUMN public.markets.trade_nonce IS 'VRF uniqueness counter for termination checks';

-- ============================================================
-- 3. Update users: require username and add verification
-- ============================================================

-- Username required (kept nullable for backward compatibility)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username_required BOOLEAN DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- 3.1 Magic embedded wallet fields
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS embedded_wallet_address TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS external_wallet_address TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS magic_user_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'wallet';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS oauth_provider TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_magic_user_id ON public.users(magic_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_embedded_wallet ON public.users(embedded_wallet_address);

-- ============================================================
-- 4. Trading fee improvements - taker only
-- ============================================================

-- Add dynamic fee fields (aligned with on-chain)
-- Contract rates: center=3.2% (50% price), extreme=0.2% (0%/100% price)
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS center_taker_fee_rate NUMERIC(10, 6) DEFAULT 0.032; -- Center rate 3.2% (50% price, max)
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS extreme_taker_fee_rate NUMERIC(10, 6) DEFAULT 0.002; -- Extreme rate 0.2% (0%/100% price, min)
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS maker_rebate_rate NUMERIC(10, 6) DEFAULT 0.2; -- Maker rebate share (default 20%)

-- ============================================================
-- 5. Add redemptions table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
    
    -- Redemption info
    redemption_type TEXT NOT NULL, -- 'merge', 'single_outcome'
    
    -- Token info
    yes_tokens_burned BIGINT DEFAULT 0,
    no_tokens_burned BIGINT DEFAULT 0,
    usdc_redeemed BIGINT NOT NULL, -- Redeemed USDC amount
    
    -- Price info
    yes_price NUMERIC(10, 6),
    no_price NUMERIC(10, 6),
    
    -- On-chain metadata
    transaction_signature TEXT UNIQUE,
    slot BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT redemptions_type_check CHECK (redemption_type IN ('merge', 'single_outcome'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON public.redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_market ON public.redemptions(market_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_created ON public.redemptions(created_at DESC);

-- ============================================================
-- 5.1 Add notifications table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    
    type TEXT NOT NULL, -- 'trade', 'settlement', 'comment', 'mention', 'system'
    title TEXT NOT NULL,
    message TEXT,
    
    -- Related entities
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT notifications_type_check CHECK (type IN ('trade', 'settlement', 'comment', 'mention', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- ============================================================
-- 6. Update orders table for VRF fees
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vrf_fee_prepaid BIGINT DEFAULT 0; -- VRF prepaid fee
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vrf_fee_refunded BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vrf_fee_refund_amount BIGINT DEFAULT 0;

COMMENT ON COLUMN public.orders.vrf_fee_prepaid IS 'Switchboard VRF prepaid fee (refunded if order not filled)';

-- ============================================================
-- 7. Update randomness_requests table
-- ============================================================

ALTER TABLE public.randomness_requests ADD COLUMN IF NOT EXISTS trade_id UUID REFERENCES public.trades(id);
ALTER TABLE public.randomness_requests ADD COLUMN IF NOT EXISTS vrf_fee_amount BIGINT DEFAULT 0;

COMMENT ON COLUMN public.randomness_requests.trade_id IS 'Trade ID that triggered VRF check';
COMMENT ON COLUMN public.randomness_requests.vrf_fee_amount IS 'VRF fee amount';

-- ============================================================
-- 8. Add helper functions
-- ============================================================

-- Calculate dynamic taker fee rate (aligned with on-chain logic)
-- Contract logic: highest at 50% (3.2%), lowest at extremes (0.2%)
-- Formula: fee = center_fee - (center_fee - extreme_fee) × (distance_from_center / 0.5)
CREATE OR REPLACE FUNCTION calculate_taker_fee_rate(
    p_probability NUMERIC,
    p_center_rate NUMERIC DEFAULT 0.032,  -- 3.2% at 50%
    p_extreme_rate NUMERIC DEFAULT 0.002  -- 0.2% at extremes
)
RETURNS NUMERIC AS $$
DECLARE
    distance_from_center NUMERIC;
    rate_range NUMERIC;
    fee_reduction NUMERIC;
    fee_rate NUMERIC;
BEGIN
    -- Distance from center (50%)
    distance_from_center := ABS(p_probability - 0.5);
    
    -- Rate range
    rate_range := p_center_rate - p_extreme_rate;
    
    -- Fee reduction (greater distance lowers the rate)
    -- At center (distance=0): fee = center_rate (3.2%)
    -- At extreme (distance=0.5): fee = extreme_rate (0.2%)
    fee_reduction := rate_range * (distance_from_center / 0.5);
    
    fee_rate := p_center_rate - fee_reduction;
    
    -- Clamp to valid range
    RETURN GREATEST(LEAST(fee_rate, p_center_rate), p_extreme_rate);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_taker_fee_rate(NUMERIC, NUMERIC, NUMERIC) IS
'Dynamic taker fee rate (aligned with on-chain): highest at 50% (3.2%), lowest at extremes (0.2%)';

-- ============================================================
-- 9. Update RLS policies
-- ============================================================

-- Redemptions
-- Note: Using public read policy since redemptions are public data
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "Redemptions are viewable by everyone" ON public.redemptions;
-- Only keep one SELECT policy to avoid conflicts
CREATE POLICY "Redemptions are viewable by everyone" ON public.redemptions FOR SELECT USING (true);

-- Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notifications are viewable by owner" ON public.notifications;
DROP POLICY IF EXISTS "Notifications are insertable by service" ON public.notifications;
DROP POLICY IF EXISTS "Notifications are updatable by owner" ON public.notifications;
CREATE POLICY "Notifications are viewable by owner" ON public.notifications
    FOR SELECT USING (auth.uid()::text = user_id::text);
-- Note: Service role bypasses RLS, so this policy controls anon/authenticated access
-- Setting WITH CHECK (false) to prevent client-side inserts, service_role can still insert
CREATE POLICY "Notifications insert denied for clients" ON public.notifications
    FOR INSERT WITH CHECK (false);
CREATE POLICY "Notifications are updatable by owner" ON public.notifications
    FOR UPDATE USING (auth.uid()::text = user_id::text);

-- ============================================================
-- 10. Create views
-- ============================================================

-- Market termination status view (materialized for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS market_termination_status AS
SELECT 
    m.id as market_id,
    m.title,
    m.status,
    m.random_termination_enabled,
    m.termination_probability,
    m.is_randomly_terminated,
    m.termination_triggered_at,
    m.final_yes_price,
    m.final_no_price,
    m.can_redeem,
    t.id as termination_trade_id,
    t.taker_user_id as catallaxyz_user_id,
    u.username as catallaxyz_username,
    rr.randomness_value,
    rr.settlement_outcome,
    COUNT(DISTINCT red.id) as redemptions_count,
    SUM(red.usdc_redeemed) as total_redeemed
FROM public.markets m
LEFT JOIN public.trades t ON m.termination_trade_id = t.id
LEFT JOIN public.users u ON t.taker_user_id = u.id
LEFT JOIN public.randomness_requests rr ON rr.market_id = m.id AND rr.is_triggered = true
LEFT JOIN public.redemptions red ON red.market_id = m.id
WHERE m.is_randomly_terminated = true
GROUP BY m.id, m.title, m.status, m.random_termination_enabled, 
         m.termination_probability, m.is_randomly_terminated, 
         m.termination_triggered_at, m.final_yes_price, m.final_no_price,
         m.can_redeem, t.id, t.taker_user_id, u.username, 
         rr.randomness_value, rr.settlement_outcome;

-- Indexes for query performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_termination_market_id 
ON market_termination_status(market_id);

COMMENT ON MATERIALIZED VIEW market_termination_status IS
'Market termination status (materialized view) - refresh hourly';

-- ============================================================
-- Part 2: auto-terminate inactive markets (7 days without trades)
-- ============================================================

-- 1. Add 'terminated' status to markets table
ALTER TABLE public.markets 
DROP CONSTRAINT IF EXISTS markets_status_check;

ALTER TABLE public.markets 
ADD CONSTRAINT markets_status_check 
CHECK (status IN ('active', 'paused', 'running', 'settled', 'closed', 'cancelled', 'terminated'));

-- 2. Create inactivity termination check function
CREATE OR REPLACE FUNCTION check_and_terminate_inactive_market(p_market_id UUID)
RETURNS TABLE (
    should_terminate BOOLEAN,
    days_inactive NUMERIC,
    last_trade_price NUMERIC,
    termination_reason TEXT
) AS $$
DECLARE
    v_last_trade_time TIMESTAMP WITH TIME ZONE;
    v_days_since_last_trade NUMERIC;
    v_market_status TEXT;
    v_last_price NUMERIC;
BEGIN
    -- Load market data
    SELECT 
        m.last_trade_at,
        m.status,
        m.last_price
    INTO 
        v_last_trade_time,
        v_market_status,
        v_last_price
    FROM public.markets m
    WHERE m.id = p_market_id;
    
    -- Market not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'Market not found'::TEXT;
        RETURN;
    END IF;
    
    -- Skip if already settled or closed
    IF v_market_status IN ('settled', 'closed', 'cancelled', 'terminated') THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC, v_last_price, 'Market already terminated'::TEXT;
        RETURN;
    END IF;
    
    -- Skip if no trades yet
    IF v_last_trade_time IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::NUMERIC, NULL::NUMERIC, 'No trades yet'::TEXT;
        RETURN;
    END IF;
    
    -- Days since last trade
    v_days_since_last_trade := EXTRACT(EPOCH FROM (NOW() - v_last_trade_time)) / 86400;
    
    -- Terminate after 7 days of inactivity (aligned with INACTIVITY_TIMEOUT_SECONDS)
    IF v_days_since_last_trade >= 7 THEN
        -- Update market status to terminated
        UPDATE public.markets
        SET 
            status = 'terminated',
            updated_at = NOW()
        WHERE id = p_market_id;
        
        RETURN QUERY SELECT 
            TRUE, 
            v_days_since_last_trade, 
            COALESCE(v_last_price, 0.5), 
            'Market terminated due to 7 days of inactivity'::TEXT;
    ELSE
        RETURN QUERY SELECT 
            FALSE, 
            v_days_since_last_trade, 
            v_last_price, 
            format('Market still active (%s days since last trade)', ROUND(v_days_since_last_trade, 1))::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_and_terminate_inactive_market(UUID) IS
'Auto-terminate after 7 days without trades (aligned with on-chain), redeem at last price';

-- 3. Batch termination function (for scheduled jobs)
CREATE OR REPLACE FUNCTION terminate_all_inactive_markets()
RETURNS TABLE (
    market_id UUID,
    market_title TEXT,
    terminated BOOLEAN,
    days_inactive NUMERIC,
    last_price NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH market_checks AS (
        SELECT 
            m.id,
            m.title,
            (check_and_terminate_inactive_market(m.id)).*
        FROM public.markets m
        WHERE m.status IN ('active', 'running', 'paused')
    )
    SELECT 
        mc.id,
        mc.title,
        mc.should_terminate,
        mc.days_inactive,
        mc.last_trade_price
    FROM market_checks mc
    WHERE mc.should_terminate = TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION terminate_all_inactive_markets() IS
'Batch-terminate active markets inactive for 7 days (aligned with on-chain)';

-- ============================================================
-- 4. Admin view: inactive market candidates (N days)
-- ============================================================
ALTER TABLE public.markets
    ADD COLUMN IF NOT EXISTS market_usdc_vault TEXT;
CREATE TABLE IF NOT EXISTS public.inactive_market_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID UNIQUE REFERENCES public.markets(id) ON DELETE CASCADE,
    market_title TEXT,
    solana_market_account TEXT,
    market_usdc_vault TEXT,
    market_created_at TIMESTAMP WITH TIME ZONE,
    total_volume BIGINT DEFAULT 0,
    category TEXT,
    last_trade_at TIMESTAMP WITH TIME ZONE,
    days_inactive INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    reason TEXT,
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.inactive_market_candidates
    ADD COLUMN IF NOT EXISTS market_usdc_vault TEXT,
    ADD COLUMN IF NOT EXISTS market_created_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS total_volume BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_inactive_market_candidates_days
    ON public.inactive_market_candidates(days_inactive DESC);

CREATE OR REPLACE FUNCTION refresh_inactive_market_candidates(p_inactivity_days INTEGER)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.inactive_market_candidates;

    INSERT INTO public.inactive_market_candidates (
        market_id,
        market_title,
        solana_market_account,
        market_usdc_vault,
        market_created_at,
        total_volume,
        category,
        last_trade_at,
        days_inactive,
        status,
        reason,
        snapshot_at
    )
    SELECT
        m.id,
        m.title,
        m.solana_market_account,
        m.market_usdc_vault,
        m.created_at,
        COALESCE(m.total_volume, 0),
        m.category,
        m.last_trade_at,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - m.last_trade_at)) / 86400)::INTEGER AS days_inactive,
        m.status,
        format('Inactive for %s day(s)', p_inactivity_days),
        NOW()
    FROM public.markets m
    WHERE m.status IN ('active', 'running', 'paused')
      AND m.last_trade_at IS NOT NULL
      AND m.last_trade_at < NOW() - (p_inactivity_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- 4. Notes on redemption mechanism
COMMENT ON COLUMN public.markets.last_price IS 'Last trade price used for post-termination redemption';
COMMENT ON COLUMN public.markets.status IS 'Market status: active, paused, running, settled, closed, cancelled, terminated (7d inactivity)';

-- ============================================
-- 11. Auto-refresh materialized views (performance)
-- ============================================

-- Enable pg_cron if supported
-- Note: Supabase free tier may not support pg_cron; use manual refresh or Edge Functions
DO $$
BEGIN
    -- Create refresh function
    CREATE OR REPLACE FUNCTION refresh_materialized_views()
    RETURNS void AS $func$
    BEGIN
        -- Refresh concurrently (no table lock)
        REFRESH MATERIALIZED VIEW CONCURRENTLY market_termination_status;
        
        RAISE NOTICE 'Materialized views refreshed successfully at %', NOW();
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to refresh materialized views: %', SQLERRM;
    END;
    $func$ LANGUAGE plpgsql;
    
    -- Comment
    COMMENT ON FUNCTION refresh_materialized_views() IS 
    'Refresh all materialized views - run hourly or after data updates';
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create refresh function: %', SQLERRM;
END $$;

-- If pg_cron is available, uncomment to enable auto-refresh
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'refresh-materialized-views',
--   '0 * * * *',  -- Run hourly
--   'SELECT refresh_materialized_views();'
-- );

-- ============================================================
-- 12. Liquidity rewards (Polymarket-style)
-- ============================================================

-- Market-level reward parameters
ALTER TABLE public.markets
ADD COLUMN IF NOT EXISTS max_incentive_spread NUMERIC(10, 6) DEFAULT 0.030, -- 3c
ADD COLUMN IF NOT EXISTS min_incentive_size BIGINT DEFAULT 1000000, -- 1 USDC (lamports)
ADD COLUMN IF NOT EXISTS platform_fee_rate NUMERIC(10, 6) DEFAULT 0.75; -- 75%
ALTER TABLE public.markets
ADD COLUMN IF NOT EXISTS creator_incentive_rate NUMERIC(10, 6) DEFAULT 0.05; -- 5%

COMMENT ON COLUMN public.markets.max_incentive_spread IS 'Max incentive spread threshold (e.g. 0.03 = 3c)';
COMMENT ON COLUMN public.markets.min_incentive_size IS 'Min order size for incentives (USDC lamports)';
COMMENT ON COLUMN public.markets.platform_fee_rate IS 'Platform fee share (0-1)';

-- ============================================================
-- 13. Platform global fee config
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    platform_fee_rate NUMERIC(10, 6) NOT NULL DEFAULT 0.75,
    maker_rebate_rate NUMERIC(10, 6) NOT NULL DEFAULT 0.2,
    creator_incentive_rate NUMERIC(10, 6) NOT NULL DEFAULT 0.05,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS creator_incentive_rate NUMERIC(10, 6) DEFAULT 0.05;

-- Singleton config row
INSERT INTO public.platform_settings (key)
VALUES ('fee_config')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Platform settings are viewable by everyone" ON public.platform_settings;
CREATE POLICY "Platform settings are viewable by everyone"
ON public.platform_settings FOR SELECT USING (true);

-- Orderbook snapshots (per-minute sampling)
CREATE TABLE IF NOT EXISTS public.liquidity_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
    sampled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    midpoint NUMERIC(10, 6) NOT NULL,
    max_spread NUMERIC(10, 6) NOT NULL,
    min_size BIGINT NOT NULL,
    best_bid_yes NUMERIC(10, 6),
    best_ask_yes NUMERIC(10, 6),
    best_bid_no NUMERIC(10, 6),
    best_ask_no NUMERIC(10, 6)
);

CREATE INDEX IF NOT EXISTS idx_liquidity_snapshots_market_time
ON public.liquidity_snapshots(market_id, sampled_at DESC);

-- Maker scores per snapshot
CREATE TABLE IF NOT EXISTS public.liquidity_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_id UUID REFERENCES public.liquidity_snapshots(id) ON DELETE CASCADE NOT NULL,
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    q_one NUMERIC(30, 10) DEFAULT 0,
    q_two NUMERIC(30, 10) DEFAULT 0,
    q_min NUMERIC(30, 10) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liquidity_scores_snapshot
ON public.liquidity_scores(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_liquidity_scores_user_time
ON public.liquidity_scores(user_id, created_at DESC);

-- Rolling score state (event-updated)
CREATE TABLE IF NOT EXISTS public.liquidity_score_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    last_q_min NUMERIC(30, 10) DEFAULT 0,
    accumulated_score NUMERIC(30, 10) DEFAULT 0,
    last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    period_start TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(market_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_liquidity_score_state_market
ON public.liquidity_score_state(market_id);

CREATE INDEX IF NOT EXISTS idx_liquidity_score_state_user
ON public.liquidity_score_state(user_id);

-- Daily reward distribution results
CREATE TABLE IF NOT EXISTS public.liquidity_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reward_period DATE NOT NULL,
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    total_reward_pool BIGINT NOT NULL DEFAULT 0,
    total_q_epoch NUMERIC(30, 10) DEFAULT 0,
    reward_share NUMERIC(18, 10) DEFAULT 0,
    reward_amount BIGINT DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, market_id, reward_period),
    CONSTRAINT liquidity_rewards_status_check CHECK (status IN ('pending', 'distributed', 'claimed'))
);

CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_user
ON public.liquidity_rewards(user_id);

CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_period
ON public.liquidity_rewards(reward_period DESC);

-- RLS
ALTER TABLE public.liquidity_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Liquidity rewards are viewable by everyone" ON public.liquidity_rewards;
DROP POLICY IF EXISTS "Users can view own liquidity rewards" ON public.liquidity_rewards;
CREATE POLICY "Liquidity rewards are viewable by everyone" ON public.liquidity_rewards FOR SELECT USING (true);
CREATE POLICY "Users can view own liquidity rewards" ON public.liquidity_rewards FOR SELECT USING (auth.uid()::text = user_id::text);

-- ============================================================
-- User stats extensions and functions
-- ============================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_views BIGINT DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_profile_views(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.users
    SET profile_views = COALESCE(profile_views, 0) + 1
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Update user win rate after stake settlement (sync biggest_win)
CREATE OR REPLACE FUNCTION update_user_win_rate() RETURNS TRIGGER AS $$
DECLARE
    v_total_predictions INTEGER;
    v_correct_predictions INTEGER;
    v_win_rate NUMERIC(5, 2);
    v_total_profit_loss BIGINT;
    v_total_stakes BIGINT;
    v_avg_return NUMERIC(10, 6);
    v_best_win BIGINT;
BEGIN
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE is_correct = true)
    INTO v_total_predictions, v_correct_predictions
    FROM public.stakes
    WHERE user_id = NEW.user_id AND status = 'settled' AND is_correct IS NOT NULL;

    IF v_total_predictions > 0 THEN
        v_win_rate := (v_correct_predictions::NUMERIC / v_total_predictions::NUMERIC) * 100;
    ELSE
        v_win_rate := 0;
    END IF;

    SELECT 
        COALESCE(SUM(realized_pnl), 0),
        COALESCE(SUM(cost_basis), 1),
        COALESCE(MAX(realized_pnl), 0)
    INTO v_total_profit_loss, v_total_stakes, v_best_win
    FROM public.stakes
    WHERE user_id = NEW.user_id AND status = 'settled';

    IF v_total_stakes > 0 THEN
        v_avg_return := (v_total_profit_loss::NUMERIC / v_total_stakes::NUMERIC);
    ELSE
        v_avg_return := 0;
    END IF;

    UPDATE public.users
    SET 
        total_wins = v_correct_predictions,
        total_losses = v_total_predictions - v_correct_predictions,
        win_rate = v_win_rate,
        prediction_accuracy = v_win_rate,
        average_return = v_avg_return,
        total_stakes_amount = v_total_stakes,
        total_profit_loss = v_total_profit_loss,
        biggest_win = GREATEST(COALESCE(biggest_win, 0), v_best_win),
        updated_at = NOW()
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. Tip-based ranking (markets/comments)
-- ============================================================

-- Markets: add tip totals
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS tip_amount BIGINT DEFAULT 0;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS tip_count INTEGER DEFAULT 0;

-- Comments: add tip totals
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS tip_amount BIGINT DEFAULT 0;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS tip_count INTEGER DEFAULT 0;

-- Market tips table
CREATE TABLE IF NOT EXISTS public.market_tips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
    from_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    sender_wallet TEXT NOT NULL,
    recipient_wallet TEXT NOT NULL,
    amount_raw BIGINT NOT NULL,
    token_mint TEXT NOT NULL,
    tx_signature TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comment tips table
CREATE TABLE IF NOT EXISTS public.comment_tips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
    from_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    sender_wallet TEXT NOT NULL,
    recipient_wallet TEXT NOT NULL,
    amount_raw BIGINT NOT NULL,
    token_mint TEXT NOT NULL,
    tx_signature TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_tips_market ON public.market_tips(market_id);
CREATE INDEX IF NOT EXISTS idx_market_tips_sender ON public.market_tips(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_comment_tips_comment ON public.comment_tips(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_tips_sender ON public.comment_tips(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_markets_tip_amount ON public.markets(tip_amount DESC);
CREATE INDEX IF NOT EXISTS idx_comments_tip_amount ON public.comments(tip_amount DESC);

ALTER TABLE public.market_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Market tips are viewable by everyone" ON public.market_tips FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create market tips" ON public.market_tips FOR INSERT WITH CHECK (auth.uid()::text = from_user_id::text);
CREATE POLICY "Comment tips are viewable by everyone" ON public.comment_tips FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create comment tips" ON public.comment_tips FOR INSERT WITH CHECK (auth.uid()::text = from_user_id::text);

CREATE OR REPLACE FUNCTION update_market_tip_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.markets
        SET tip_amount = tip_amount + NEW.amount_raw,
            tip_count = tip_count + 1
        WHERE id = NEW.market_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.markets
        SET tip_amount = tip_amount - OLD.amount_raw,
            tip_count = GREATEST(tip_count - 1, 0)
        WHERE id = OLD.market_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_market_tip_totals_trigger
AFTER INSERT OR DELETE ON public.market_tips
FOR EACH ROW EXECUTE FUNCTION update_market_tip_totals();

CREATE OR REPLACE FUNCTION update_comment_tip_totals()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.comments
        SET tip_amount = tip_amount + NEW.amount_raw,
            tip_count = tip_count + 1
        WHERE id = NEW.comment_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.comments
        SET tip_amount = tip_amount - OLD.amount_raw,
            tip_count = GREATEST(tip_count - 1, 0)
        WHERE id = OLD.comment_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_comment_tip_totals_trigger
AFTER INSERT OR DELETE ON public.comment_tips
FOR EACH ROW EXECUTE FUNCTION update_comment_tip_totals();

-- ============================================================
-- 14. CLOB atomic balance updates + fee functions (aligned with backend)
-- ============================================================

-- Curvature fee function (aligned with on-chain)
-- Formula: fee = center_fee - (center_fee - extreme_fee) × (|price - 0.5| / 0.5)
CREATE OR REPLACE FUNCTION calculate_dynamic_taker_fee(
    p_price NUMERIC,
    p_center_rate NUMERIC DEFAULT 0.032,  -- 3.2% at 50%
    p_extreme_rate NUMERIC DEFAULT 0.002  -- 0.2% at extremes
)
RETURNS NUMERIC AS $$
DECLARE
    distance_from_center NUMERIC;
    distance_ratio NUMERIC;
    rate_range NUMERIC;
    fee_reduction NUMERIC;
BEGIN
    IF p_price > 0.5 THEN
        distance_from_center := p_price - 0.5;
    ELSE
        distance_from_center := 0.5 - p_price;
    END IF;
    
    distance_ratio := distance_from_center / 0.5;
    rate_range := p_center_rate - p_extreme_rate;
    fee_reduction := rate_range * distance_ratio;
    
    RETURN GREATEST(p_center_rate - fee_reduction, p_extreme_rate);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_dynamic_taker_fee(NUMERIC, NUMERIC, NUMERIC) IS
'Curvature fee rate: max at 50% (3.2%), min at extremes (0.2%)';

-- Atomic balance lock (order placement)
CREATE OR REPLACE FUNCTION lock_funds_for_order(
    p_user_id UUID,
    p_outcome_type TEXT,
    p_side TEXT,
    p_amount BIGINT,
    p_price NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_balance RECORD;
    v_total_cost BIGINT;
    v_updated_balance RECORD;
BEGIN
    SELECT * INTO v_balance
    FROM public.user_balances
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        INSERT INTO public.user_balances (user_id)
        VALUES (p_user_id)
        RETURNING * INTO v_balance;
    END IF;
    
    IF p_side = 'buy' THEN
        v_total_cost := (p_amount * (p_price * 1000000)::BIGINT) / 1000000;
        
        IF v_balance.usdc_available < v_total_cost THEN
            RAISE EXCEPTION 'Insufficient USDC balance: available=%, required=%', 
                v_balance.usdc_available, v_total_cost;
        END IF;
        
        UPDATE public.user_balances
        SET usdc_available = usdc_available - v_total_cost,
            usdc_locked = usdc_locked + v_total_cost,
            updated_at = NOW()
        WHERE user_id = p_user_id
        RETURNING * INTO v_updated_balance;
    ELSE
        IF p_outcome_type = 'yes' THEN
            IF v_balance.yes_available < p_amount THEN
                RAISE EXCEPTION 'Insufficient YES balance: available=%, required=%',
                    v_balance.yes_available, p_amount;
            END IF;
            
            UPDATE public.user_balances
            SET yes_available = yes_available - p_amount,
                yes_locked = yes_locked + p_amount,
                updated_at = NOW()
            WHERE user_id = p_user_id
            RETURNING * INTO v_updated_balance;
        ELSE
            IF v_balance.no_available < p_amount THEN
                RAISE EXCEPTION 'Insufficient NO balance: available=%, required=%',
                    v_balance.no_available, p_amount;
            END IF;
            
            UPDATE public.user_balances
            SET no_available = no_available - p_amount,
                no_locked = no_locked + p_amount,
                updated_at = NOW()
            WHERE user_id = p_user_id
            RETURNING * INTO v_updated_balance;
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'usdc_available', v_updated_balance.usdc_available,
        'usdc_locked', v_updated_balance.usdc_locked,
        'yes_available', v_updated_balance.yes_available,
        'yes_locked', v_updated_balance.yes_locked,
        'no_available', v_updated_balance.no_available,
        'no_locked', v_updated_balance.no_locked
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql;

-- Atomic fill application (matching)
CREATE OR REPLACE FUNCTION apply_trade_fill(
    p_maker_id UUID,
    p_taker_id UUID,
    p_outcome_type TEXT,
    p_side TEXT,           -- Taker side: 'buy' or 'sell'
    p_size BIGINT,
    p_price NUMERIC,
    p_taker_fee BIGINT,
    p_maker_rebate BIGINT,
    p_platform_fee BIGINT,
    p_creator_fee BIGINT
)
RETURNS JSONB AS $$
DECLARE
    v_maker_balance RECORD;
    v_taker_balance RECORD;
    v_total_cost BIGINT;
BEGIN
    IF p_maker_id < p_taker_id THEN
        SELECT * INTO v_maker_balance FROM public.user_balances WHERE user_id = p_maker_id FOR UPDATE;
        SELECT * INTO v_taker_balance FROM public.user_balances WHERE user_id = p_taker_id FOR UPDATE;
    ELSE
        SELECT * INTO v_taker_balance FROM public.user_balances WHERE user_id = p_taker_id FOR UPDATE;
        SELECT * INTO v_maker_balance FROM public.user_balances WHERE user_id = p_maker_id FOR UPDATE;
    END IF;
    
    IF v_maker_balance IS NULL THEN
        INSERT INTO public.user_balances (user_id) VALUES (p_maker_id)
        RETURNING * INTO v_maker_balance;
    END IF;
    IF v_taker_balance IS NULL THEN
        INSERT INTO public.user_balances (user_id) VALUES (p_taker_id)
        RETURNING * INTO v_taker_balance;
    END IF;
    
    v_total_cost := (p_size * (p_price * 1000000)::BIGINT) / 1000000;
    
    IF p_side = 'buy' THEN
        UPDATE public.user_balances
        SET usdc_locked = usdc_locked - v_total_cost,
            usdc_available = usdc_available + p_maker_rebate,
            yes_available = CASE WHEN p_outcome_type = 'yes' THEN yes_available ELSE yes_available END,
            no_available = CASE WHEN p_outcome_type = 'no' THEN no_available ELSE no_available END,
            yes_locked = CASE WHEN p_outcome_type = 'yes' THEN yes_locked - p_size ELSE yes_locked END,
            no_locked = CASE WHEN p_outcome_type = 'no' THEN no_locked - p_size ELSE no_locked END,
            updated_at = NOW()
        WHERE user_id = p_maker_id;
        
        UPDATE public.user_balances
        SET usdc_available = usdc_available + v_total_cost
        WHERE user_id = p_maker_id;
        
        UPDATE public.user_balances
        SET usdc_locked = usdc_locked - v_total_cost - p_taker_fee,
            yes_available = CASE WHEN p_outcome_type = 'yes' THEN yes_available + p_size ELSE yes_available END,
            no_available = CASE WHEN p_outcome_type = 'no' THEN no_available + p_size ELSE no_available END,
            updated_at = NOW()
        WHERE user_id = p_taker_id;
    ELSE
        UPDATE public.user_balances
        SET usdc_locked = usdc_locked - v_total_cost,
            usdc_available = usdc_available + p_maker_rebate,
            yes_available = CASE WHEN p_outcome_type = 'yes' THEN yes_available + p_size ELSE yes_available END,
            no_available = CASE WHEN p_outcome_type = 'no' THEN no_available + p_size ELSE no_available END,
            updated_at = NOW()
        WHERE user_id = p_maker_id;
        
        UPDATE public.user_balances
        SET usdc_available = usdc_available + v_total_cost - p_taker_fee,
            yes_locked = CASE WHEN p_outcome_type = 'yes' THEN yes_locked - p_size ELSE yes_locked END,
            no_locked = CASE WHEN p_outcome_type = 'no' THEN no_locked - p_size ELSE no_locked END,
            updated_at = NOW()
        WHERE user_id = p_taker_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'total_cost', v_total_cost,
        'taker_fee', p_taker_fee,
        'maker_rebate', p_maker_rebate,
        'platform_fee', p_platform_fee,
        'creator_fee', p_creator_fee
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql;

-- Unlock funds for cancelled orders
CREATE OR REPLACE FUNCTION unlock_cancelled_order(
    p_user_id UUID,
    p_outcome_type TEXT,
    p_side TEXT,
    p_remaining_amount BIGINT,
    p_price NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_total_cost BIGINT;
BEGIN
    SELECT * FROM public.user_balances WHERE user_id = p_user_id FOR UPDATE;
    
    IF p_side = 'buy' THEN
        v_total_cost := (p_remaining_amount * (p_price * 1000000)::BIGINT) / 1000000;
        
        UPDATE public.user_balances
        SET usdc_locked = usdc_locked - v_total_cost,
            usdc_available = usdc_available + v_total_cost,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    ELSE
        IF p_outcome_type = 'yes' THEN
            UPDATE public.user_balances
            SET yes_locked = yes_locked - p_remaining_amount,
                yes_available = yes_available + p_remaining_amount,
                updated_at = NOW()
            WHERE user_id = p_user_id;
        ELSE
            UPDATE public.user_balances
            SET no_locked = no_locked - p_remaining_amount,
                no_available = no_available + p_remaining_amount,
                updated_at = NOW()
            WHERE user_id = p_user_id;
        END IF;
    END IF;
    
    RETURN jsonb_build_object('success', true);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Add deposit_usdc_balance function (used by balances.ts)
CREATE OR REPLACE FUNCTION deposit_usdc_balance(
    p_user_id UUID,
    p_amount BIGINT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.user_balances (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    
    UPDATE public.user_balances
    SET usdc_available = usdc_available + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- pending_settlements index (if missing)
CREATE INDEX IF NOT EXISTS idx_pending_settlements_created 
    ON public.pending_settlements(created_at);

-- ============================================================
-- CLOB orderbook indexes (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_orderbook_lookup
    ON public.orders(market_id, outcome_type, side, status, price, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_remaining_open
    ON public.orders(market_id, outcome_type, side, remaining_amount)
    WHERE remaining_amount > 0 AND status IN ('open', 'partial');

-- ============================================================
-- Search indexes for markets
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX IF NOT EXISTS idx_markets_title_trgm
    ON public.markets USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_markets_question_trgm
    ON public.markets USING GIN (question gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_markets_tags_gin
    ON public.markets USING GIN (tags);

-- ============================================================
-- Migration completion notice
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Database migrations completed!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Features added:';
    RAISE NOTICE '  ✓ Category/tag system';
    RAISE NOTICE '  ✓ Random termination';
    RAISE NOTICE '  ✓ Liquidity rewards';
    RAISE NOTICE '  ✓ Redemptions table';
    RAISE NOTICE '  ✓ VRF fee support';
    RAISE NOTICE '  ✓ Inactivity termination (7 days)';
    RAISE NOTICE '  ✓ Helper functions and views';
    RAISE NOTICE '========================================';
    RAISE NOTICE '========================================';
END $$;

SELECT 'Database migrations completed successfully!' AS status;
