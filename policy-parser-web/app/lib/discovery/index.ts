/**
 * INTELLIGENT POLICY DISCOVERY ENGINE v3.0
 * 
 * A ground-breaking, multi-phase approach to finding actual policy documents.
 * This doesn't just append "/privacy" - it intelligently crawls, validates,
 * and verifies that discovered URLs are ACTUAL policy documents.
 * 
 * PHASES:
 * 1. Special domain lookup (known URLs for major companies)
 * 2. Deep footer crawling (policies are almost always in footers)
 * 3. Legal/help page discovery and crawling
 * 4. Sitemap parsing
 * 5. Intelligent content validation (verify it's actually a policy)
 * 5.5. Deep Link Scanning (follow hub pages to find actual policies) - NEW!
 * 6. Search engine fallback with content validation
 */

import got from 'got';
import * as cheerio from 'cheerio';
import { CONFIG, PolicyType } from '../config';
import { logger } from '../logger';
import { deepScanPrivacyPage } from './deepLinkScanner';
import { Carl, getCarl, extractCarlFeatures } from '../carl';

export interface DiscoveredPolicy {
    type: PolicyType;
    name: string;
    url: string;
    confidence: 'high' | 'medium' | 'low';
    source: 'special_domain' | 'footer_link' | 'legal_page' | 'sitemap' | 'search_engine' | 'content_analysis';
    neuralScore?: number; // Added neural score
}

export interface DiscoveryResult {
    success: boolean;
    domain: string;
    policies: DiscoveredPolicy[];
    discoveryTime: number;
    phasesCompleted: string[];
    error?: string;
}

// Common footer selectors across different website designs
const FOOTER_SELECTORS = [
    'footer',
    '#footer',
    '.footer',
    '[role="contentinfo"]',
    '.site-footer',
    '#site-footer',
    '.page-footer',
    '#page-footer',
    '.global-footer',
    '.main-footer',
    '.bottom-nav',
    '.footer-nav',
    '.footer-links',
    '.legal-links',
    '.legal-footer',
    '.copyright',
    '.footer-legal',
    '.footer-bottom',
    // Steam-specific
    '.valve_links',
    '#footer_text',
    '#footer_logo_steam',
    // Common CMS patterns
    '.wp-block-template-part', // WordPress
    '.elementor-location-footer', // Elementor
];

// Keywords that MUST appear in the content to validate it's a policy
const POLICY_VALIDATION_KEYWORDS: Record<PolicyType, string[]> = {
    privacy: [
        'collect', 'personal data', 'personal information', 'information we collect',
        'data we collect', 'privacy', 'cookies', 'third parties', 'share',
        'your rights', 'data protection', 'processing', 'consent'
    ],
    terms: [
        'agreement', 'license', 'prohibited', 'termination', 'liability',
        'warranty', 'indemnify', 'governing law', 'dispute', 'arbitration',
        'user conduct', 'acceptable use', 'intellectual property'
    ],
    cookies: [
        'cookie', 'cookies', 'tracking', 'analytics', 'advertising cookies',
        'session', 'persistent', 'third-party cookies', 'opt-out', 'consent'
    ],
    security: [
        'security', 'encryption', 'protect', 'secure', 'vulnerability',
        'authentication', 'access control', 'safeguards', 'breach', 'incident'
    ],
    gdpr: [
        'gdpr', 'european', 'data subject', 'right to erasure', 'portability',
        'legitimate interest', 'lawful basis', 'processing', 'controller', 'processor'
    ],
    ccpa: [
        'ccpa', 'california', 'do not sell', 'opt-out', 'consumer rights',
        'shine the light', 'personal information', 'categories', 'disclosed'
    ],
    ai: [
        'artificial intelligence', 'machine learning', 'ai', 'model',
        'training data', 'automated', 'algorithm', 'generative'
    ],
    acceptable_use: [
        'acceptable use', 'prohibited', 'abuse', 'spam', 'harassment',
        'content policy', 'community guidelines', 'violations', 'enforcement'
    ]
};

