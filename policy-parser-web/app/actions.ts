'use server';

import { createStreamableValue } from '@ai-sdk/rsc';
import { identifyTarget } from './lib/identifier';
import { PolicyDiscoveryEngine } from './lib/discovery/Engine';
import { extractPolicyContent } from './lib/extractor';
import { SYSTEM_PROMPT, USER_PROMPT } from './lib/analyzer/prompt';
import { calculateScore } from './lib/analyzer/scorer';
import { AnalysisResultSchema } from './lib/types/analysis';
import { generateObject } from 'ai';
import { getGeminiModel } from './lib/ai/gemini';
import { createClient } from '@/utils/supabase/server';
import { logger } from './lib/logger';
import { CONFIG, PolicyType } from './lib/config';
import { checkPolicyCache, savePolicyVersion } from './versionActions';
import { getCarl, extractCarlFeatures, getCarlFeatureNames, CARL_FEATURE_COUNT } from './lib/carl';
import { addToQueue, getNextQueueItem, updateQueueStatus, getQueueStats } from './lib/scraper/queue';
import { fetchHtml } from './lib/extractor/fetcher';

/**
 * Simple function to find and fetch a policy for testing purposes
 * Used by /api/test-pawd and /api/test-ironclad endpoints
 */
export async function findAndFetchPolicy(input: string): Promise<{
    success: boolean;
    url?: string;
    date?: string;
    textLength?: number;
    text?: string;
    error?: string;
}> {
    try {
        // Step 1: Identify the target
        const identity = await identifyTarget(input);
        logger.info('findAndFetchPolicy: Identified', identity);

        // Step 2: Discover policy URL
        const engine = new PolicyDiscoveryEngine();
        const candidate = await engine.discover(identity.cleanDomain);

        if (!candidate) {
            return {
                success: false,
                error: `Could not find a privacy policy for ${identity.cleanDomain}`
            };
        }

        logger.info('findAndFetchPolicy: Found policy', candidate);

        // Step 3: Extract content to verify it works
        const extracted = await extractPolicyContent(candidate.url);

        return {
            success: true,
            url: candidate.url,
            date: new Date().toISOString(),
            textLength: extracted.rawLength,
            text: extracted.markdown
        };
    } catch (error: any) {
        logger.error('findAndFetchPolicy failed', error);
        return {
            success: false,
            error: error?.message || 'Unknown error'
        };
    }
}

/**
 * Analyze a policy text (for testing endpoints)
 * Used by /api/test-ironclad
 */
export async function analyzePolicy(text: string, url: string, userId?: string): Promise<{
    privacyScore: number;
    summary: string;
    risks?: any[];
}> {
    const { object: analysis } = await generateObject({
        model: getGeminiModel(),
        system: SYSTEM_PROMPT,
        prompt: USER_PROMPT(text),
        schema: AnalysisResultSchema,
        mode: 'json'
    });

    const score = calculateScore(analysis);

    return {
        privacyScore: score,
        summary: analysis.summary,
        risks: analysis.key_findings
    };
}

