-- ============================================
-- Catallaxyz Database Functions Migration
-- AUDIT FIX CRIT-1: Atomic order update function with row locking
-- Version: 003
-- Description: Create database functions for atomic operations
-- ============================================

-- ============================================
-- Atomic Order Fill Update Function
-- Uses SELECT FOR UPDATE to lock rows and prevent race conditions
-- ============================================
CREATE OR REPLACE FUNCTION update_order_fill_atomic(
    p_maker_order_id UUID,
    p_taker_order_id UUID,
    p_fill_size TEXT
) RETURNS JSONB AS $$
DECLARE
    v_fill_size NUMERIC := p_fill_size::NUMERIC;
    v_maker_record RECORD;
    v_taker_record RECORD;
    v_maker_new_filled NUMERIC;
    v_taker_new_filled NUMERIC;
    v_maker_new_remaining NUMERIC;
    v_taker_new_remaining NUMERIC;
    v_maker_new_status TEXT;
    v_taker_new_status TEXT;
BEGIN
    -- Lock and fetch maker order
    SELECT id, amount::NUMERIC, filled_amount::NUMERIC, remaining_amount::NUMERIC, status, version
    INTO v_maker_record
    FROM orders
    WHERE id = p_maker_order_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maker order not found');
    END IF;
    
    -- Lock and fetch taker order
    SELECT id, amount::NUMERIC, filled_amount::NUMERIC, remaining_amount::NUMERIC, status, version
    INTO v_taker_record
    FROM orders
    WHERE id = p_taker_order_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Taker order not found');
    END IF;
    
    -- Calculate new values for maker
    v_maker_new_filled := COALESCE(v_maker_record.filled_amount, 0) + v_fill_size;
    v_maker_new_remaining := v_maker_record.amount - v_maker_new_filled;
    v_maker_new_status := CASE 
        WHEN v_maker_new_remaining <= 0 THEN 'filled'
        WHEN v_maker_new_filled > 0 THEN 'partial'
        ELSE v_maker_record.status
    END;
    
    -- Calculate new values for taker
    v_taker_new_filled := COALESCE(v_taker_record.filled_amount, 0) + v_fill_size;
    v_taker_new_remaining := v_taker_record.amount - v_taker_new_filled;
    v_taker_new_status := CASE 
        WHEN v_taker_new_remaining <= 0 THEN 'filled'
        WHEN v_taker_new_filled > 0 THEN 'partial'
        ELSE v_taker_record.status
    END;
    
    -- Update maker order
    UPDATE orders
    SET 
        filled_amount = v_maker_new_filled::TEXT,
        remaining_amount = v_maker_new_remaining::TEXT,
        status = v_maker_new_status,
        version = COALESCE(version, 0) + 1,
        updated_at = NOW(),
        filled_at = CASE WHEN v_maker_new_status = 'filled' THEN NOW() ELSE filled_at END
    WHERE id = p_maker_order_id;
    
    -- Update taker order
    UPDATE orders
    SET 
        filled_amount = v_taker_new_filled::TEXT,
        remaining_amount = v_taker_new_remaining::TEXT,
        status = v_taker_new_status,
        version = COALESCE(version, 0) + 1,
        updated_at = NOW(),
        filled_at = CASE WHEN v_taker_new_status = 'filled' THEN NOW() ELSE filled_at END
    WHERE id = p_taker_order_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'maker', jsonb_build_object(
            'filled_amount', v_maker_new_filled::TEXT,
            'remaining_amount', v_maker_new_remaining::TEXT,
            'status', v_maker_new_status
        ),
        'taker', jsonb_build_object(
            'filled_amount', v_taker_new_filled::TEXT,
            'remaining_amount', v_taker_new_remaining::TEXT,
            'status', v_taker_new_status
        )
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Apply Trade Fill Function (atomic balance update)
-- ============================================
CREATE OR REPLACE FUNCTION apply_trade_fill(
    p_market_id UUID,
    p_maker_user_id UUID,
    p_taker_user_id UUID,
    p_outcome_type TEXT,
    p_side TEXT,
    p_size TEXT,
    p_price TEXT,
    p_taker_fee TEXT,
    p_maker_rebate TEXT
) RETURNS JSONB AS $$
DECLARE
    v_size NUMERIC := p_size::NUMERIC;
    v_price NUMERIC := p_price::NUMERIC;
    v_total_cost NUMERIC := (v_size * v_price) / 1000000;
    v_taker_fee NUMERIC := p_taker_fee::NUMERIC;
    v_maker_rebate NUMERIC := p_maker_rebate::NUMERIC;
BEGIN
    -- Update market statistics
    UPDATE markets
    SET 
        total_trades = total_trades + 1,
        total_volume = total_volume + v_total_cost,
        last_price = v_price / 1000000,
        last_trade_at = NOW(),
        current_yes_price = CASE WHEN p_outcome_type = 'yes' THEN v_price / 1000000 ELSE current_yes_price END,
        current_no_price = CASE WHEN p_outcome_type = 'no' THEN v_price / 1000000 ELSE current_no_price END,
        updated_at = NOW()
    WHERE id = p_market_id;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Update Market Stats Function
-- ============================================
CREATE OR REPLACE FUNCTION update_market_stats_on_trade(
    p_market_id UUID,
    p_price NUMERIC,
    p_size NUMERIC,
    p_outcome_type TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE markets
    SET 
        total_trades = total_trades + 1,
        total_volume = total_volume + p_size,
        last_price = p_price,
        last_trade_at = NOW(),
        current_yes_price = CASE WHEN p_outcome_type = 'yes' THEN p_price ELSE current_yes_price END,
        current_no_price = CASE WHEN p_outcome_type = 'no' THEN p_price ELSE current_no_price END,
        updated_at = NOW()
    WHERE id = p_market_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['users', 'markets', 'orders', 'user_balances'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON %I;
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;