// Link text patterns that indicate policy links
const POLICY_LINK_PATTERNS: Record<PolicyType, RegExp[]> = {
    privacy: [
        /privacy\s*(policy|notice|statement)?/i,
        /data\s*(protection|policy)/i,
        /personal\s*(data|information)/i,
        /datenschutz/i, // German
        /privacidad/i, // Spanish
        /confidentialit[eé]/i, // French
    ],
    terms: [
        /terms\s*(of\s*)?(service|use|agreement)?/i,
        /user\s*agreement/i,
        /legal\s*(terms|agreement)/i,
        /conditions?\s*(of\s*)?(use|service)?/i,
        /subscriber\s*agreement/i,
        /eula|end\s*user/i,
        /nutzungsbedingungen/i, // German
        /agb/i, // German abbreviation
    ],
    cookies: [
        /cookie\s*(policy|notice|settings)?/i,
        /cookies/i,
        /tracking/i,
    ],
    security: [
        /security\s*(policy|center|info)?/i,
        /trust\s*(center)?/i,
        /data\s*security/i,
    ],
    gdpr: [
        /gdpr/i,
        /eu\s*privacy/i,
        /european?\s*(privacy|data)/i,
    ],
    ccpa: [
        /ccpa/i,
        /california\s*(privacy|consumer)/i,
        /do\s*not\s*sell/i,
        /your\s*privacy\s*choices/i,
    ],
    ai: [
        /ai\s*(policy|terms|guidelines)?/i,
        /machine\s*learning/i,
        /artificial\s*intelligence/i,
    ],
    acceptable_use: [
        /acceptable\s*use/i,
        /aup/i,
        /community\s*(guidelines|standards)/i,
        /user\s*guidelines/i,
        /content\s*policy/i,
    ]
};

// URLs that are known to be legal hubs/indexes (not the policies themselves)
const LEGAL_HUB_PATTERNS = [
    /\/legal\/?$/i,
    /\/policies\/?$/i,
    /\/legal\/index/i,
    /\/about\/legal\/?$/i,
    /\/company\/legal\/?$/i,
];

// User agent for crawling
const CRAWLER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Main discovery function - orchestrates all phases
 */
