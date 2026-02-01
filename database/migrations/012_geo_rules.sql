-- ============================================================
-- Geo Rules Table for IP/Country-based Access Control
-- ============================================================

CREATE TABLE IF NOT EXISTS public.geo_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type TEXT NOT NULL,  -- 'country_block', 'country_allow', 'ip_block', 'ip_allow'
    value TEXT NOT NULL,      -- Country code (e.g., 'US') or IP/CIDR (e.g., '1.2.3.4', '10.0.0.0/8')
    description TEXT,         -- Human-readable description
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id),
    
    CONSTRAINT geo_rules_type_check CHECK (rule_type IN ('country_block', 'country_allow', 'ip_block', 'ip_allow'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_geo_rules_enabled ON public.geo_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_geo_rules_type ON public.geo_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_geo_rules_value ON public.geo_rules(value);

-- RLS
ALTER TABLE public.geo_rules ENABLE ROW LEVEL SECURITY;

-- Only admins can manage geo rules
CREATE POLICY "Geo rules are viewable by admins" ON public.geo_rules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()::uuid
            AND u.preferences->>'isAdmin' = 'true'
        )
    );

-- Insert default blocked countries (can be modified via admin panel)
INSERT INTO public.geo_rules (rule_type, value, description, enabled)
VALUES 
    ('country_block', 'US', 'United States - regulatory restrictions', true),
    ('country_block', 'KP', 'North Korea - sanctions', true),
    ('country_block', 'IR', 'Iran - sanctions', true),
    ('country_block', 'SY', 'Syria - sanctions', true),
    ('country_block', 'CU', 'Cuba - sanctions', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.geo_rules IS 'Geographic access control rules for IP/country-based restrictions';
COMMENT ON COLUMN public.geo_rules.rule_type IS 'Type of rule: country_block, country_allow, ip_block, ip_allow';
COMMENT ON COLUMN public.geo_rules.value IS 'Country ISO code (e.g., US) or IP/CIDR (e.g., 1.2.3.4, 10.0.0.0/8)';

SELECT 'Geo rules migration completed' AS status;
