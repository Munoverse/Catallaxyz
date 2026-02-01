-- Migration 025: Low Priority Fixes
-- AUDIT FIX v1.2.2: Fix remaining low priority issues
-- Date: 2026-01-28

BEGIN;

-- Fix orders.remaining_amount to have NOT NULL and DEFAULT
-- This ensures data integrity and prevents null values
ALTER TABLE public.orders 
    ALTER COLUMN remaining_amount SET NOT NULL,
    ALTER COLUMN remaining_amount SET DEFAULT 0;

-- Update any existing null values first
UPDATE public.orders 
SET remaining_amount = COALESCE(remaining_amount, amount - filled_amount, 0)
WHERE remaining_amount IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.remaining_amount IS 'Remaining amount to fill (USDC lamports). Set to amount - filled_amount on creation.';

COMMIT;
