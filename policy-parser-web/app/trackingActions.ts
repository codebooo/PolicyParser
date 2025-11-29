"use server";

import { createClient } from '@/utils/supabase/server';

export async function trackPolicy(domain: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Must be logged in" };

    // Check if already tracked
    const { data: existing } = await supabase
        .from('tracked_policies')
        .select('id')
        .eq('user_id', user.id)
        .eq('domain', domain)
        .single();

    if (existing) return { success: true, message: "Already tracking" };

    const { error } = await supabase
        .from('tracked_policies')
        .insert({
            user_id: user.id,
            domain,
            last_checked: new Date().toISOString()
        });

    if (error) {
        console.error("Track error:", error);
        return { success: false, error: "Failed to track policy" };
    }

    return { success: true };
}

export async function untrackPolicy(domain: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Must be logged in" };

    const { error } = await supabase
        .from('tracked_policies')
        .delete()
        .eq('user_id', user.id)
        .eq('domain', domain);

    if (error) return { success: false, error: "Failed to untrack" };

    return { success: true };
}

export async function getTrackedPolicies() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

    const { data } = await supabase
        .from('tracked_policies')
        .select('*')
        .eq('user_id', user.id);

    return data || [];
}

/**
 * Check all tracked policies for updates.
 * TODO: Re-implement with the new analyzeDomain API once stable.
 * This would ideally be called by a Cron Job or manually by the user.
 */
export async function checkTrackedPoliciesForUpdates(): Promise<{ success: boolean; updates?: { domain: string }[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: "Must be logged in" };
    }

    // Get all tracked policies for this user
    const { data: policies, error } = await supabase
        .from('tracked_policies')
        .select('*')
        .eq('user_id', user.id);

    if (error) {
        return { success: false, error: "Failed to fetch tracked policies" };
    }

    if (!policies || policies.length === 0) {
        return { success: true, updates: [] };
    }

    // TODO: For now, return empty updates. 
    // Full implementation would re-analyze each domain and compare with stored analysis.
    // This requires significant work to:
    // 1. Re-fetch and analyze each policy
    // 2. Compare with previous analysis stored in DB
    // 3. Detect meaningful changes
    
    // Update last_checked timestamp for all policies
    const now = new Date().toISOString();
    await supabase
        .from('tracked_policies')
        .update({ last_checked: now })
        .eq('user_id', user.id);

    return { success: true, updates: [] };
}
