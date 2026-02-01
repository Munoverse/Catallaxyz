-- Migration 026: Audit Fixes v1.2.5
-- Date: 2026-01-28
-- Purpose: Fix critical database issues identified in code audit v1.2.5
--
-- Issues Fixed:
-- 1. user_balances constraint checks non-existent usdc_balance field
-- 2. price constraints conflict (> 0 vs >= 0)
-- 3. Add unique constraint for nonce per user to prevent replay attacks
-- 4. Clean up redundant fields documentation

-- ============================================
-- 1. Fix user_balances constraint
-- ============================================

-- The constraint was checking usdc_balance but the table uses usdc_available and usdc_locked
-- First, drop the incorrect constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_balances_usdc_non_negative'
  ) THEN
    ALTER TABLE public.user_balances DROP CONSTRAINT user_balances_usdc_non_negative;
  END IF;
END $$;

-- Add correct constraints for user_balances
ALTER TABLE public.user_balances
  ADD CONSTRAINT IF NOT EXISTS user_balances_usdc_available_non_negative
    CHECK (usdc_available >= 0),
  ADD CONSTRAINT IF NOT EXISTS user_balances_usdc_locked_non_negative
    CHECK (usdc_locked >= 0);

-- ============================================
-- 2. Standardize price constraints
-- ============================================

-- Orders: price can be NULL (market orders) or > 0 and <= 1 (limit orders)
-- Drop all existing price constraints first to avoid conflicts
DO $$
BEGIN
  -- Drop orders price constraints
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_price_check') THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_price_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_price_positive') THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_price_positive;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_price_range') THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_price_range;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_price_range_check') THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_price_range_check;
  END IF;
  
  -- Drop trades price constraints
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_price_check') THEN
    ALTER TABLE public.trades DROP CONSTRAINT trades_price_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_price_positive') THEN
    ALTER TABLE public.trades DROP CONSTRAINT trades_price_positive;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_price_range') THEN
    ALTER TABLE public.trades DROP CONSTRAINT trades_price_range;
  END IF;
END $$;

-- Add standardized price constraints
-- Orders: NULL (market orders) OR positive value in range (0, 1]
ALTER TABLE public.orders
  ADD CONSTRAINT orders_price_range
    CHECK (price IS NULL OR (price > 0 AND price <= 1));

-- Trades: executed trades must have positive price in range (0, 1]
ALTER TABLE public.trades
  ADD CONSTRAINT trades_price_range
    CHECK (price > 0 AND price <= 1);

-- ============================================
-- 3. Add nonce uniqueness constraint for replay attack prevention
-- ============================================

-- Each user can only use a nonce once
-- This prevents replay attacks where the same signed order is submitted multiple times
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_user_nonce_unique'
  ) THEN
    -- Create unique index if it doesn't exist
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_nonce_unique
      ON public.orders(user_id, nonce)
      WHERE nonce IS NOT NULL;
  END IF;
END $$;

-- ============================================
-- 4. Add comments documenting field purposes
-- ============================================

COMMENT ON COLUMN public.trades.user_id IS 'DEPRECATED: Use maker_user_id or taker_user_id instead. Kept for backward compatibility.';
COMMENT ON COLUMN public.orders.placed_at IS 'Order submission timestamp (when order was placed by user). Distinct from created_at (database record creation time).';
COMMENT ON COLUMN public.orders.created_at IS 'Database record creation timestamp. See placed_at for user submission time.';

-- ============================================
-- 5. Verify constraints exist on schema
-- ============================================

-- Ensure all critical constraints are in place
DO $$
DECLARE
  missing_constraints TEXT := '';
BEGIN
  -- Check orders_price_range
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_price_range') THEN
    missing_constraints := missing_constraints || 'orders_price_range, ';
  END IF;
  
  -- Check trades_price_range  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_price_range') THEN
    missing_constraints := missing_constraints || 'trades_price_range, ';
  END IF;
  
  IF missing_constraints != '' THEN
    RAISE WARNING 'Missing constraints after migration: %', missing_constraints;
  END IF;
END $$;

-- ============================================
-- Migration complete
-- ============================================
