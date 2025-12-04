-- Add RLS policy to allow admin user to delete policy_versions
-- This enables the admin dashboard cache management functionality

-- Create policy for admin to delete
CREATE POLICY "Admin can delete policy versions" 
    ON public.policy_versions 
    FOR DELETE 
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = 'policyparser.admin@gmail.com'
    );

-- Also allow admin to update if needed
CREATE POLICY "Admin can update policy versions" 
    ON public.policy_versions 
    FOR UPDATE 
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = 'policyparser.admin@gmail.com'
    );
