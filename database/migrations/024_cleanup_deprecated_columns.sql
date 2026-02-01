-- Migration 024: Cleanup Deprecated Columns
-- AUDIT FIX v1.2.1: Remove deprecated fee columns from markets table
-- Fee rates are now stored globally in platform_settings and on-chain global account

-- ============================================================
-- IMPORTANT: Run this migration only on existing databases
-- New databases should use the updated schema.sql instead
-- ============================================================

BEGIN;

-- Check if we should run this migration
DO $$
BEGIN
    -- Only run if the deprecated columns exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'markets' 
        AND column_name = 'platform_fee_rate'
    ) THEN
        -- Backup current values to platform_settings if not already there
        INSERT INTO public.platform_settings (key, platform_fee_rate, maker_rebate_rate, center_taker_fee_rate, extreme_taker_fee_rate, creator_incentive_rate)
        SELECT 
            'default',
            COALESCE(m.platform_fee_rate, 0.75),
            COALESCE(m.maker_rebate_rate, 0.2),
            COALESCE(m.center_taker_fee_rate, 0.032),
            COALESCE(m.extreme_taker_fee_rate, 0.002),
            COALESCE(m.creator_incentive_rate, 0.05)
        FROM public.markets m
        LIMIT 1
        ON CONFLICT (key) DO NOTHING;
        
        RAISE NOTICE 'Fee settings backed up to platform_settings';
    END IF;
END $$;

-- Drop deprecated fee columns from markets table
-- These are now managed globally via platform_settings
ALTER TABLE public.markets 
    DROP COLUMN IF EXISTS platform_fee_rate,
    DROP COLUMN IF EXISTS maker_rebate_rate,
    DROP COLUMN IF EXISTS center_taker_fee_rate,
    DROP COLUMN IF EXISTS extreme_taker_fee_rate;

-- Note: Keep creator_incentive_rate as it may vary per market

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 024 completed: Deprecated fee columns removed from markets table';
END $$;

COMMIT;

-- ============================================================
-- Verification queries (run manually after migration)
-- ============================================================
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'markets' 
-- AND column_name LIKE '%fee%' OR column_name LIKE '%rebate%';
-- 
-- SELECT * FROM public.platform_settings;