export async function analyzeDomain(input: string) {
    const stream = createStreamableValue({
        status: 'initializing',
        message: 'Initializing analysis...',
        step: 0,
        data: null as any
    });

    (async () => {
        try {
            // Step 1: Identification
            stream.update({ status: 'identifying', message: `Verifying ${input}...`, step: 1, data: null });
            const identity = await identifyTarget(input);
            logger.info('Identity verified', identity);

            // Step 2: Check cache FIRST - save API credits! 💰
            stream.update({ status: 'checking_cache', message: `Checking for cached analysis...`, step: 2, data: null });
            const cacheResult = await checkPolicyCache(identity.cleanDomain, 'privacy');

            if (cacheResult.isCached && cacheResult.isUpToDate && cacheResult.cachedVersion) {
                logger.info('🎉 CACHE HIT! Using cached analysis - saving API credits!');
                stream.update({ status: 'cache_hit', message: `Found up-to-date cached analysis! Saving API credits...`, step: 3, data: null });

                const cachedData = {
                    ...cacheResult.cachedVersion.analysis_data,
                    url: cacheResult.cachedVersion.policy_url,
                    domain: identity.cleanDomain,
                    rawPolicyText: cacheResult.cachedVersion.raw_text,
                    fromCache: true,
                    cachedAt: cacheResult.cachedVersion.analyzed_at,
                    versionId: cacheResult.cachedVersion.id
                };

                stream.done({ status: 'complete', message: 'Analysis complete! (from cache)', step: 4, data: cachedData });
                return;
            }

            logger.info('Cache miss or outdated - performing fresh analysis');

            // Step 3: Discovery
            stream.update({ status: 'discovering', message: `Searching for policy on ${identity.cleanDomain}...`, step: 3, data: null });
            const engine = new PolicyDiscoveryEngine();
            const candidate = await engine.discover(identity.cleanDomain);

            if (!candidate) {
                throw new Error(`Could not find a privacy policy for ${identity.cleanDomain}`);
            }
            logger.info('Policy found', candidate);

            // Step 4: Extraction
            stream.update({ status: 'extracting', message: `Reading policy from ${candidate.url}...`, step: 4, data: null });
            const extracted = await extractPolicyContent(candidate.url);
            logger.info('Content extracted', { length: extracted.rawLength });

            // Step 5: Analysis (using Gemini with key rotation)
            stream.update({ status: 'analyzing', message: 'Analyzing legal text (this may take a moment)...', step: 5, data: null });

            const { object: analysis } = await generateObject({
                model: getGeminiModel(),
                system: SYSTEM_PROMPT,
                prompt: USER_PROMPT(extracted.markdown),
                schema: AnalysisResultSchema,
                mode: 'json'
            });

            // Calculate Score Deterministically
            const score = calculateScore(analysis);
            analysis.score = score;

            // Add URL and raw text to results
            const resultsWithUrl = {
                ...analysis,
                url: candidate.url,
                domain: identity.cleanDomain,
                rawPolicyText: extracted.markdown // Include the original extracted text
            };

            // Step 6: Save to cache (version history) 📦
            stream.update({ status: 'caching', message: 'Caching results for future use...', step: 6, data: null });
            const versionResult = await savePolicyVersion(
                identity.cleanDomain,
                'privacy',
                candidate.url,
                extracted.markdown,
                analysis,
                score
            );

            if (versionResult.success) {
                logger.info(`Saved to version cache: ${versionResult.versionId}`);
                (resultsWithUrl as any).versionId = versionResult.versionId;
            }

            // Step 7: Save to user's analysis history
            stream.update({ status: 'saving', message: 'Saving results...', step: 7, data: null });
            const supabase = await createClient();

            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                await supabase.from('analyses').insert({
                    user_id: user.id,
                    domain: identity.cleanDomain,
                    company_name: identity.originalInput,
                    policy_url: candidate.url,
                    score: score,
                    summary: analysis.summary,
                    key_findings: analysis.key_findings,
                    data_collected: analysis.data_collected,
                    third_party_sharing: analysis.third_party_sharing,
                    user_rights: analysis.user_rights,
                    contact_info: analysis.contact_info,
                    raw_text: extracted.markdown
                });
            }

            stream.done({ status: 'complete', message: 'Analysis complete!', step: 8, data: resultsWithUrl });

        } catch (error: any) {
            logger.error('Analysis failed', error);
            const errorMessage = error?.message || 'An unexpected error occurred';
            stream.done({ status: 'error', message: errorMessage, step: -1, data: null });
        }
    })();

    return { output: stream.value };
}

/**
 * Internal (non-streaming) version of analyzeDomain for server-to-server calls
 * Used by tracking system to check for policy updates
 */