export async function discoverPolicies(domain: string): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const phasesCompleted: string[] = [];
    const discoveredPolicies = new Map<PolicyType, DiscoveredPolicy>();

    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    const cleanDomain = new URL(baseUrl).hostname.replace(/^www\./, '');

    logger.info(`[PolicyDiscovery] Starting intelligent discovery for: ${cleanDomain}`);

    // Initialize Carl Neural Network
    const nn = await getCarl();


    try {
        // ============ PHASE 1: SPECIAL DOMAIN LOOKUP ============
        logger.info(`[PolicyDiscovery] Phase 1: Special domain lookup`);
        const specialPolicies = await checkSpecialDomains(cleanDomain, baseUrl);
        specialPolicies.forEach(p => discoveredPolicies.set(p.type, p));
        phasesCompleted.push(`special_domains:${specialPolicies.length}`);

        // ============ PHASE 2: DEEP FOOTER CRAWLING ============
        logger.info(`[PolicyDiscovery] Phase 2: Deep footer crawling`);
        const footerPolicies = await crawlFooterLinks(baseUrl, cleanDomain, nn);
        footerPolicies.forEach(p => {
            if (!discoveredPolicies.has(p.type)) {
                discoveredPolicies.set(p.type, p);
            }
        });
        phasesCompleted.push(`footer_crawl:${footerPolicies.length}`);

        // ============ PHASE 3: LEGAL HUB DISCOVERY ============
        if (discoveredPolicies.size < 2) {
            logger.info(`[PolicyDiscovery] Phase 3: Legal hub discovery`);
            const legalHubPolicies = await crawlLegalHubs(baseUrl, cleanDomain, nn);
            legalHubPolicies.forEach(p => {
                if (!discoveredPolicies.has(p.type)) {
                    discoveredPolicies.set(p.type, p);
                }
            });
            phasesCompleted.push(`legal_hubs:${legalHubPolicies.length}`);
        }

        // ============ PHASE 4: SITEMAP PARSING ============
        if (discoveredPolicies.size < 2) {
            logger.info(`[PolicyDiscovery] Phase 4: Sitemap parsing`);
            const sitemapPolicies = await parseSitemaps(baseUrl, cleanDomain);
            sitemapPolicies.forEach(p => {
                if (!discoveredPolicies.has(p.type)) {
                    discoveredPolicies.set(p.type, p);
                }
            });
            phasesCompleted.push(`sitemap:${sitemapPolicies.length}`);
        }

        // ============ PHASE 5: CONTENT VALIDATION ============
        logger.info(`[PolicyDiscovery] Phase 5: Content validation`);
        const validatedPolicies: DiscoveredPolicy[] = [];

        for (const [type, policy] of discoveredPolicies) {
            const isValid = await validatePolicyContent(policy.url, type);
            if (isValid) {
                validatedPolicies.push(policy);
                logger.info(`[PolicyDiscovery] Validated ${type}: ${policy.url}`);
            } else {
                logger.warn(`[PolicyDiscovery] Failed validation for ${type}: ${policy.url} - not a real policy`);
            }
        }
        phasesCompleted.push(`validation:${validatedPolicies.length}/${discoveredPolicies.size}`);

        // ============ PHASE 5.5: DEEP LINK SCANNING ============
        // For privacy policies, follow the link and look for nested/specific policy pages
        // This is critical for German banks where /datenschutz/ is often just a hub
        logger.info(`[PolicyDiscovery] Phase 5.5: Deep link scanning for actual policy pages`);
        const enhancedPolicies: DiscoveredPolicy[] = [];

        for (const policy of validatedPolicies) {
            if (policy.type === 'privacy') {
                // Try to find a more specific privacy policy page
                const deepResult = await deepScanPrivacyPage(policy.url, cleanDomain, 2);

                if (deepResult && deepResult.confidence > 80) {
                    logger.info(`[PolicyDiscovery] Deep scan found better privacy URL: ${deepResult.foundUrl} (confidence: ${deepResult.confidence})`);
                    enhancedPolicies.push({
                        ...policy,
                        url: deepResult.foundUrl,
                        confidence: 'high',
                        source: 'content_analysis',
                    });
                } else {
                    enhancedPolicies.push(policy);
                }
            } else {
                enhancedPolicies.push(policy);
            }
        }

        phasesCompleted.push(`deep_scan:${enhancedPolicies.filter(p => p.source === 'content_analysis').length}`);

        // ============ PHASE 6: SEARCH ENGINE FALLBACK ============
        const foundTypes = new Set(enhancedPolicies.map(p => p.type));
        if (!foundTypes.has('privacy') || !foundTypes.has('terms')) {
            logger.info(`[PolicyDiscovery] Phase 6: Search engine fallback`);
            const searchPolicies = await searchEngineFallback(cleanDomain, foundTypes);
            searchPolicies.forEach(p => {
                if (!foundTypes.has(p.type)) {
                    enhancedPolicies.push(p);
                }
            });
            phasesCompleted.push(`search:${searchPolicies.length}`);
        }

        // Sort by priority
        const priority: PolicyType[] = ['privacy', 'terms', 'cookies', 'security', 'gdpr', 'ccpa', 'ai', 'acceptable_use'];
        enhancedPolicies.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));

        const duration = Date.now() - startTime;
        logger.info(`[PolicyDiscovery] Complete! Found ${enhancedPolicies.length} validated policies in ${duration}ms`);
        logger.info(`[PolicyDiscovery] Phases: ${phasesCompleted.join(' -> ')}`);

        return {
            success: true,
            domain: cleanDomain,
            policies: enhancedPolicies,
            discoveryTime: duration,
            phasesCompleted
        };

    } catch (error: any) {
        logger.error(`[PolicyDiscovery] Discovery failed`, error);
        return {
            success: false,
            domain: cleanDomain,
            policies: [],
            discoveryTime: Date.now() - startTime,
            phasesCompleted,
            error: error?.message || 'Discovery failed'
        };
    }
}

/**
 * Phase 1: Check special domains configuration
 */
