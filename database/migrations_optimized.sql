-- ============================================================
-- Catallaxyz 优化后的增量迁移脚本
-- 说明：此文件只包含 schema.sql 中没有的增量变更
-- 适用于：从旧版 schema 升级的数据库
-- 日期：2026-01-28
-- 
-- 注意：如果是新数据库，直接使用 schema.sql 即可
-- 此文件仅用于升级现有数据库
-- ============================================================

-- ============================================================
-- 1. 类型定义（如果不存在）
-- ============================================================

-- 市场分类枚举类型（未使用，仅保留兼容性）
DO $$ BEGIN
    CREATE TYPE market_category AS ENUM (
        'wealth', 'physical_health', 'mental_health', 'family_friends', 
        'happiness', 'self_growth', 'career_achievement', 'relationships', 
        'luck', 'macro_vision'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. 约束变更（schema.sql 中可能缺少的）
-- ============================================================

-- 市场分类约束（如果不存在）
ALTER TABLE public.markets DROP CONSTRAINT IF EXISTS markets_category_check;
ALTER TABLE public.markets ADD CONSTRAINT markets_category_check 
    CHECK (category IS NULL OR category IN (
        'wealth', 'physical_health', 'mental_health', 'family_friends', 
        'happiness', 'self_growth', 'career_achievement', 'relationships', 
        'luck', 'macro_vision'
    ));

-- ============================================================
-- 3. 物化视图（需要定期刷新）
-- ============================================================

-- 市场终止状态视图
DROP MATERIALIZED VIEW IF EXISTS market_termination_status;
CREATE MATERIALIZED VIEW market_termination_status AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_termination_market_id 
ON market_termination_status(market_id);

-- 刷新函数
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY market_termination_status;
    RAISE NOTICE 'Materialized views refreshed at %', NOW();
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to refresh: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. VRF 费用字段（orders 表扩展）
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vrf_fee_prepaid BIGINT DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vrf_fee_refunded BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vrf_fee_refund_amount BIGINT DEFAULT 0;

ALTER TABLE public.randomness_requests ADD COLUMN IF NOT EXISTS trade_id UUID REFERENCES public.trades(id);
ALTER TABLE public.randomness_requests ADD COLUMN IF NOT EXISTS vrf_fee_amount BIGINT DEFAULT 0;

-- ============================================================
-- 5. 用户相关字段
-- ============================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username_required BOOLEAN DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- ============================================================
-- 6. 流动性奖励系统表（如果不存在）
-- 注意：这些表在 schema.sql 中没有，需要在迁移中创建
-- ============================================================

-- 订单簿快照
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

-- 做市商评分
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

CREATE INDEX IF NOT EXISTS idx_liquidity_scores_snapshot ON public.liquidity_scores(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_scores_user_time ON public.liquidity_scores(user_id, created_at DESC);

-- 滚动评分状态
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

CREATE INDEX IF NOT EXISTS idx_liquidity_score_state_market ON public.liquidity_score_state(market_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_score_state_user ON public.liquidity_score_state(user_id);

-- 每日奖励分发
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

CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_user ON public.liquidity_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_period ON public.liquidity_rewards(reward_period DESC);

-- RLS for liquidity tables
ALTER TABLE public.liquidity_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Liquidity rewards are viewable by everyone" ON public.liquidity_rewards;
CREATE POLICY "Liquidity rewards are viewable by everyone" ON public.liquidity_rewards FOR SELECT USING (true);

-- ============================================================
-- 7. 24小时交易量更新函数
-- ============================================================

CREATE OR REPLACE FUNCTION update_market_volume_24h()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.markets
    SET volume_24h = (
        SELECT COALESCE(SUM(total_cost), 0)
        FROM public.trades
        WHERE market_id = NEW.market_id
        AND created_at >= NOW() - INTERVAL '24 hours'
    ),
    updated_at = NOW()
    WHERE id = NEW.market_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_market_volume_24h_trigger ON public.trades;
CREATE TRIGGER update_market_volume_24h_trigger
AFTER INSERT ON public.trades
FOR EACH ROW
EXECUTE FUNCTION update_market_volume_24h();

-- ============================================================
-- 迁移完成
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ 优化后的迁移脚本执行完成!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '已添加:';
    RAISE NOTICE '  ✓ 市场分类约束';
    RAISE NOTICE '  ✓ 物化视图 (market_termination_status)';
    RAISE NOTICE '  ✓ VRF 费用字段';
    RAISE NOTICE '  ✓ 流动性奖励系统表';
    RAISE NOTICE '  ✓ 24小时交易量更新触发器';
    RAISE NOTICE '========================================';
END $$;

SELECT '优化后的迁移脚本执行成功!' AS status;
