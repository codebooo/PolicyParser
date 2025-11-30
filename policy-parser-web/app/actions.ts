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
import * as cheerio from 'cheerio';

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
 * 
 * ROBUST APPROACH:
 * 1. Check SPECIAL_DOMAINS config first (using GET requests for verification)
 * 2. Try standard paths with GET requests (HEAD requests often fail)
 * 3. FALLBACK: Scrape homepage for ALL policy links
 * 4. ULTIMATE FALLBACK: Search engines
 */
export async function discoverAllPolicies(input: string): Promise<{
    success: boolean;
    domain?: string;
    policies?: { type: PolicyType; name: string; url: string }[];
    error?: string;
}> {
    const startTime = Date.now();
    
    try {
        logger.info(`[discoverAllPolicies] Starting discovery for: ${input}`);
        
        const identity = await identifyTarget(input);
        const domain = identity.cleanDomain;
        const baseUrl = `https://${domain}`;
        
        logger.info(`[discoverAllPolicies] Resolved domain: ${domain}`);

        const foundPolicies: { type: PolicyType; name: string; url: string }[] = [];
        const checkedUrls = new Set<string>(); // Prevent duplicates

        // Helper to add policy if not already added
        const addPolicy = (type: PolicyType, name: string, url: string) => {
            const normalizedUrl = url.toLowerCase().replace(/\/$/, '');
            if (!checkedUrls.has(normalizedUrl)) {
                checkedUrls.add(normalizedUrl);
                foundPolicies.push({ type, name, url });
                logger.info(`[discoverAllPolicies] Found ${type}: ${url}`);
            }
        };

        // Helper to verify URL works with GET request
        const verifyUrl = async (url: string): Promise<boolean> => {
            try {
                const response = await got(url, {
                    timeout: { request: 10000 },
                    retry: { limit: 1 } as any,
                    headers: { 
                        'User-Agent': CONFIG.USER_AGENT,
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept': 'text/html,application/xhtml+xml'
                    },
                    followRedirect: true
                });
                
                // Verify it's HTML and has content
                const contentType = response.headers['content-type'] || '';
                const isHtml = contentType.includes('text/html');
                const hasContent = response.body.length > 1000;
                const finalUrl = response.url;
                
                // Check it's not an auth page
                if (!isValidPolicyUrl(finalUrl)) {
                    logger.info(`[discoverAllPolicies] Skipping ${finalUrl} - auth page`);
                    return false;
                }
                
                return isHtml && hasContent;
            } catch (e) {
                return false;
            }
        };

        // ============ PHASE 1: SPECIAL DOMAINS ============
        logger.info(`[discoverAllPolicies] Phase 1: Checking special domains`);
        
        const specialDomain = CONFIG.SPECIAL_DOMAINS[domain] || 
                              CONFIG.SPECIAL_DOMAINS[`www.${domain}`] ||
                              CONFIG.SPECIAL_DOMAINS[domain.replace(/^www\./, '')];

        if (specialDomain) {
            logger.info(`[discoverAllPolicies] Found special domain config for ${domain}`);
            
            const specialChecks = Object.entries(specialDomain).map(async ([type, url]) => {
                if (url && typeof url === 'string') {
                    const isValid = await verifyUrl(url);
                    if (isValid) {
                        const config = CONFIG.POLICY_TYPES[type as PolicyType];
                        if (config) {
                            addPolicy(type as PolicyType, config.name, url);
                        }
                    } else {
                        logger.info(`[discoverAllPolicies] Special URL failed verification: ${url}`);
                    }
                }
            });
            
            await Promise.all(specialChecks);
        }

        // ============ PHASE 2: STANDARD PATHS ============
        logger.info(`[discoverAllPolicies] Phase 2: Checking standard paths`);
        
        const policyTypes = Object.entries(CONFIG.POLICY_TYPES) as [PolicyType, typeof CONFIG.POLICY_TYPES[PolicyType]][];
        
        const standardChecks = policyTypes.map(async ([type, config]) => {
            // Skip if we already found this policy type
            if (foundPolicies.some(p => p.type === type)) return;
            
            for (const path of config.paths) {
                const url = `${baseUrl}${path}`;
                const isValid = await verifyUrl(url);
                if (isValid) {
                    addPolicy(type, config.name, url);
                    return; // Found one, stop checking other paths for this type
                }
            }
        });
        
        await Promise.all(standardChecks);

        // ============ PHASE 3: HOMEPAGE SCRAPING FALLBACK ============
        // If we found less than 2 policies, try scraping the homepage
        if (foundPolicies.length < 2) {
            logger.info(`[discoverAllPolicies] Phase 3: Homepage scraping fallback (found ${foundPolicies.length} so far)`);
            
            try {
                const response = await got(baseUrl, {
                    timeout: { request: 15000 },
                    headers: { 
                        'User-Agent': CONFIG.USER_AGENT,
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                    retry: { limit: 1 } as any
                });

                const $ = cheerio.load(response.body);
                const policyLinks: { url: string; text: string; type: PolicyType | null }[] = [];

                // Find ALL links that might be policies
                $('a').each((_, el) => {
                    const href = $(el).attr('href');
                    const text = $(el).text().trim().toLowerCase();
                    
                    if (!href) return;
                    
                    const lowerHref = href.toLowerCase();
                    let detectedType: PolicyType | null = null;
                    
                    // Detect policy type from link text or URL
                    if (text.includes('privacy') || lowerHref.includes('privacy')) {
                        detectedType = 'privacy';
                    } else if (text.includes('terms') || text.includes('user agreement') || lowerHref.includes('terms') || lowerHref.includes('useragreement')) {
                        detectedType = 'terms';
                    } else if (text.includes('cookie') || lowerHref.includes('cookie')) {
                        detectedType = 'cookies';
                    } else if (text.includes('security') || lowerHref.includes('security')) {
                        detectedType = 'security';
                    } else if (text.includes('gdpr') || lowerHref.includes('gdpr')) {
                        detectedType = 'gdpr';
                    } else if (text.includes('ccpa') || text.includes('california') || lowerHref.includes('ccpa')) {
                        detectedType = 'ccpa';
                    } else if (text.includes('acceptable use') || lowerHref.includes('acceptable-use') || lowerHref.includes('aup')) {
                        detectedType = 'acceptable_use';
                    }
                    
                    if (detectedType) {
                        try {
                            const absoluteUrl = new URL(href, baseUrl).toString();
                            if (isValidPolicyUrl(absoluteUrl)) {
                                policyLinks.push({ url: absoluteUrl, text, type: detectedType });
                            }
                        } catch {
                            // Invalid URL, skip
                        }
                    }
                });

                logger.info(`[discoverAllPolicies] Found ${policyLinks.length} potential policy links on homepage`);

                // Verify and add policies we don't already have
                for (const link of policyLinks) {
                    if (link.type && !foundPolicies.some(p => p.type === link.type)) {
                        const isValid = await verifyUrl(link.url);
                        if (isValid) {
                            const config = CONFIG.POLICY_TYPES[link.type];
                            addPolicy(link.type, config?.name || link.type, link.url);
                        }
                    }
                }
            } catch (e) {
                logger.error(`[discoverAllPolicies] Homepage scraping failed`, e);
            }
        }

        // ============ PHASE 4: SEARCH ENGINE FALLBACK ============
        // If we STILL have no policies, use search engines
        if (foundPolicies.length === 0) {
            logger.info(`[discoverAllPolicies] Phase 4: Search engine fallback`);
            
            const searchTypes: PolicyType[] = ['privacy', 'terms'];
            
            for (const type of searchTypes) {
                try {
                    const query = `site:${domain} ${type === 'privacy' ? 'privacy policy' : 'terms of service'}`;
                    
                    const searchResponse = await got(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`, {
                        timeout: { request: 10000 },
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'text/html',
                        }
                    });
                    
                    const $search = cheerio.load(searchResponse.body);
                    const resultUrls: string[] = [];
                    
                    $search('a').each((_, el) => {
                        const href = $search(el).attr('href');
                        if (href && href.includes(domain) && (href.includes(type) || href.includes('policy'))) {
                            try {
                                const url = new URL(href.startsWith('/url?q=') ? decodeURIComponent(href.split('/url?q=')[1].split('&')[0]) : href);
                                if (url.hostname.includes(domain.replace('www.', ''))) {
                                    resultUrls.push(url.toString());
                                }
                            } catch {}
                        }
                    });
                    
                    for (const url of resultUrls.slice(0, 3)) {
                        const isValid = await verifyUrl(url);
                        if (isValid && !foundPolicies.some(p => p.type === type)) {
                            const config = CONFIG.POLICY_TYPES[type];
                            addPolicy(type, config.name, url);
                            break;
                        }
                    }
                } catch (e) {
                    logger.error(`[discoverAllPolicies] Search fallback failed for ${type}`, e);
                }
            }
        }

        // Sort by policy type priority
        const priority: PolicyType[] = ['privacy', 'terms', 'cookies', 'security', 'gdpr', 'ccpa', 'ai', 'acceptable_use'];
        foundPolicies.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));

        const duration = Date.now() - startTime;
        logger.info(`[discoverAllPolicies] Complete! Found ${foundPolicies.length} policies in ${duration}ms`);

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
            logger.info(`[analyzeSpecificPolicy] Starting analysis for ${policyType}`, { url });
            stream.update({ status: 'extracting', message: `Reading ${policyType}...`, step: 1, data: null, policyType });
            
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

            stream.update({ status: 'analyzing', message: `Analyzing ${policyType}...`, step: 2, data: null, policyType });

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

            const resultsWithMeta = {
                ...analysis,
                url,
                policyType,
                rawPolicyText: extracted.markdown // Include the original extracted text
            };

            logger.info(`[analyzeSpecificPolicy] ${policyType} complete`, { score, url });
            stream.done({ status: 'complete', message: 'Analysis complete!', step: 3, data: resultsWithMeta, policyType });

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