async function checkSpecialDomains(domain: string, baseUrl: string): Promise<DiscoveredPolicy[]> {
    const policies: DiscoveredPolicy[] = [];

    const specialConfig = CONFIG.SPECIAL_DOMAINS[domain] ||
        CONFIG.SPECIAL_DOMAINS[`www.${domain}`] ||
        CONFIG.SPECIAL_DOMAINS[domain.replace(/^www\./, '')];

    if (!specialConfig) return policies;

    const checks = Object.entries(specialConfig).map(async ([type, url]) => {
        if (!url || typeof url !== 'string') return null;

        try {
            const response = await got(url, {
                timeout: { request: 8000 },
                headers: {
                    'User-Agent': CRAWLER_UA,
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                followRedirect: true,
                retry: { limit: 1 } as any
            });

            if (response.statusCode === 200 && response.body.length > 1000) {
                return {
                    type: type as PolicyType,
                    name: CONFIG.POLICY_TYPES[type as PolicyType]?.name || type,
                    url,
                    confidence: 'high',
                    source: 'special_domain'
                } as DiscoveredPolicy;
            }
        } catch (e) {
            logger.debug(`[PolicyDiscovery] Special domain URL failed: ${url}`);
        }
        return null;
    });

    const results = await Promise.all(checks);
    return results.filter((p): p is DiscoveredPolicy => p !== null);
}

/**
 * Phase 2: Deep footer crawling - most policies are linked in footers
 */
async function crawlFooterLinks(baseUrl: string, domain: string, nn?: Carl): Promise<DiscoveredPolicy[]> {
    const policies: DiscoveredPolicy[] = [];

    try {
        const response = await got(baseUrl, {
            timeout: { request: 15000 },
            headers: {
                'User-Agent': CRAWLER_UA,
                'Accept-Language': 'en-US,en;q=0.9'
            },
            followRedirect: true
        });

        const $ = cheerio.load(response.body);
        const foundLinks = new Map<PolicyType, { url: string; score: number; neuralScore?: number }>();

        // Try each footer selector
        for (const selector of FOOTER_SELECTORS) {
            const $footer = $(selector);
            if ($footer.length === 0) continue;

            $footer.find('a').each((_, el) => {
                const href = $(el).attr('href');
                const linkText = $(el).text().trim().toLowerCase();

                if (!href) return;

                // Try to make absolute URL
                let absoluteUrl: string;
                try {
                    absoluteUrl = new URL(href, baseUrl).toString();
                } catch {
                    return;
                }

                // Check each policy type
                for (const [type, patterns] of Object.entries(POLICY_LINK_PATTERNS)) {
                    for (const pattern of patterns) {
                        if (pattern.test(linkText) || pattern.test(href)) {
                            const score = linkText.length > 0 && pattern.test(linkText) ? 2 : 1;
                            const existing = foundLinks.get(type as PolicyType);

                            if (!existing || existing.score < score) {
                                let neuralScore = 0;
                                if (nn) {
                                    const features = extractCarlFeatures(linkText, href, 'footer', baseUrl);
                                    neuralScore = nn.predict(features).score;
                                }
                                foundLinks.set(type as PolicyType, { url: absoluteUrl, score, neuralScore });
                            }
                            break;
                        }
                    }
                }
            });
        }

        // Also scan the entire page for obvious policy links (in case footer detection fails)
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            const linkText = $(el).text().trim().toLowerCase();

            if (!href) return;

            // Skip if already found with higher score
            for (const [type, patterns] of Object.entries(POLICY_LINK_PATTERNS)) {
                const existing = foundLinks.get(type as PolicyType);
                if (existing && existing.score >= 2) continue;

                for (const pattern of patterns) {
                    // Only match if BOTH text and URL suggest it's a policy
                    const textMatch = pattern.test(linkText);
                    const urlMatch = pattern.test(href);

                    if (textMatch && (urlMatch || href.includes('legal') || href.includes('policy'))) {
                        try {
                            const absoluteUrl = new URL(href, baseUrl).toString();
                            // Skip legal hub pages
                            if (!LEGAL_HUB_PATTERNS.some(p => p.test(absoluteUrl))) {
                                if (!existing || existing.score < 1) {
                                    let neuralScore = 0;
                                    if (nn) {
                                        const features = extractCarlFeatures(linkText, href, 'body', baseUrl);
                                        neuralScore = nn.predict(features).score;
                                    }
                                    foundLinks.set(type as PolicyType, { url: absoluteUrl, score: 1, neuralScore });
                                }
                            }
                        } catch { }
                        break;
                    }
                }
            }
        });

        // Convert to policies
        for (const [type, { url }] of foundLinks) {
            policies.push({
                type,
                name: CONFIG.POLICY_TYPES[type]?.name || type,
                url,
                confidence: 'medium',
                source: 'footer_link',
                neuralScore: (foundLinks.get(type)?.neuralScore) || 0
            });
        }

    } catch (error: any) {
        logger.error(`[PolicyDiscovery] Footer crawl failed`, error?.message);
    }

    return policies;
}

