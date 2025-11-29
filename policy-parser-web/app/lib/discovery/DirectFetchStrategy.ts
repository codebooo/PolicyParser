import { DiscoveryStrategy } from './Strategy';
import { PolicyCandidate, PolicySource } from '../types/policy';
import { CONFIG } from '../config';
import got from 'got';
import { logger } from '../logger';
import { isValidPolicyUrl } from '../extractor/fetcher';

/**
 * Domains that require special handling (bot user-agent) to work
 * These sites block regular Chrome user-agent but allow search engine bots
 */
const BOT_REQUIRED_DOMAINS = [
    'facebook.com',
    'www.facebook.com',
    'instagram.com',
    'www.instagram.com',
    'whatsapp.com',
    'www.whatsapp.com',
    'threads.net',
    'www.threads.net',
    'meta.com',
    'www.meta.com',
];

/**
 * User agents to try - Googlebot works for Meta properties
 */
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/**
 * DirectFetchStrategy: Most reliable strategy that uses GET requests
 * to directly fetch and verify policy pages exist.
 * 
 * This is more reliable than HEAD requests because many servers
 * (like Facebook, Instagram) don't properly respond to HEAD.
 * 
 * For Meta/Facebook family domains, uses Googlebot user-agent
 * because they block regular browser requests but allow search bots.
 */
export class DirectFetchStrategy implements DiscoveryStrategy {
    name = 'DirectFetchStrategy';

    private readonly PRIORITY_PATHS = [
        '/privacy',
        '/privacy-policy',
        '/privacy/policy',
        '/legal/privacy',
        '/about/privacy',
        '/policies/privacy',
        '/privacy/center',
        '/privacycenter',
        '/help/privacy',
    ];

    /**
     * Check if domain requires bot user-agent
     */
    private requiresBotUA(domain: string): boolean {
        const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
        return BOT_REQUIRED_DOMAINS.some(d => 
            d === domain.toLowerCase() || d === cleanDomain || d === `www.${cleanDomain}`
        );
    }

    async execute(domain: string): Promise<PolicyCandidate[]> {
        const candidates: PolicyCandidate[] = [];
        const useBotUA = this.requiresBotUA(domain);
        
        if (useBotUA) {
            logger.info(`DirectFetch: Using Googlebot UA for ${domain}`);
        }
        
        // First check special domains with explicit URLs
        const specialConfig = CONFIG.SPECIAL_DOMAINS[domain];
        if (specialConfig?.privacy) {
            logger.info(`DirectFetch: Trying special domain URL for ${domain}: ${specialConfig.privacy}`);
            const result = await this.tryUrl(specialConfig.privacy, domain, 'special_domain', useBotUA);
            if (result) {
                candidates.push(result);
                return candidates;
            }
        }

        // For bot-required domains, try known working paths first
        if (useBotUA) {
            const metaPaths = [
                '/privacy/policy/',
                '/privacy/policy',
                '/privacy/',
                '/legal/privacy/',
                '/help/privacy/',
            ];
            
            const baseUrl = domain.startsWith('www.') ? `https://${domain}` : `https://www.${domain}`;
            
            for (const path of metaPaths) {
                const url = `${baseUrl}${path}`;
                logger.info(`DirectFetch: Trying ${url} with Googlebot UA`);
                const result = await this.tryUrl(url, domain, 'direct_fetch', true);
                if (result) {
                    candidates.push(result);
                    return candidates;
                }
            }
        }

        // Try priority paths in parallel with GET requests
        const baseUrl = `https://${domain}`;
        const wwwBaseUrl = `https://www.${domain}`;
        
        // Build all URLs to try
        const urlsToTry: string[] = [];
        for (const path of this.PRIORITY_PATHS) {
            urlsToTry.push(`${baseUrl}${path}`);
            if (!domain.startsWith('www.')) {
                urlsToTry.push(`${wwwBaseUrl}${path}`);
            }
        }

        // Try in batches to avoid overwhelming
        const batchSize = 5;
        for (let i = 0; i < urlsToTry.length; i += batchSize) {
            const batch = urlsToTry.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(url => this.tryUrl(url, domain, 'direct_fetch', useBotUA))
            );
            
            const validResults = results.filter(r => r !== null) as PolicyCandidate[];
            if (validResults.length > 0) {
                // Sort by confidence and return best matches
                validResults.sort((a, b) => b.confidence - a.confidence);
                candidates.push(...validResults.slice(0, 3));
                break; // Stop once we find valid URLs
            }
        }

