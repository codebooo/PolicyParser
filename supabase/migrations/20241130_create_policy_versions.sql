-- Create policy_versions table for caching and versioning policy analyses
-- This table stores historical versions of analyzed policies for comparison

CREATE TABLE IF NOT EXISTS public.policy_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Domain/URL identification
    domain TEXT NOT NULL,
    policy_type TEXT NOT NULL DEFAULT 'privacy', -- privacy, terms, cookies, etc.
    policy_url TEXT,
    
    -- Content fingerprinting for change detection
    content_hash TEXT NOT NULL, -- SHA256 of the raw policy text
    
    -- Policy content (raw text)
    raw_text TEXT, -- Original extracted text
    
    -- Complete AI analysis results
    analysis_data JSONB NOT NULL, -- Full analysis object
    score INTEGER, -- Privacy score 0-100
    
    -- Policy metadata
    policy_last_modified TIMESTAMP WITH TIME ZONE, -- From HTTP headers if available
    word_count INTEGER,
    
    -- Timestamps
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Index for efficient lookup by domain+type+hash
    UNIQUE(domain, policy_type, content_hash)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_policy_versions_domain ON public.policy_versions(domain);
CREATE INDEX IF NOT EXISTS idx_policy_versions_domain_type ON public.policy_versions(domain, policy_type);
CREATE INDEX IF NOT EXISTS idx_policy_versions_analyzed_at ON public.policy_versions(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_versions_content_hash ON public.policy_versions(content_hash);

-- Create a materialized view for latest versions per domain/type
CREATE OR REPLACE VIEW public.policy_versions_latest AS
SELECT DISTINCT ON (domain, policy_type) *
FROM public.policy_versions
ORDER BY domain, policy_type, analyzed_at DESC;

-- Enable Row Level Security
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;

-- Policies for RLS - everyone can read (cached analyses are public)
CREATE POLICY "Anyone can view policy versions" 
    ON public.policy_versions 
    FOR SELECT 
    TO public
    USING (true);

-- Only authenticated users or service role can insert new versions
CREATE POLICY "Authenticated users can insert policy versions" 
    ON public.policy_versions 
    FOR INSERT 
    TO authenticated, service_role
    WITH CHECK (true);

-- Only service role can update/delete (for cleanup tasks)
CREATE POLICY "Service role can update policy versions" 
    ON public.policy_versions 
    FOR UPDATE 
    TO service_role
    USING (true);

CREATE POLICY "Service role can delete policy versions" 
    ON public.policy_versions 
    FOR DELETE 
    TO service_role
    USING (true);

-- Grant permissions
GRANT SELECT ON public.policy_versions TO anon;
GRANT SELECT ON public.policy_versions TO authenticated;
GRANT ALL ON public.policy_versions TO service_role;

GRANT SELECT ON public.policy_versions_latest TO anon;
GRANT SELECT ON public.policy_versions_latest TO authenticated;
GRANT SELECT ON public.policy_versions_latest TO service_role;

-- ============================================
-- Create user_policy_history for PRO users to track which versions they've viewed
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_policy_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    policy_version_id UUID NOT NULL REFERENCES public.policy_versions(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, policy_version_id)
);

CREATE INDEX IF NOT EXISTS idx_user_policy_history_user ON public.user_policy_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_policy_history_version ON public.user_policy_history(policy_version_id);

ALTER TABLE public.user_policy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own history" 
    ON public.user_policy_history 
    FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own history" 
    ON public.user_policy_history 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.user_policy_history TO authenticated;

-- ============================================
-- Helper function to get all versions for a domain/policy type
-- ============================================

CREATE OR REPLACE FUNCTION get_policy_version_history(
    p_domain TEXT,
    p_policy_type TEXT DEFAULT 'privacy',
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    domain TEXT,
    policy_type TEXT,
    policy_url TEXT,
    content_hash TEXT,
    score INTEGER,
    word_count INTEGER,
    analyzed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pv.id,
        pv.domain,
        pv.policy_type,
        pv.policy_url,
        pv.content_hash,
        pv.score,
        pv.word_count,
        pv.analyzed_at
    FROM public.policy_versions pv
    WHERE pv.domain = p_domain
      AND pv.policy_type = p_policy_type
    ORDER BY pv.analyzed_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION get_policy_version_history TO anon;
GRANT EXECUTE ON FUNCTION get_policy_version_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_policy_version_history TO service_role;
