-- ============================================================
-- Performance optimization indexes
-- Version: 004
-- Date: 2026-01-18
-- Description: Add composite/partial indexes for hot queries
-- ============================================================

-- Trades: frequent market/user + time sorting
CREATE INDEX IF NOT EXISTS idx_trades_market_block_time
ON public.trades(market_id, block_time DESC);

CREATE INDEX IF NOT EXISTS idx_trades_user_block_time
ON public.trades(user_id, block_time DESC);

-- Orders: partial index for active orders only
CREATE INDEX IF NOT EXISTS idx_orders_open_market_created
ON public.orders(market_id, created_at DESC)
WHERE status IN ('open', 'partial');

-- Note: trade_records table removed in code cleanup (2026-01-21)
-- Use trades table instead for all trade queries

SELECT 'Migration 004 completed successfully - Added performance indexes' AS status;
