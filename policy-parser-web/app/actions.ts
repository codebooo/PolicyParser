'use server';

import { createStreamableValue } from '@ai-sdk/rsc';
import { identifyTarget } from './lib/identifier';
import { PolicyDiscoveryEngine } from './lib/discovery/Engine';
import { extractPolicyContent } from './lib/extractor';
import { isValidPolicyUrl } from './lib/extractor/fetcher';
import { SYSTEM_PROMPT, USER_PROMPT } from './lib/analyzer/prompt';
import { calculateScore } from './lib/analyzer/scorer';
import { AnalysisResultSchema } from './lib/types/analysis';
import { generateObject } from 'ai';
import { getGeminiModel } from './lib/ai/gemini';
import { createClient } from '@/utils/supabase/server';
import { logger } from './lib/logger';
import { CONFIG, PolicyType } from './lib/config';
import got from 'got';

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

            // Step 2: Discovery
            stream.update({ status: 'discovering', message: `Searching for policy on ${identity.cleanDomain}...`, step: 2, data: null });
            const engine = new PolicyDiscoveryEngine();
            const candidate = await engine.discover(identity.cleanDomain);

            if (!candidate) {
                throw new Error(`Could not find a privacy policy for ${identity.cleanDomain}`);
            }
            logger.info('Policy found', candidate);

            // Step 3: Extraction
            stream.update({ status: 'extracting', message: `Reading policy from ${candidate.url}...`, step: 3, data: null });
            const extracted = await extractPolicyContent(candidate.url);
            logger.info('Content extracted', { length: extracted.rawLength });

            // Step 4: Analysis (using Gemini with key rotation)
            stream.update({ status: 'analyzing', message: 'Analyzing legal text (this may take a moment)...', step: 4, data: null });

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

            // Step 5: Save to DB
            stream.update({ status: 'saving', message: 'Saving results...', step: 5, data: null });
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

            stream.done({ status: 'complete', message: 'Analysis complete!', step: 6, data: resultsWithUrl });

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
 */
export async function discoverAllPolicies(input: string): Promise<{
    success: boolean;
    domain?: string;
    policies?: { type: PolicyType; name: string; url: string }[];
    error?: string;
}> {
    try {
        const identity = await identifyTarget(input);
        const domain = identity.cleanDomain;
        const baseUrl = `https://${domain}`;

        const foundPolicies: { type: PolicyType; name: string; url: string }[] = [];

        // Check if this is a special domain with known policy URLs
        const specialDomain = CONFIG.SPECIAL_DOMAINS[domain] || 
                              CONFIG.SPECIAL_DOMAINS[`www.${domain}`] ||
                              CONFIG.SPECIAL_DOMAINS[domain.replace(/^www\./, '')];

        // Check all policy types in parallel
        const policyTypes = Object.entries(CONFIG.POLICY_TYPES) as [PolicyType, typeof CONFIG.POLICY_TYPES[PolicyType]][];
        
        const checks = policyTypes.map(async ([type, config]) => {
            // First check if we have a special domain URL for this policy type
            if (specialDomain && specialDomain[type]) {
                const specialUrl = specialDomain[type]!;
                try {
                    const response = await got.head(specialUrl, {
                        timeout: { request: 5000 },
                        retry: { limit: 0 } as any,
                        headers: { 
                            // Use Googlebot UA for Meta domains
                            'User-Agent': domain.includes('facebook') || domain.includes('meta') || domain.includes('instagram')
                                ? 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
                                : CONFIG.USER_AGENT,
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        followRedirect: true
                    });

                    if (response.statusCode === 200) {
                        return {
                            type,
                            name: config.name,
                            url: specialUrl
                        };
                    }
                } catch {
                    // Special URL didn't work, fall through to standard checks
                }
            }

            // Standard path checks
            for (const path of config.paths) {
                const url = `${baseUrl}${path}`;
                try {
                    const response = await got.head(url, {
                        timeout: { request: 5000 },
                        retry: { limit: 0 } as any,
                        headers: { 
                            'User-Agent': CONFIG.USER_AGENT,
                            // Request English version of pages
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        followRedirect: true
                    });

                    if (response.statusCode === 200) {
                        const contentType = response.headers['content-type'];
                        const finalUrl = response.url; // URL after redirects
                        
                        // Validate the final URL isn't a login/auth page
                        if (!isValidPolicyUrl(finalUrl)) {
                            logger.info(`Skipping ${finalUrl} - appears to be auth page`);
                            continue;
                        }
                        
                        if (contentType && contentType.includes('text/html')) {
                            return {
                                type,
                                name: config.name,
                                url: finalUrl // Use final URL after redirects
                            };
                        }
                    }
                } catch {
                    // Ignore errors, try next path
                }
            }
            return null;
        });

        const results = await Promise.all(checks);
        results.forEach(r => {
            if (r) foundPolicies.push(r);
        });

        // Sort by policy type priority (privacy first, then terms, etc.)
        const priority: PolicyType[] = ['privacy', 'terms', 'cookies', 'security', 'gdpr', 'ccpa', 'ai', 'acceptable_use'];
        foundPolicies.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));

        return {
            success: true,
            domain,
            policies: foundPolicies
        };
    } catch (error: any) {
        logger.error('Policy discovery failed', error);
        return {
            success: false,
            error: error?.message || 'Failed to discover policies'
        };
    }
}

/**
 * PRO FEATURE: Analyze a specific policy URL
 * For use after discoverAllPolicies to analyze individual policies
 */
export async function analyzeSpecificPolicy(url: string, policyType: string) {
    const stream = createStreamableValue({
        status: 'initializing',
        message: 'Initializing analysis...',
        step: 0,
        data: null as any,
        policyType
    });

    (async () => {
        try {
            stream.update({ status: 'extracting', message: `Reading ${policyType}...`, step: 1, data: null, policyType });
            const extracted = await extractPolicyContent(url);
            logger.info(`${policyType} content extracted`, { length: extracted.rawLength });

            stream.update({ status: 'analyzing', message: `Analyzing ${policyType}...`, step: 2, data: null, policyType });

            const { object: analysis } = await generateObject({
                model: getGeminiModel(),
                system: SYSTEM_PROMPT,
                prompt: USER_PROMPT(extracted.markdown),
                schema: AnalysisResultSchema,
                mode: 'json'
            });

            const score = calculateScore(analysis);
            analysis.score = score;

            const resultsWithMeta = {
                ...analysis,
                url,
                policyType,
                rawPolicyText: extracted.markdown // Include the original extracted text
            };

            stream.done({ status: 'complete', message: 'Analysis complete!', step: 3, data: resultsWithMeta, policyType });

        } catch (error: any) {
            logger.error(`${policyType} analysis failed`, error);
            const errorMessage = error?.message || 'An unexpected error occurred';
            stream.done({ status: 'error', message: errorMessage, step: -1, data: null, policyType });
        }
    })();

    return { output: stream.value };
}
