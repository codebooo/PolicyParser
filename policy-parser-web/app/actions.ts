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
