-- ============================================================
-- Migration: 018_add_missing_indexes.sql
-- Description: Add missing performance indexes identified in audit
-- Date: 2026-01-27
-- ============================================================

-- ============================================
-- Composite index for trades table
-- Used for market leaderboard and outcome-based queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_trades_market_outcome_time
    ON public.trades(market_id, outcome_type, created_at DESC);

-- ============================================
-- Additional optimization indexes
-- ============================================

-- Speed up pending settlement queries
CREATE INDEX IF NOT EXISTS idx_pending_settlements_status_created
    ON public.pending_settlements(status, created_at)
    WHERE status = 'pending';

-- Speed up user notification queries (unread first)
-- Note: Column is 'is_read' not 'read'
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications(user_id, is_read, created_at DESC)
    WHERE is_read = false;

-- Speed up market probability history queries
-- Note: Column is 'timestamp' not 'recorded_at'
CREATE INDEX IF NOT EXISTS idx_market_probability_market_time
    ON public.market_probability_history(market_id, timestamp DESC);