export async function analyzeDomainInternal(input: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
}> {
    try {
        // Step 1: Identification
        const identity = await identifyTarget(input);
        logger.info('Internal analysis: Identity verified', identity);

        // Step 2: Discovery
        const engine = new PolicyDiscoveryEngine();
        const candidate = await engine.discover(identity.cleanDomain);

        if (!candidate) {
            return { success: false, error: `Could not find a privacy policy for ${identity.cleanDomain}` };
        }
        logger.info('Internal analysis: Policy found', candidate);

        // Step 3: Extraction
        const extracted = await extractPolicyContent(candidate.url);
        logger.info('Internal analysis: Content extracted', { length: extracted.rawLength });

        // Step 4: Analysis
        const { object: analysis } = await generateObject({
            model: getGeminiModel(),
            system: SYSTEM_PROMPT,
            prompt: USER_PROMPT(extracted.markdown),
            schema: AnalysisResultSchema,
            mode: 'json'
        });

        // Calculate Score
        const score = calculateScore(analysis);
        analysis.score = score;

        // Add URL and raw text to results
        const resultsWithUrl = {
            ...analysis,
            url: candidate.url,
            domain: identity.cleanDomain,
            rawPolicyText: extracted.markdown
        };

        return { success: true, data: resultsWithUrl };
    } catch (error: any) {
        logger.error('Internal analysis failed', error);
        return { success: false, error: error?.message || 'An unexpected error occurred' };
    }
}

/**
 * Analyze policy text directly (for file uploads and paste text)
 * Streaming version for UI with progress updates
 */
export async function analyzeText(text: string, sourceName?: string) {
    const stream = createStreamableValue({
        status: 'initializing',
        message: 'Initializing analysis...',
        step: 0,
        data: null as any
    });

    (async () => {
        try {
            // Validate input
            if (!text || text.trim().length < 100) {
                throw new Error('Text is too short. Please provide at least 100 characters of policy text.');
            }

            // Step 1: Analyzing
            stream.update({ status: 'analyzing', message: 'Analyzing legal text (this may take a moment)...', step: 1, data: null });

            const { object: analysis } = await generateObject({
                model: getGeminiModel(),
                system: SYSTEM_PROMPT,
                prompt: USER_PROMPT(text),
                schema: AnalysisResultSchema,
                mode: 'json'
            });

            // Calculate Score Deterministically
            const score = calculateScore(analysis);
            analysis.score = score;

            // Add metadata to results
            const resultsWithMeta = {
                ...analysis,
                url: null, // No URL for uploaded/pasted text
                domain: sourceName || 'Uploaded Document',
                rawPolicyText: text
            };

            // Step 2: Save to DB (if user is logged in)
            stream.update({ status: 'saving', message: 'Saving results...', step: 2, data: null });
            const supabase = await createClient();

            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                await supabase.from('analyses').insert({
                    user_id: user.id,
                    domain: sourceName || 'uploaded_document',
                    company_name: sourceName || 'Uploaded Document',
                    policy_url: null,
                    score: score,
                    summary: analysis.summary,
                    key_findings: analysis.key_findings,
                    data_collected: analysis.data_collected,
                    third_party_sharing: analysis.third_party_sharing,
                    user_rights: analysis.user_rights,
                    contact_info: analysis.contact_info,
                    raw_text: text.substring(0, 50000) // Limit stored text size
                });
            }

            stream.done({ status: 'complete', message: 'Analysis complete!', step: 3, data: resultsWithMeta });

        } catch (error: any) {
            logger.error('Text analysis failed', error);
            const errorMessage = error?.message || 'An unexpected error occurred';
            stream.done({ status: 'error', message: errorMessage, step: -1, data: null });
        }
    })();

    return { output: stream.value };
}

/**
 * PRO FEATURE: Discover all available policies for a company
 * Returns a list of found policy types and their URLs
 * 
 * NEW v2.0 INTELLIGENT APPROACH:
 * 1. Check SPECIAL_DOMAINS config first (verified company URLs)
 * 2. Deep footer crawling (policies are almost always in footers)
 * 3. Legal hub discovery (/legal, /policies pages)
 * 4. Sitemap parsing for policy URLs
 * 5. CONTENT VALIDATION - verify the page is actually a policy document
 * 6. Search engine fallback with content validation
 * 
 * This approach doesn't just append "/privacy" to URLs - it intelligently
 * crawls, validates, and verifies that discovered URLs are ACTUAL policy documents.
 */
