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

        // Check all policy types in parallel
        const policyTypes = Object.entries(CONFIG.POLICY_TYPES) as [PolicyType, typeof CONFIG.POLICY_TYPES[PolicyType]][];
        
        const checks = policyTypes.map(async ([type, config]) => {
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
