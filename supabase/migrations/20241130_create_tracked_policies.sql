-- Create tracked_policies table for policy tracking feature
-- This table stores policies that users want to track for changes

CREATE TABLE IF NOT EXISTS public.tracked_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    policy_url TEXT,
    policy_hash TEXT,
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_analysis JSONB,
    has_changes BOOLEAN DEFAULT FALSE,
    previous_analysis JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one user can only track one entry per domain
    UNIQUE(user_id, domain)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tracked_policies_user_id ON public.tracked_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_policies_domain ON public.tracked_policies(domain);
CREATE INDEX IF NOT EXISTS idx_tracked_policies_has_changes ON public.tracked_policies(has_changes);

-- Enable Row Level Security
ALTER TABLE public.tracked_policies ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
-- Users can only see their own tracked policies
CREATE POLICY "Users can view their own tracked policies" 
    ON public.tracked_policies 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Users can insert their own tracked policies
CREATE POLICY "Users can insert their own tracked policies" 
    ON public.tracked_policies 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own tracked policies
CREATE POLICY "Users can update their own tracked policies" 
    ON public.tracked_policies 
    FOR UPDATE 
    USING (auth.uid() = user_id);

-- Users can delete their own tracked policies
CREATE POLICY "Users can delete their own tracked policies" 
    ON public.tracked_policies 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tracked_policies_updated_at
    BEFORE UPDATE ON public.tracked_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.tracked_policies TO authenticated;
GRANT ALL ON public.tracked_policies TO service_role;