export async function discoverAllPolicies(input: string): Promise<{
    success: boolean;
    domain?: string;
    policies?: { type: PolicyType; name: string; url: string }[];
    error?: string;
}> {
    try {
        logger.info(`[discoverAllPolicies] Starting intelligent discovery for: ${input}`);

        const identity = await identifyTarget(input);
        const domain = identity.cleanDomain;

        logger.info(`[discoverAllPolicies] Resolved domain: ${domain}`);

        // Use the new intelligent discovery engine
        const { discoverPolicies } = await import('./lib/discovery/index');
        const result = await discoverPolicies(domain);

        if (!result.success) {
            return {
                success: false,
                error: result.error || 'Discovery failed'
            };
        }

        // Convert to the expected format
        const foundPolicies = result.policies.map(p => ({
            type: p.type,
            name: p.name,
            url: p.url
        }));

        logger.info(`[discoverAllPolicies] Intelligent discovery complete! Found ${foundPolicies.length} validated policies`);
        logger.info(`[discoverAllPolicies] Phases: ${result.phasesCompleted.join(' -> ')}`);

        return {
            success: true,
            domain,
            policies: foundPolicies
        };
    } catch (error: any) {
        logger.error('[discoverAllPolicies] Discovery failed', error);
        return {
            success: false,
            error: error?.message || 'Failed to discover policies'
        };
    }
}

/**
 * PRO FEATURE: Analyze a specific policy URL
 * For use after discoverAllPolicies to analyze individual policies
 * Now with caching support to save API credits! 💰
 */
export async function analyzeSpecificPolicy(url: string, policyType: string, domain?: string) {
    const stream = createStreamableValue({
        status: 'initializing',
        message: 'Initializing analysis...',
        step: 0,
        data: null as any,
        policyType
    });

    (async () => {
        try {
            logger.info(`[analyzeSpecificPolicy] Starting analysis for ${policyType}`, { url });

            // Try to extract domain from URL if not provided
            let policyDomain = domain;
            if (!policyDomain) {
                try {
                    policyDomain = new URL(url).hostname.replace(/^www\./, '');
                } catch {
                    policyDomain = 'unknown';
                }
            }

            // Map policy name to type for caching
            const cacheType = policyType.toLowerCase()
                .replace(/privacy policy/i, 'privacy')
                .replace(/terms of service|terms & conditions|terms/i, 'terms')
                .replace(/cookie policy|cookies/i, 'cookies')
                .replace(/data processing|dpa/i, 'dpa')
                .replace(/acceptable use|aup/i, 'aup')
                .replace(/security/i, 'security');

            // Step 1: Check cache first 💰
            stream.update({ status: 'checking_cache', message: `Checking cache for ${policyType}...`, step: 1, data: null, policyType });
            const cacheResult = await checkPolicyCache(policyDomain, cacheType);

            if (cacheResult.isCached && cacheResult.isUpToDate && cacheResult.cachedVersion) {
                logger.info(`🎉 CACHE HIT for ${policyType}! Using cached analysis`);
                stream.update({ status: 'cache_hit', message: `Found cached ${policyType}! Saving API credits...`, step: 2, data: null, policyType });

                const cachedData = {
                    ...cacheResult.cachedVersion.analysis_data,
                    url: cacheResult.cachedVersion.policy_url || url,
                    policyType,
                    rawPolicyText: cacheResult.cachedVersion.raw_text,
                    fromCache: true,
                    cachedAt: cacheResult.cachedVersion.analyzed_at,
                    versionId: cacheResult.cachedVersion.id
                };

                stream.done({ status: 'complete', message: 'Analysis complete! (from cache)', step: 3, data: cachedData, policyType });
                return;
            }

            logger.info(`Cache miss for ${policyType} - performing fresh analysis`);

            // Step 2: Extract content
            stream.update({ status: 'extracting', message: `Reading ${policyType}...`, step: 2, data: null, policyType });

            let extracted;
            try {
                extracted = await extractPolicyContent(url);
                logger.info(`[analyzeSpecificPolicy] ${policyType} content extracted successfully`, {
                    length: extracted.rawLength,
                    title: extracted.title,
                    url: extracted.url
                });
            } catch (extractError: any) {
                logger.error(`[analyzeSpecificPolicy] ${policyType} extraction failed`, {
                    url,
                    error: extractError?.message,
                    stack: extractError?.stack
                });
                throw new Error(`Failed to extract ${policyType} content: ${extractError?.message || 'Unknown extraction error'}`);
            }

            // Step 3: AI Analysis
            stream.update({ status: 'analyzing', message: `Analyzing ${policyType}...`, step: 3, data: null, policyType });

            let analysis;
            try {
                const result = await generateObject({
                    model: getGeminiModel(),
                    system: SYSTEM_PROMPT,
                    prompt: USER_PROMPT(extracted.markdown),
                    schema: AnalysisResultSchema,
                    mode: 'json'
                });
                analysis = result.object;
                logger.info(`[analyzeSpecificPolicy] ${policyType} AI analysis complete`);
            } catch (aiError: any) {
                logger.error(`[analyzeSpecificPolicy] ${policyType} AI analysis failed`, {
                    error: aiError?.message,
                    stack: aiError?.stack
                });
                throw new Error(`AI analysis failed for ${policyType}: ${aiError?.message || 'Unknown AI error'}`);
            }

            const score = calculateScore(analysis);
            analysis.score = score;

            // Step 4: Save to cache 📦
            stream.update({ status: 'caching', message: `Caching ${policyType}...`, step: 4, data: null, policyType });
            const versionResult = await savePolicyVersion(
                policyDomain,
                cacheType,
                url,
                extracted.markdown,
                analysis,
                score
            );

            const resultsWithMeta = {
                ...analysis,
                url,
                policyType,
                rawPolicyText: extracted.markdown,
                versionId: versionResult.versionId
            };

            logger.info(`[analyzeSpecificPolicy] ${policyType} complete`, { score, url, versionId: versionResult.versionId });
            stream.done({ status: 'complete', message: 'Analysis complete!', step: 5, data: resultsWithMeta, policyType });

        } catch (error: any) {
            logger.error(`[analyzeSpecificPolicy] ${policyType} analysis failed`, {
                url,
                error: error?.message,
                stack: error?.stack
            });
            const errorMessage = error?.message || 'An unexpected error occurred';
            stream.done({ status: 'error', message: errorMessage, step: -1, data: null, policyType });
        }
    })();

    return { output: stream.value };
}

