import { DiscoveryStrategy } from './Strategy';
import { PolicyCandidate } from '../types/policy';
import { CONFIG } from '../config';
import got from 'got';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { logger } from '../logger';
import { isValidPolicyUrl } from '../extractor/fetcher';

export class HomepageScraperStrategy implements DiscoveryStrategy {
    name = 'HomepageScraperStrategy';

    async execute(domain: string): Promise<PolicyCandidate[]> {
        const candidates: PolicyCandidate[] = [];
        const url = `https://${domain}`;

        try {
            const response = await got(url, {
                timeout: 10000,
                headers: { 
                    'User-Agent': CONFIG.USER_AGENT,
                    // Request English version of pages
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                retry: 1
            });

            const $ = cheerio.load(response.body);
            const links: { href: string, text: string, context: string }[] = [];

            // Find all links
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();

                if (href) {
                    // Check if inside footer or nav for higher confidence
                    const parentFooter = $(el).closest('footer').length > 0;
                    const parentNav = $(el).closest('nav').length > 0;
                    const context = parentFooter ? 'footer' : (parentNav ? 'nav' : 'body');

                    links.push({ href, text, context });
                }
            });

            // Filter and score
            links.forEach(link => {
                const lowerText = link.text.toLowerCase();
                const lowerHref = link.href.toLowerCase();

                const isPrivacy = lowerText.includes('privacy') || lowerHref.includes('privacy');
                const isLegal = lowerText.includes('legal') || lowerHref.includes('legal');
                const isTerms = lowerText.includes('terms') || lowerHref.includes('terms');

                if (isPrivacy || isLegal || isTerms) {
                    try {
                        // Normalize URL
                        const absoluteUrl = new URL(link.href, url).toString();
                        
                        // Skip if it's an auth page
                        if (!isValidPolicyUrl(absoluteUrl)) {
                            logger.info(`Skipping link ${absoluteUrl} - appears to be auth page`);
                            return;
                        }

                        // Calculate confidence
                        let confidence = 60;
                        if (link.context === 'footer') confidence += 20;
                        if (lowerText === 'privacy policy') confidence += 15;
                        if (lowerText === 'privacy') confidence += 10;

                        candidates.push({
                            url: absoluteUrl,
                            source: 'footer_link',
                            confidence: Math.min(confidence, 95),
                            foundAt: new Date(),
                            methodDetail: `Found link "${link.text}" in ${link.context}`
                        });
                    } catch (e) {
                        // Invalid URL
                    }
                }
            });

        } catch (error) {
            // Homepage fetch failed
        }

        return candidates;
    }
}
