-- ============================================================
-- Migration: Add categories management system
-- ============================================================

-- Categories table - manage market tags
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Category Info
    slug TEXT UNIQUE NOT NULL,  -- Unique identifier for URL/API
    name TEXT NOT NULL,         -- English name
    name_zh TEXT,               -- Chinese name
    description TEXT,           -- Description
    icon TEXT,                  -- Icon (emoji or icon name)
    color TEXT,                 -- Color code (UI)
    
    -- Display
    display_order INTEGER DEFAULT 0,  -- Sort order
    is_active BOOLEAN DEFAULT true,   -- Enabled flag
    is_featured BOOLEAN DEFAULT false, -- Featured/pinned flag
    
    -- Stats (cached)
    markets_count INTEGER DEFAULT 0,  -- Number of markets in category
    total_volume BIGINT DEFAULT 0,    -- Total volume for category
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT categories_slug_check CHECK (length(slug) >= 2 AND slug ~ '^[a-z0-9_-]+$'),
    CONSTRAINT categories_name_check CHECK (length(name) >= 2)
);

-- Category indexes
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_order ON public.categories(display_order);
CREATE INDEX IF NOT EXISTS idx_categories_featured ON public.categories(is_featured) WHERE is_featured = true;

-- RLS for categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Categories: Public read, admin write (through backend)
CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);

-- Insert default categories (based on existing MARKET_CATEGORIES)
INSERT INTO public.categories (slug, name, name_zh, description, icon, display_order, is_active, is_featured) VALUES
    ('wealth', 'Wealth', '财富', 'Financial success and prosperity', '💰', 1, true, true),
    ('physical_health', 'Physical Health', '身体健康', 'Body wellness and fitness', '💪', 2, true, false),
    ('mental_health', 'Mental Health', '心理健康', 'Mental wellness and emotional balance', '🧠', 3, true, false),
    ('family_friends', 'Family & Friends', '家庭和亲友', 'Relationships with family and friends', '👨‍👩‍👧‍👦', 4, true, false),
    ('happiness', 'Happiness', '幸福', 'Joy and life satisfaction', '😊', 5, true, false),
    ('self_growth', 'Self Growth', '自我成长', 'Personal development and learning', '🌱', 6, true, false),
    ('career_achievement', 'Career & Achievement', '事业和学业成就', 'Professional success and academic excellence', '🎯', 7, true, true),
    ('relationships', 'Relationships', '亲密关系', 'Romantic and intimate connections', '💕', 8, true, false),
    ('luck', 'Luck', '运气', 'Fortune and serendipity', '🍀', 9, true, false),
    ('macro_vision', 'Macro Vision', '宏观愿景', 'Big picture goals and world events', '🌍', 10, true, true)
ON CONFLICT (slug) DO NOTHING;

-- Update trigger for categories
CREATE TRIGGER update_categories_updated_at 
    BEFORE UPDATE ON public.categories 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update category stats
CREATE OR REPLACE FUNCTION update_category_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update old category stats if category changed
    IF TG_OP = 'UPDATE' AND OLD.category IS DISTINCT FROM NEW.category THEN
        IF OLD.category IS NOT NULL THEN
            UPDATE public.categories
            SET 
                markets_count = GREATEST(markets_count - 1, 0),
                total_volume = total_volume - COALESCE(OLD.total_volume, 0)
            WHERE slug = OLD.category;
        END IF;
    END IF;
    
    -- Update new category stats
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.category IS DISTINCT FROM NEW.category) THEN
        IF NEW.category IS NOT NULL THEN
            UPDATE public.categories
            SET 
                markets_count = markets_count + 1,
                total_volume = total_volume + COALESCE(NEW.total_volume, 0)
            WHERE slug = NEW.category;
        END IF;
    END IF;
    
    -- Handle deletion
    IF TG_OP = 'DELETE' AND OLD.category IS NOT NULL THEN
        UPDATE public.categories
        SET 
            markets_count = GREATEST(markets_count - 1, 0),
            total_volume = total_volume - COALESCE(OLD.total_volume, 0)
        WHERE slug = OLD.category;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update category stats when markets are created/updated/deleted
CREATE TRIGGER update_category_stats_on_market_change
    AFTER INSERT OR UPDATE OF category, total_volume OR DELETE ON public.markets
    FOR EACH ROW
    EXECUTE FUNCTION update_category_stats();

-- Add frequency column to markets table for filtering
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'all';
ALTER TABLE public.markets ADD CONSTRAINT markets_frequency_check 
    CHECK (frequency IS NULL OR frequency IN ('all', 'daily', 'weekly', 'monthly'));

-- Add volume_24h column for 24-hour volume tracking
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS volume_24h BIGINT DEFAULT 0;

-- Index for new columns
CREATE INDEX IF NOT EXISTS idx_markets_frequency ON public.markets(frequency);
CREATE INDEX IF NOT EXISTS idx_markets_volume_24h ON public.markets(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_markets_liquidity ON public.markets(liquidity DESC);
CREATE INDEX IF NOT EXISTS idx_markets_tip_amount_sort ON public.markets(tip_amount DESC NULLS LAST);

-- Function to refresh 24h volume (can be called by cron job)
CREATE OR REPLACE FUNCTION refresh_market_24h_volumes()
RETURNS VOID AS $$
BEGIN
    UPDATE public.markets m
    SET volume_24h = COALESCE(
        (SELECT SUM(t.total_cost) 
         FROM public.trades t 
         WHERE t.market_id = m.id 
         AND t.created_at > NOW() - INTERVAL '24 hours'),
        0
    ),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- View for category statistics
CREATE OR REPLACE VIEW category_stats AS
SELECT 
    c.id,
    c.slug,
    c.name,
    c.name_zh,
    c.icon,
    c.color,
    c.display_order,
    c.is_active,
    c.is_featured,
    COUNT(m.id) as actual_markets_count,
    COALESCE(SUM(m.total_volume), 0) as actual_total_volume,
    COALESCE(SUM(m.volume_24h), 0) as volume_24h,
    COUNT(m.id) FILTER (WHERE m.status = 'active') as active_markets_count
FROM public.categories c
LEFT JOIN public.markets m ON c.slug = m.category
WHERE c.is_active = true
GROUP BY c.id, c.slug, c.name, c.name_zh, c.icon, c.color, c.display_order, c.is_active, c.is_featured
ORDER BY c.display_order;

COMMENT ON TABLE public.categories IS 'Category/tag management table for markets';
COMMENT ON COLUMN public.categories.slug IS 'Unique category identifier for URL/API';
COMMENT ON COLUMN public.categories.frequency IS 'Market frequency: all, daily, weekly, monthly';
COMMENT ON COLUMN public.markets.volume_24h IS '24h trading volume (USDC lamports)';

SELECT 'Categories management system migration completed!' AS status;
