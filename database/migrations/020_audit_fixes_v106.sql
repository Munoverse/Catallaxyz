-- ============================================================
-- Migration: Audit Fixes v1.0.6
-- Date: 2026-01-28
-- Description: Fix RLS policies and add missing constraints
-- ============================================================

-- ============================================================
-- 1. Categories RLS Policy Fixes
-- ============================================================

-- Drop old incomplete policy if exists
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;

-- Categories: Complete RLS policies
DO $$
BEGIN
    -- Select policy (public read)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_select_policy') THEN
        CREATE POLICY "categories_select_policy" ON public.categories 
            FOR SELECT USING (true);
    END IF;
    
    -- Insert policy (admin only)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_insert_policy') THEN
        CREATE POLICY "categories_insert_policy" ON public.categories 
            FOR INSERT WITH CHECK (
                current_setting('role', true) = 'service_role' OR
                current_setting('role', true) = 'postgres'
            );
    END IF;
    
    -- Update policy (admin only)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_update_policy') THEN
        CREATE POLICY "categories_update_policy" ON public.categories 
            FOR UPDATE USING (
                current_setting('role', true) = 'service_role' OR
                current_setting('role', true) = 'postgres'
            );
    END IF;
    
    -- Delete policy (admin only)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_delete_policy') THEN
        CREATE POLICY "categories_delete_policy" ON public.categories 
            FOR DELETE USING (
                current_setting('role', true) = 'service_role' OR
                current_setting('role', true) = 'postgres'
            );
    END IF;
END $$;

-- ============================================================
-- 2. Add frequency constraint if missing
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'categories' AND constraint_name = 'categories_frequency_check'
    ) THEN
        ALTER TABLE public.categories 
            ADD CONSTRAINT categories_frequency_check 
            CHECK (frequency IN ('all', 'daily', 'weekly', 'monthly'));
    END IF;
END $$;

-- ============================================================
-- 3. Migration version tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version) 
VALUES ('020_audit_fixes_v106')
ON CONFLICT (version) DO NOTHING;

SELECT 'Audit fixes v1.0.6 migration completed!' AS status;
