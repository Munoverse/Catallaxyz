-- ============================================================
-- CODE_AUDIT_ISSUES.md fix migration
-- Fix database issues found during audit
-- ============================================================

-- ============================================================
-- 1. Add deposit_usdc_balance function (used by balances.ts)
-- ============================================================
CREATE OR REPLACE FUNCTION deposit_usdc_balance(
    p_user_id UUID,
    p_amount BIGINT
)
RETURNS VOID AS $$
BEGIN
    -- Ensure balance exists
    INSERT INTO public.user_balances (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Update balance
    UPDATE public.user_balances
    SET usdc_available = usdc_available + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Create pending_settlements index (if missing)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pending_settlements_created 
    ON public.pending_settlements(created_at);

-- ============================================================
-- Done
-- ============================================================
SELECT 'CODE_AUDIT_ISSUES fixes migration completed' AS status;