/**
 * Submit feedback to train the Neural Network
 * @param domain The domain being analyzed
 * @param correctUrl The URL that is definitely correct (Reward +1)
 * @param incorrectUrl Optional URL that was wrong (Reward 0)
 */
export async function submitPolicyFeedback(
    domain: string,
    correctUrl: string,
    incorrectUrl?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        logger.info(`[Feedback] Received feedback for ${domain}`);

        const carl = await getCarl();

        // Train Carl on Correct URL (Target = 1)
        // We need to fetch the page to extract features properly
        try {
            const html = await fetchHtml(correctUrl).catch(() => '');
            const features = extractCarlFeatures(
                html.substring(0, 1000), 
                correctUrl, 
                'footer', 
                domain,
                html // Pass full content for better feature extraction
            );
            await carl.train(features, 1, domain, correctUrl);
            logger.info(`[Feedback] Carl trained positive on ${correctUrl}`);
        } catch (e) {
            logger.warn(`[Feedback] Failed to fetch correct URL for Carl training: ${correctUrl}`);
        }

        // Train Carl on Incorrect URL (Target = 0)
        if (incorrectUrl) {
            try {
                const html = await fetchHtml(incorrectUrl).catch(() => '');
                const features = extractCarlFeatures(
                    html.substring(0, 1000), 
                    incorrectUrl, 
                    'footer', 
                    domain,
                    html
                );
                await carl.train(features, 0, domain, incorrectUrl);
                logger.info(`[Feedback] Carl trained negative on ${incorrectUrl}`);
            } catch (e) {
                logger.warn(`[Feedback] Failed to fetch incorrect URL for Carl training: ${incorrectUrl}`);
            }
        }

        return { success: true };
    } catch (error: any) {
        logger.error('[Feedback] Failed to process feedback', error);
        return { success: false, error: error.message };
    }
}

/**
 * Add domains to the background scraping queue
 */
export async function addDomainsToQueue(domains: string[]) {
    return await addToQueue(domains);
}

/**
 * Process the next item in the queue
 * This is called by the client (e.g., "Start Processing" button)
 */
