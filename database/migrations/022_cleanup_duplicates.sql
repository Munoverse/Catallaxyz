-- ============================================================
-- Migration: Cleanup Duplicate Definitions
-- Date: 2026-01-28
-- Description: Remove duplicate function/trigger definitions
-- Note: This migration consolidates definitions to schema.sql only
-- ============================================================

-- ============================================================
-- 1. Drop and recreate functions with canonical definitions
-- This ensures only one authoritative definition exists
-- ============================================================

-- 1.1 calculate_dynamic_taker_fee
DROP FUNCTION IF EXISTS public.calculate_dynamic_taker_fee(NUMERIC, NUMERIC, NUMERIC) CASCADE;
CREATE OR REPLACE FUNCTION public.calculate_dynamic_taker_fee(
    price NUMERIC,
    center_fee NUMERIC DEFAULT 0.02,
    extreme_fee NUMERIC DEFAULT 0.10
) RETURNS NUMERIC AS $$
DECLARE
    distance_from_center NUMERIC;
    fee_rate NUMERIC;
BEGIN
    -- Calculate distance from 0.5 (center)
    distance_from_center := ABS(price - 0.5);
    
    -- Linear interpolation: center_fee at 0.5, extreme_fee at 0 or 1
    fee_rate := center_fee + (extreme_fee - center_fee) * (distance_from_center * 2);
    
    RETURN LEAST(GREATEST(fee_rate, center_fee), extreme_fee);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.calculate_dynamic_taker_fee IS 
    'Calculate dynamic taker fee based on price distance from center (0.5). 
     Returns higher fees for extreme prices (near 0 or 1).';

-- 1.2 lock_funds_for_order
DROP FUNCTION IF EXISTS public.lock_funds_for_order(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC) CASCADE;
CREATE OR REPLACE FUNCTION public.lock_funds_for_order(
    p_user_id UUID,
    p_market_id UUID,
    p_outcome VARCHAR,
    p_side VARCHAR,
    p_amount NUMERIC,
    p_price NUMERIC
) RETURNS BOOLEAN AS $$
DECLARE
    v_required_lock NUMERIC;
    v_current_available NUMERIC;
BEGIN
    -- Calculate required lock based on side
    IF p_side = 'buy' THEN
        v_required_lock := p_amount * p_price;
    ELSE
        v_required_lock := p_amount * (1 - p_price);
    END IF;
    
    -- Check and lock funds atomically
    UPDATE public.user_balances
    SET usdc_available = usdc_available - v_required_lock,
        usdc_locked = usdc_locked + v_required_lock,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND market_id = p_market_id
      AND usdc_available >= v_required_lock;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.lock_funds_for_order IS 
    'Lock user funds when placing a new order. Returns false if insufficient balance.';

-- 1.3 apply_trade_fill
DROP FUNCTION IF EXISTS public.apply_trade_fill(UUID, UUID, UUID, UUID, VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) CASCADE;
CREATE OR REPLACE FUNCTION public.apply_trade_fill(
    p_maker_order_id UUID,
    p_taker_order_id UUID,
    p_maker_id UUID,
    p_taker_id UUID,
    p_outcome VARCHAR,
    p_price NUMERIC,
    p_amount NUMERIC,
    p_maker_fee NUMERIC,
    p_taker_fee NUMERIC,
    p_maker_rebate NUMERIC,
    p_platform_fee NUMERIC
) RETURNS UUID AS $$
DECLARE
    v_trade_id UUID;
    v_market_id UUID;
BEGIN
    -- Get market_id from maker order
    SELECT market_id INTO v_market_id FROM public.orders WHERE id = p_maker_order_id;
    
    -- Create trade record
    INSERT INTO public.trades (
        maker_order_id, taker_order_id, maker_id, taker_id,
        market_id, outcome, price, amount,
        maker_fee, taker_fee, maker_rebate, platform_fee
    ) VALUES (
        p_maker_order_id, p_taker_order_id, p_maker_id, p_taker_id,
        v_market_id, p_outcome, p_price, p_amount,
        p_maker_fee, p_taker_fee, p_maker_rebate, p_platform_fee
    ) RETURNING id INTO v_trade_id;
    
    -- Update order remaining amounts
    UPDATE public.orders 
    SET remaining_amount = remaining_amount - p_amount,
        status = CASE 
            WHEN remaining_amount - p_amount <= 0 THEN 'filled' 
            ELSE 'partial' 
        END,
        updated_at = NOW()
    WHERE id IN (p_maker_order_id, p_taker_order_id);
    
    RETURN v_trade_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.apply_trade_fill IS 
    'Apply a trade fill to update orders and create trade record.';

