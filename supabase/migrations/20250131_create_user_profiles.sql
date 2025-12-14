-- Create user_profiles table for personalized risk assessment
-- This table stores user preferences, goals, and privacy concerns

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- User location for jurisdiction-based recommendations
    region TEXT, -- 'EU', 'US_CA', 'US_OTHER', 'UK', 'OTHER'
    country_code TEXT, -- ISO 3166-1 alpha-2
    
    -- User goals (what they want to achieve with PolicyParser)
    goals TEXT[] DEFAULT '{}', -- Array of goal keys
    -- Options: 'avoid_data_selling', 'limit_tracking', 'protect_family', 
    -- 'business_compliance', 'find_safe_alternatives', 'monitor_changes',
    -- 'understand_rights', 'minimize_sharing'
    
    -- Custom concerns (user-defined priorities)
    custom_concerns TEXT[] DEFAULT '{}',
    
    -- Industry focus (for professional users)
    industry TEXT, -- 'healthcare', 'finance', 'education', 'tech', 'retail', 'other'
    
    -- Family protection settings
    has_minors_in_household BOOLEAN DEFAULT FALSE,
    
    -- Breach monitoring
    hibp_checked_at TIMESTAMP WITH TIME ZONE,
    hibp_breach_count INTEGER DEFAULT 0,
    hibp_breaches JSONB, -- Array of breach names
    
    -- Calculated scores
    personal_risk_score INTEGER, -- 0-100, calculated based on analyses + breaches
    last_risk_calculation TIMESTAMP WITH TIME ZONE,
    
    -- Email preferences
    email_on_policy_change BOOLEAN DEFAULT TRUE,
    email_on_score_drop BOOLEAN DEFAULT TRUE,
    email_weekly_digest BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- Create user_analyzed_services table to track which services a user has analyzed
CREATE TABLE IF NOT EXISTS public.user_analyzed_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    
    -- Latest analysis reference
    latest_version_id UUID REFERENCES public.policy_versions(id),
    latest_score INTEGER,
    
    -- User's personal notes/flags
    is_favorite BOOLEAN DEFAULT FALSE,
    user_notes TEXT,
    risk_acknowledged BOOLEAN DEFAULT FALSE,
    
    -- Tracking
    first_analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    analysis_count INTEGER DEFAULT 1,
    
    UNIQUE(user_id, domain)
);

-- Create policy_changelogs table for AI-generated change summaries
CREATE TABLE IF NOT EXISTS public.policy_changelogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    policy_type TEXT NOT NULL DEFAULT 'privacy',
    
    -- Version references
    old_version_id UUID REFERENCES public.policy_versions(id),
    new_version_id UUID REFERENCES public.policy_versions(id) NOT NULL,
    
    -- Score changes
    old_score INTEGER,
    new_score INTEGER NOT NULL,
    score_change INTEGER, -- Positive = improved, negative = worse
    
    -- AI-generated changelog
    changelog_summary TEXT NOT NULL, -- Brief summary of changes
    changelog_items JSONB NOT NULL, -- Array of individual changes
    -- Structure: [{ type: 'WORSE'|'BETTER'|'NEUTRAL', severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW', text: '...', category: '...' }]
    
    -- Severity classification
    overall_severity TEXT, -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'POSITIVE'
    
    -- Statistics
    additions_count INTEGER DEFAULT 0,
    removals_count INTEGER DEFAULT 0,
    modifications_count INTEGER DEFAULT 0,
    
    -- Timestamps
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(domain, policy_type, old_version_id, new_version_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_region ON public.user_profiles(region);
CREATE INDEX IF NOT EXISTS idx_user_analyzed_services_user_id ON public.user_analyzed_services(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analyzed_services_domain ON public.user_analyzed_services(domain);
CREATE INDEX IF NOT EXISTS idx_policy_changelogs_domain ON public.policy_changelogs(domain);
CREATE INDEX IF NOT EXISTS idx_policy_changelogs_detected_at ON public.policy_changelogs(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_changelogs_severity ON public.policy_changelogs(overall_severity);

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_analyzed_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_changelogs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view their own profile" 
    ON public.user_profiles FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
    ON public.user_profiles FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
    ON public.user_profiles FOR UPDATE 
    USING (auth.uid() = user_id);

-- RLS Policies for user_analyzed_services
CREATE POLICY "Users can view their own analyzed services" 
    ON public.user_analyzed_services FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analyzed services" 
    ON public.user_analyzed_services FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyzed services" 
    ON public.user_analyzed_services FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyzed services" 
    ON public.user_analyzed_services FOR DELETE 
    USING (auth.uid() = user_id);

-- RLS Policies for policy_changelogs (public read, admin write)
CREATE POLICY "Anyone can view policy changelogs" 
    ON public.policy_changelogs FOR SELECT 
    USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trigger_update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_user_profiles_updated_at();