/**
 * Phase 3: Crawl legal hub pages (e.g., /legal, /policies)
 */
async function crawlLegalHubs(baseUrl: string, domain: string, nn?: Carl): Promise<DiscoveredPolicy[]> {
    const policies: DiscoveredPolicy[] = [];
    const legalHubPaths = ['/legal', '/policies', '/about/legal', '/company/legal', '/help/legal', '/legal-notices'];

    for (const path of legalHubPaths) {
        try {
            const hubUrl = new URL(path, baseUrl).toString();
            const response = await got(hubUrl, {
                timeout: { request: 10000 },
                headers: {
                    'User-Agent': CRAWLER_UA,
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                followRedirect: true,
                retry: { limit: 0 } as any
            });

            if (response.statusCode !== 200) continue;

            const $ = cheerio.load(response.body);

            $('a').each((_, el) => {
                const href = $(el).attr('href');
                const linkText = $(el).text().trim().toLowerCase();

                if (!href) return;

                for (const [type, patterns] of Object.entries(POLICY_LINK_PATTERNS)) {
                    for (const pattern of patterns) {
                        if (pattern.test(linkText) || pattern.test(href)) {
                            try {
                                const absoluteUrl = new URL(href, hubUrl).toString();
                                // Skip the hub page itself
                                if (!LEGAL_HUB_PATTERNS.some(p => p.test(absoluteUrl))) {
                                    const exists = policies.some(p => p.type === type);
                                    if (!exists) {
                                        const features = extractCarlFeatures(linkText, href, 'legal_hub', baseUrl);
                                        policies.push({
                                            type: type as PolicyType,
                                            name: CONFIG.POLICY_TYPES[type as PolicyType]?.name || type,
                                            url: absoluteUrl,
                                            confidence: 'medium',
                                            source: 'legal_page',
                                            neuralScore: nn ? nn.predict(features).score : 0
                                        });
                                    }
                                }
                            } catch { }
                            break;
                        }
                    }
                }
            });

            // If we found policies from this hub, no need to try others
            if (policies.length >= 2) break;

        } catch {
            // Hub doesn't exist, try next
        }
    }

    return policies;
}

/**
 * Phase 4: Parse sitemap.xml for policy URLs
 */
async function parseSitemaps(baseUrl: string, domain: string): Promise<DiscoveredPolicy[]> {
    const policies: DiscoveredPolicy[] = [];
    const sitemapUrls = [
        `${baseUrl}/sitemap.xml`,
        `${baseUrl}/sitemap_index.xml`,
        `${baseUrl}/sitemap-index.xml`,
    ];

    for (const sitemapUrl of sitemapUrls) {
        try {
            const response = await got(sitemapUrl, {
                timeout: { request: 10000 },
                headers: { 'User-Agent': CRAWLER_UA },
                retry: { limit: 0 } as any
            });

            if (response.statusCode !== 200) continue;

            const $ = cheerio.load(response.body, { xmlMode: true });

            $('url loc, sitemap loc').each((_, el) => {
                const url = $(el).text().trim();

                for (const [type, patterns] of Object.entries(POLICY_LINK_PATTERNS)) {
                    for (const pattern of patterns) {
                        if (pattern.test(url)) {
                            const exists = policies.some(p => p.type === type);
                            if (!exists && !LEGAL_HUB_PATTERNS.some(p => p.test(url))) {
                                policies.push({
                                    type: type as PolicyType,
                                    name: CONFIG.POLICY_TYPES[type as PolicyType]?.name || type,
                                    url,
                                    confidence: 'low',
                                    source: 'sitemap'
                                });
                            }
                            break;
                        }
                    }
                }
            });

            if (policies.length > 0) break;

        } catch {
            // Sitemap doesn't exist or failed
        }
    }

    return policies;
}

/**
 * Phase 5: Validate that a URL actually contains policy content
 * This is CRITICAL - it prevents false positives like Steam's store page
 */
async function validatePolicyContent(url: string, type: PolicyType): Promise<boolean> {
    try {
        const response = await got(url, {
            timeout: { request: 12000 },
            headers: {
                'User-Agent': CRAWLER_UA,
                'Accept-Language': 'en-US,en;q=0.9'
            },
            followRedirect: true
        });

        if (response.statusCode !== 200) return false;

        const $ = cheerio.load(response.body);

        // Remove scripts, styles, nav, headers (noise)
        $('script, style, nav, header, noscript, iframe').remove();

        // Get text content
        const textContent = $('body').text().toLowerCase();

        // Check minimum length (policies are usually substantial documents)
        if (textContent.length < 2000) {
            logger.debug(`[PolicyDiscovery] Content too short for ${type}: ${textContent.length} chars`);
            return false;
        }

        // Check for required keywords
        const keywords = POLICY_VALIDATION_KEYWORDS[type];
        let matchedKeywords = 0;

        for (const keyword of keywords) {
            if (textContent.includes(keyword.toLowerCase())) {
                matchedKeywords++;
            }
        }

        // Require at least 3 keyword matches for validation
        const minMatches = type === 'ai' ? 2 : 3; // AI terms are rarer
        const isValid = matchedKeywords >= minMatches;

        if (!isValid) {
            logger.debug(`[PolicyDiscovery] Insufficient keywords for ${type}: ${matchedKeywords}/${keywords.length} (need ${minMatches})`);
        }

        return isValid;

    } catch (error: any) {
        logger.debug(`[PolicyDiscovery] Validation fetch failed for ${url}: ${error?.message}`);
        return false;
    }
}

/**
 * Phase 6: Search engine fallback with content validation
 */
async function searchEngineFallback(domain: string, foundTypes: Set<PolicyType>): Promise<DiscoveredPolicy[]> {
    const policies: DiscoveredPolicy[] = [];
    const searchQueries: { type: PolicyType; query: string }[] = [];

    if (!foundTypes.has('privacy')) {
        searchQueries.push({ type: 'privacy', query: `"privacy policy" site:${domain}` });
    }
    if (!foundTypes.has('terms')) {
        searchQueries.push({ type: 'terms', query: `"terms of service" OR "terms of use" site:${domain}` });
    }

    for (const { type, query } of searchQueries) {
        try {
            // Use DuckDuckGo HTML (more reliable than Google scraping)
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

            const response = await got(searchUrl, {
                timeout: { request: 10000 },
                headers: {
                    'User-Agent': CRAWLER_UA,
                    'Accept': 'text/html'
                }
            });

            const $ = cheerio.load(response.body);
            const resultUrls: string[] = [];

            // DuckDuckGo HTML results
            $('.result__a').each((_, el) => {
                const href = $(el).attr('href');
                if (href && href.includes(domain.replace('www.', ''))) {
                    // DuckDuckGo wraps URLs
                    const match = href.match(/uddg=([^&]+)/);
                    if (match) {
                        try {
                            resultUrls.push(decodeURIComponent(match[1]));
                        } catch { }
                    } else if (href.startsWith('http')) {
                        resultUrls.push(href);
                    }
                }
            });

            // Validate each result
            for (const url of resultUrls.slice(0, 3)) {
                const isValid = await validatePolicyContent(url, type);
                if (isValid) {
                    policies.push({
                        type,
                        name: CONFIG.POLICY_TYPES[type]?.name || type,
                        url,
                        confidence: 'medium',
                        source: 'search_engine'
                    });
                    break;
                }
            }

        } catch (error: any) {
            logger.error(`[PolicyDiscovery] Search fallback failed for ${type}`, error?.message);
        }
    }

    return policies;
}

export { validatePolicyContent };