        return candidates;
    }

    private async tryUrl(url: string, domain: string, source: PolicySource, useBotUA: boolean = false): Promise<PolicyCandidate | null> {
        try {
            // Determine which user agent to use
            const userAgent = useBotUA ? GOOGLEBOT_UA : CONFIG.USER_AGENT;
            
            const response = await got(url, {
                timeout: { request: 12000 },
                retry: { limit: 1 } as any,
                headers: {
                    'User-Agent': userAgent,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                followRedirect: true,
                throwHttpErrors: false,
            });

            // Accept 200 status only for reliability
            if (response.statusCode !== 200) {
                logger.info(`DirectFetch: ${url} returned status ${response.statusCode}`);
                return null;
            }

            const finalUrl = response.url;

            // Check if redirected to login page
            if (!isValidPolicyUrl(finalUrl)) {
                logger.info(`DirectFetch: Skipping ${finalUrl} - appears to be auth page`);
                return null;
            }

            // Verify content looks like a privacy policy
            const body = response.body;
            const bodyLength = body.length;
            
            // For large pages (like Facebook's 2MB page), scan more content
            // Small pages: check first 15KB, Large pages (>100KB): check first 500KB
            const scanSize = bodyLength > 100000 ? 500000 : 15000;
            const lowerBody = body.toLowerCase().slice(0, scanSize);

            // Must have privacy-related content
            const privacyIndicators = [
                'privacy',
                'personal data',
                'personal information',
                'data protection',
                'collect information',
                'data we collect',
                'information we collect',
                'how we use',
                'your data',
                'your information',
                'datenschutz', // German
                'privacidad', // Spanish
            ];

            const matchedIndicators = privacyIndicators.filter(indicator => 
                lowerBody.includes(indicator)
            );
            
            // For bot-fetched pages (like Facebook), we trust the URL more since we know it works
            // Regular pages need 2+ indicators, bot-fetched need just 1 indicator
            const requiredIndicators = useBotUA ? 1 : 2;
            const hasPrivacyContent = matchedIndicators.length >= requiredIndicators;

            // Check for login page indicators (should NOT have these predominantly)
            const loginIndicators = [
                'enter your password',
                'sign in to continue',
                'log in to continue',
                'create an account',
                '<input type="password"',
                'forgot password'
            ];

            const loginMatches = loginIndicators.filter(indicator => 
                lowerBody.includes(indicator)
            ).length;

            const isLikelyLoginPage = loginMatches >= 2;

            if (!hasPrivacyContent) {
                logger.info(`DirectFetch: Skipping ${finalUrl} - insufficient privacy content (found ${matchedIndicators.length}/${requiredIndicators} required: ${matchedIndicators.join(', ')}) [scanned ${scanSize} of ${bodyLength} bytes]`);
                return null;
            }

            if (isLikelyLoginPage) {
                logger.info(`DirectFetch: Skipping ${finalUrl} - appears to be login page`);
                return null;
            }

            // Calculate confidence based on URL, content, and method
            let confidence = 75;
            
            if (source === 'special_domain') {
                confidence = 95;
            } else if (finalUrl.toLowerCase().includes('privacy')) {
                confidence = 85;
            }

            // Boost for multiple privacy indicators
            if (matchedIndicators.length >= 4) {
                confidence += 5;
            }

            // Boost confidence if title looks right
            const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1].toLowerCase().includes('privacy')) {
                confidence += 5;
            }

            // Boost for bot-fetched content (usually more complete)
            if (useBotUA) {
                confidence += 3;
            }

            logger.info(`DirectFetch: Found valid policy at ${finalUrl} (confidence: ${confidence}, indicators: ${matchedIndicators.length})`);

            return {
                url: finalUrl,
                source,
                confidence: Math.min(confidence, 98),
                foundAt: new Date(),
                methodDetail: useBotUA ? 'Direct GET with bot UA' : 'Direct GET request'
            };
        } catch (error: any) {
            logger.info(`DirectFetch: Error fetching ${url}: ${error.message}`);
            return null;
        }
    }
}