-- 1.4 unlock_cancelled_order
DROP FUNCTION IF EXISTS public.unlock_cancelled_order(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.unlock_cancelled_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_locked_amount NUMERIC;
BEGIN
    -- Get order details
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Calculate locked amount to return
    IF v_order.side = 'buy' THEN
        v_locked_amount := v_order.remaining_amount * v_order.price;
    ELSE
        v_locked_amount := v_order.remaining_amount * (1 - v_order.price);
    END IF;
    
    -- Unlock funds
    UPDATE public.user_balances
    SET usdc_available = usdc_available + v_locked_amount,
        usdc_locked = usdc_locked - v_locked_amount,
        updated_at = NOW()
    WHERE user_id = v_order.user_id
      AND market_id = v_order.market_id;
    
    -- Mark order as cancelled
    UPDATE public.orders
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_order_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.unlock_cancelled_order IS 
    'Unlock funds when an order is cancelled.';

-- 1.5 update_user_win_rate
DROP FUNCTION IF EXISTS public.update_user_win_rate() CASCADE;
CREATE OR REPLACE FUNCTION public.update_user_win_rate()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user statistics after market settlement
    UPDATE public.users u
    SET 
        total_predictions = (
            SELECT COUNT(DISTINCT market_id) 
            FROM public.stakes 
            WHERE user_id = u.id AND status = 'settled'
        ),
        correct_predictions = (
            SELECT COUNT(DISTINCT market_id) 
            FROM public.stakes 
            WHERE user_id = u.id AND status = 'settled' AND is_winner = true
        ),
        win_rate = CASE 
            WHEN (SELECT COUNT(*) FROM public.stakes WHERE user_id = u.id AND status = 'settled') > 0 
            THEN (
                SELECT COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT market_id), 0)
                FROM public.stakes 
                WHERE user_id = u.id AND status = 'settled' AND is_winner = true
            )
            ELSE 0 
        END,
        updated_at = NOW()
    WHERE u.id IN (SELECT DISTINCT user_id FROM public.stakes WHERE market_id = NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_user_win_rate IS 
    'Trigger function to recalculate user win rate after market settlement.';

-- ============================================================
-- 2. Recreate triggers with canonical definitions
-- ============================================================

-- 2.1 Market tip totals trigger
DROP TRIGGER IF EXISTS update_market_tip_totals_trigger ON public.market_tips;
DROP FUNCTION IF EXISTS public.update_market_tip_totals() CASCADE;

CREATE OR REPLACE FUNCTION public.update_market_tip_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.markets
    SET tip_amount = COALESCE(tip_amount, 0) + NEW.amount,
        tip_count = COALESCE(tip_count, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.market_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_market_tip_totals_trigger
    AFTER INSERT ON public.market_tips
    FOR EACH ROW
    EXECUTE FUNCTION public.update_market_tip_totals();

COMMENT ON FUNCTION public.update_market_tip_totals IS 
    'Update market tip totals when a new tip is added.';

-- 2.2 Comment tip totals trigger
DROP TRIGGER IF EXISTS update_comment_tip_totals_trigger ON public.comment_tips;
DROP FUNCTION IF EXISTS public.update_comment_tip_totals() CASCADE;

CREATE OR REPLACE FUNCTION public.update_comment_tip_totals()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.comments
    SET tip_amount = COALESCE(tip_amount, 0) + NEW.amount,
        tip_count = COALESCE(tip_count, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.comment_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_comment_tip_totals_trigger
    AFTER INSERT ON public.comment_tips
    FOR EACH ROW
    EXECUTE FUNCTION public.update_comment_tip_totals();

COMMENT ON FUNCTION public.update_comment_tip_totals IS 
    'Update comment tip totals when a new tip is added.';

-- 2.3 Market volume 24h trigger (single canonical version)
DROP TRIGGER IF EXISTS update_market_volume_24h_trigger ON public.trades;
DROP FUNCTION IF EXISTS public.update_market_volume_24h() CASCADE;

CREATE OR REPLACE FUNCTION public.update_market_volume_24h()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.markets
    SET volume_24h = (
        SELECT COALESCE(SUM(amount), 0)
        FROM public.trades
        WHERE market_id = NEW.market_id
          AND created_at > NOW() - INTERVAL '24 hours'
    ),
    updated_at = NOW()
    WHERE id = NEW.market_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_market_volume_24h_trigger
    AFTER INSERT ON public.trades
    FOR EACH ROW
    EXECUTE FUNCTION public.update_market_volume_24h();

COMMENT ON FUNCTION public.update_market_volume_24h IS 
    'Update market 24h volume when a new trade is executed.';

-- ============================================================
-- 3. Create materialized view refresh function
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
    -- Refresh market termination status view
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'market_termination_status') THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.market_termination_status;
    END IF;
    
    -- Refresh leaderboard views if they exist
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'user_leaderboard') THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_leaderboard;
    END IF;
    
    -- Refresh inactive market candidates
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'inactive_market_candidates_mv') THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.inactive_market_candidates_mv;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.refresh_all_materialized_views IS 
    'Refresh all materialized views. Call periodically via cron.';

-- ============================================================
-- 4. Create scheduled refresh job (if pg_cron available)
-- ============================================================

-- Note: pg_cron must be installed for this to work
DO $$
BEGIN
    -- Check if pg_cron is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Schedule materialized view refresh every 5 minutes
        PERFORM cron.schedule(
            'refresh-materialized-views',
            '*/5 * * * *',
            'SELECT public.refresh_all_materialized_views()'
        );
        RAISE NOTICE 'Scheduled materialized view refresh via pg_cron';
    ELSE
        RAISE NOTICE 'pg_cron not available. Use external cron to call refresh_all_materialized_views()';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not schedule pg_cron job: %', SQLERRM;
END $$;

-- ============================================================
-- 5. Migration tracking
-- ============================================================

INSERT INTO public.schema_migrations (version) 
VALUES ('022_cleanup_duplicates')
ON CONFLICT (version) DO NOTHING;

SELECT 'Duplicate cleanup migration completed!' AS status;