export async function processNextQueueItem() {
    try {
        const item = await getNextQueueItem();
        if (!item) {
            return { success: false, message: 'Queue is empty' };
        }

        logger.info(`[Queue] Processing ${item.domain}...`);

        // Run discovery
        const result = await discoverAllPolicies(item.domain);

        // Update status
        if (result.success) {
            await updateQueueStatus(item.id, 'completed', result);
            return { success: true, domain: item.domain, result };
        } else {
            await updateQueueStatus(item.id, 'failed', { error: result.error });
            return { success: false, domain: item.domain, error: result.error };
        }
    } catch (error: any) {
        logger.error('[Queue] Processing failed', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get current queue statistics
 */
export async function getQueueStatus() {
    return await getQueueStats();
}

/**
 * Clears all cached policy versions from the database
 * Admin only feature
 */
export async function clearAllCache(): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
        const supabase = await createClient();

        // First count how many items we have
        const { count: beforeCount } = await supabase
            .from('policy_versions')
            .select('*', { count: 'exact', head: true });

        // Delete all records from policy_versions
        // Note: This requires a policy that allows deletion or being a service role/admin
        const { error } = await supabase
            .from('policy_versions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to delete all rows (delete requires a filter)

        if (error) {
            logger.error('Failed to clear cache', error);
            return { success: false, error: error.message };
        }

        logger.info(`Cleared ${beforeCount} items from cache`);
        return { success: true, count: beforeCount || 0 };
    } catch (error: any) {
        logger.error('Error clearing cache', error);
        return { success: false, error: error.message };
    }
}

/**
 * CARL BRAIN DASHBOARD ACTIONS
 * Exposed for the /brain page to visualize and train Carl
 */

export async function getBrainStats() {
    const carl = await getCarl();
    const stats = carl.getStats();
    
    return {
        generation: stats.generation,
        trainingCount: stats.trainingCount,
        accuracy: stats.accuracy,
        lastTrainedAt: stats.lastTrainedAt,
        architecture: stats.architecture,
        learningRate: stats.learningRate,
        status: stats.isInitialized ? 'Active' : 'Loading',
        featureCount: CARL_FEATURE_COUNT
    };
}

export async function testBrainPrediction(
    url: string,
    linkText: string,
    context: 'footer' | 'nav' | 'body' | 'legal_hub'
) {
    const carl = await getCarl();
    
    const features = extractCarlFeatures(linkText, url, context, 'https://example.com');
    const prediction = carl.predict(features);

    return {
        features,
        featureNames: getCarlFeatureNames(),
        score: prediction.score,
        isPolicy: prediction.isPolicy,
        confidence: prediction.confidence,
        generation: prediction.generation
    };
}

export async function trainBrain(
    features: number[],
    target: number,
    domain: string = '',
    url: string = ''
) {
    const carl = await getCarl();
    await carl.train(features, target, domain, url);
    const stats = carl.getStats();

    return {
        success: true,
        newGeneration: stats.generation,
        trainingCount: stats.trainingCount
    };
}

export async function retrainBrain() {
    const carl = await getCarl();
    const result = await carl.retrain();
    
    return {
        success: true,
        generation: result.generation,
        accuracy: result.accuracy,
        examplesUsed: result.examplesUsed
    };
}

export async function resetBrain() {
    const carl = await getCarl();
    await carl.reset();
    
    return {
        success: true,
        message: 'Carl has been reset to factory settings'
    };
}

// ============================================================================
// ADMIN ACTIONS - Require admin authentication
// ============================================================================

const ADMIN_EMAIL = 'policyparser.admin@gmail.com';

/**
 * Check if current user is admin
 */
export async function isAdminUser(): Promise<boolean> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email === ADMIN_EMAIL;
}

/**
 * Get all cached policies for admin view
 */
export async function getAdminCacheList(): Promise<{
    success: boolean;
    items?: {
        id: string;
        domain: string;
        policy_type: string;
        policy_url: string | null;
        score: number | null;
        word_count: number | null;
        analyzed_at: string;
    }[];
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        // Check admin
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email !== ADMIN_EMAIL) {
            return { success: false, error: 'Unauthorized' };
        }

        const { data, error } = await supabase
            .from('policy_versions')
            .select('id, domain, policy_type, policy_url, score, word_count, analyzed_at')
            .order('analyzed_at', { ascending: false })
            .limit(100);

        if (error) {
            logger.error('Failed to get cache list', error);
            return { success: false, error: error.message };
        }

        return { success: true, items: data || [] };
    } catch (error: any) {
        logger.error('Error getting cache list', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a specific cached policy by ID
 */
export async function deleteCacheItem(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        
        // Check admin
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email !== ADMIN_EMAIL) {
            return { success: false, error: 'Unauthorized' };
        }

        const { error } = await supabase
            .from('policy_versions')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error('Failed to delete cache item', error);
            return { success: false, error: error.message };
        }

        logger.info(`Deleted cache item: ${id}`);
        return { success: true };
    } catch (error: any) {
        logger.error('Error deleting cache item', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete all cached policies for a specific domain
 */
export async function deleteCacheByDomain(domain: string): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
        const supabase = await createClient();
        
        // Check admin
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email !== ADMIN_EMAIL) {
            return { success: false, error: 'Unauthorized' };
        }

        const cleanDomain = domain.replace(/^www\./, '').toLowerCase();

        const { data, error } = await supabase
            .from('policy_versions')
            .delete()
            .eq('domain', cleanDomain)
            .select('id');

        if (error) {
            logger.error('Failed to delete domain cache', error);
            return { success: false, error: error.message };
        }

        const count = data?.length || 0;
        logger.info(`Deleted ${count} cache items for domain: ${cleanDomain}`);
        return { success: true, count };
    } catch (error: any) {
        logger.error('Error deleting domain cache', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get admin dashboard stats
 */
export async function getAdminStats(): Promise<{
    success: boolean;
    stats?: {
        totalUsers: number;
        totalAnalyses: number;
        totalCachedPolicies: number;
        totalLogs: number;
        queuePending: number;
        queueCompleted: number;
        queueFailed: number;
        brainGeneration: number;
    };
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        // Check admin
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email !== ADMIN_EMAIL) {
            return { success: false, error: 'Unauthorized' };
        }

        // Gather all stats in parallel
        const [
            { count: userCount },
            { count: analysisCount },
            { count: cacheCount },
            { count: logCount },
            queueStats,
            brainStats
        ] = await Promise.all([
            supabase.from('profiles').select('*', { count: 'exact', head: true }),
            supabase.from('analyses').select('*', { count: 'exact', head: true }),
            supabase.from('policy_versions').select('*', { count: 'exact', head: true }),
            supabase.from('deep_logs').select('*', { count: 'exact', head: true }),
            getQueueStats(),
            getBrainStats()
        ]);

        return {
            success: true,
            stats: {
                totalUsers: userCount || 0,
                totalAnalyses: analysisCount || 0,
                totalCachedPolicies: cacheCount || 0,
                totalLogs: logCount || 0,
                queuePending: queueStats.pending,
                queueCompleted: queueStats.completed,
                queueFailed: queueStats.failed,
                brainGeneration: brainStats.generation
            }
        };
    } catch (error: any) {
        logger.error('Error getting admin stats', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get recent analyses for admin dashboard
 */
export async function getAdminRecentAnalyses(): Promise<{
    success: boolean;
    analyses?: any[];
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        // Check admin
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email !== ADMIN_EMAIL) {
            return { success: false, error: 'Unauthorized' };
        }

        const { data, error } = await supabase
            .from('analyses')
            .select('id, company_name, domain, created_at, score, policy_url, discovery_method')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            logger.error('Failed to get recent analyses', error);
            return { success: false, error: error.message };
        }

        return { success: true, analyses: data || [] };
    } catch (error: any) {
        logger.error('Error getting recent analyses', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all users for admin dashboard
 */
export async function getAdminUsers(): Promise<{
    success: boolean;
    users?: any[];
    error?: string;
}> {
    try {
        const supabase = await createClient();
        
        // Check admin
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email !== ADMIN_EMAIL) {
            return { success: false, error: 'Unauthorized' };
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, display_name, is_pro, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Failed to get users', error);
            return { success: false, error: error.message };
        }

        return { success: true, users: data || [] };
    } catch (error: any) {
        logger.error('Error getting users', error);
        return { success: false, error: error.message };
    }
}
