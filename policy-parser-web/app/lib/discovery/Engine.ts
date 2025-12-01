import { DiscoveryStrategy } from './Strategy';
import { DirectFetchStrategy } from './DirectFetchStrategy';
import { StandardPathStrategy } from './StandardPathStrategy';
import { SitemapStrategy } from './SitemapStrategy';
import { HomepageScraperStrategy } from './HomepageScraperStrategy';
import { SearchFallbackStrategy } from './SearchFallbackStrategy';
import { PolicyCandidate } from '../types/policy';
import { logger } from '../logger';
import { deepLogger } from '../deepLogger';
import { CONFIG } from '../config';
import { deepScanPrivacyPage } from './deepLinkScanner';

export class PolicyDiscoveryEngine {
    private strategies: DiscoveryStrategy[];

    constructor() {
        // STRATEGY ORDER (optimized for reliability):
        // 1. HomepageScraperStrategy - Most reliable, scans footer links
        // 2. DirectFetchStrategy - GET requests with content verification
        // 3. StandardPathStrategy - HEAD requests on common paths
        // 4. SitemapStrategy - Parse sitemap.xml for policy URLs
        // 5. SearchFallbackStrategy - Last resort search engine query
        this.strategies = [
            new HomepageScraperStrategy(),   // PRIMARY - Footer scanning is most reliable
            new DirectFetchStrategy(),       // Secondary - Direct GET verification
            new StandardPathStrategy(),      // Tertiary - Standard path checking
            new SitemapStrategy(),           // Fourth - Sitemap parsing
            new SearchFallbackStrategy()     // Last resort
        ];
    }

    async discover(domain: string): Promise<PolicyCandidate | null> {
        logger.info(`Starting discovery for ${domain}`);
        deepLogger.log('discovery', 'engine_start', 'info', `Starting policy discovery for ${domain}`, {
            domain,
            strategiesCount: this.strategies.length,
            strategyOrder: this.strategies.map(s => s.name)
        });

        // ============ PHASE 0: CHECK SPECIAL DOMAINS FIRST ============
        const cleanDomain = domain.replace(/^www\./, '');
        const specialConfig = CONFIG.SPECIAL_DOMAINS[domain] || 
                              CONFIG.SPECIAL_DOMAINS[`www.${domain}`] ||
                              CONFIG.SPECIAL_DOMAINS[cleanDomain];
        
        if (specialConfig?.privacy) {
            logger.info(`Found SPECIAL_DOMAIN config for ${domain}: ${specialConfig.privacy}`);
            deepLogger.log('discovery', 'special_domain', 'info', 
                `Using special domain config for ${domain}`, {
                    domain,
                    url: specialConfig.privacy
                });
            
            return {
                url: specialConfig.privacy,
                source: 'special_domain' as const,
                confidence: 99,
                foundAt: new Date(),
                methodDetail: `Special domain configuration for ${domain}`
            };
        }

        const allCandidates: PolicyCandidate[] = [];
        const strategyResults: Record<string, { success: boolean; candidatesFound: number; duration: number }> = {};

        for (const strategy of this.strategies) {
            const strategyTimer = deepLogger.time(`strategy_${strategy.name}`);
            
            logger.info(`Running strategy: ${strategy.name}`);
            deepLogger.logStrategy(strategy.name, 'start', { domain });
            
            try {
                const candidates = await strategy.execute(domain);
                const duration = strategyTimer();
                
                strategyResults[strategy.name] = {
                    success: candidates.length > 0,
                    candidatesFound: candidates.length,
                    duration
                };

                if (candidates.length > 0) {
                    logger.info(`Strategy ${strategy.name} found ${candidates.length} candidates`);
                    deepLogger.logStrategy(strategy.name, 'found', {
                        domain,
                        candidatesFound: candidates.length,
                        confidence: candidates[0]?.confidence,
                        url: candidates[0]?.url,
                        duration
                    });
                    
                    // Log each candidate
                    candidates.forEach((c, idx) => {
                        deepLogger.log('discovery', 'candidate_found', 'debug', 
                            `Candidate ${idx + 1}: ${c.url}`, {
                                index: idx,
                                url: c.url,
                                confidence: c.confidence,
                                source: c.source,
                                methodDetail: c.methodDetail
                            });
                    });
                    
                    allCandidates.push(...candidates);

                    // If we found a high confidence candidate (>=85), stop early
                    const perfectMatch = candidates.find(c => c.confidence >= 85);
                    if (perfectMatch) {
                        logger.info(`Found high-confidence match (${perfectMatch.confidence}), stopping early.`);
                        deepLogger.log('discovery', 'early_stop', 'info', 
                            `High-confidence match found, stopping discovery`, {
                                url: perfectMatch.url,
                                confidence: perfectMatch.confidence,
                                strategy: strategy.name
                            });
                        break;
                    }
                } else {
                    deepLogger.logStrategy(strategy.name, 'skip', {
                        domain,
                        reason: 'No candidates found',
                        duration
                    });
                }
            } catch (e: any) {
                const duration = strategyTimer();
                logger.error(`Strategy ${strategy.name} failed`, e);
                deepLogger.logError('discovery', `strategy_${strategy.name}`, e, {
                    domain,
                    duration
                });
                
                strategyResults[strategy.name] = {
                    success: false,
                    candidatesFound: 0,
                    duration
                };
            }
        }

        // Log summary of all strategy results
        deepLogger.log('discovery', 'engine_summary', 'info', 
            `Discovery complete for ${domain}`, {
                domain,
                totalCandidates: allCandidates.length,
                strategyResults,
                topCandidate: allCandidates[0] ? {
                    url: allCandidates[0].url,
                    confidence: allCandidates[0].confidence,
                    source: allCandidates[0].source
                } : null
            });

        if (allCandidates.length === 0) {
            deepLogger.log('discovery', 'no_results', 'warn', 
                `No policy candidates found for ${domain}`, { domain });
            return null;
        }

        // Sort by confidence descending
        allCandidates.sort((a, b) => b.confidence - a.confidence);

        // Return best
        let best = allCandidates[0];
        
        // ============ DEEP LINK SCANNING ============
        // For privacy policies, try to find nested/more specific pages
        // This handles German patterns like /datenschutz/ -> /datenschutz/datenschutzerklaerung/
        try {
            logger.info(`Running deep link scan from ${best.url}`);
            deepLogger.log('discovery', 'deep_scan_start', 'info', 
                `Starting deep link scan from ${best.url}`, {
                    domain,
                    initialUrl: best.url,
                    initialConfidence: best.confidence
                });
            
            const deepResult = await deepScanPrivacyPage(best.url, domain, 2);
            
            if (deepResult && deepResult.confidence > best.confidence) {
                logger.info(`Deep scan found better URL: ${deepResult.foundUrl} (confidence: ${deepResult.confidence})`);
                deepLogger.log('discovery', 'deep_scan_improved', 'info', 
                    `Deep scan found improved privacy policy URL`, {
                        domain,
                        originalUrl: best.url,
                        newUrl: deepResult.foundUrl,
                        originalConfidence: best.confidence,
                        newConfidence: deepResult.confidence,
                        reason: deepResult.reason
                    });
                
                best = {
                    url: deepResult.foundUrl,
                    source: best.source,
                    confidence: deepResult.confidence,
                    foundAt: new Date(),
                    methodDetail: `Deep scan: ${deepResult.reason}`
                };
            } else {
                logger.info(`Deep scan did not find better URL, using ${best.url}`);
            }
        } catch (e: any) {
            logger.error(`Deep scan failed`, e);
            deepLogger.logError('discovery', 'deep_scan', e, { domain, url: best.url });
        }
        
        deepLogger.log('discovery', 'selected', 'info', 
            `Selected best candidate: ${best.url}`, {
                url: best.url,
                confidence: best.confidence,
                source: best.source,
                methodDetail: best.methodDetail,
                totalCandidatesConsidered: allCandidates.length
            });

        logger.info(`Policy found`, { url: best.url, source: best.source, confidence: best.confidence, foundAt: best.foundAt, methodDetail: best.methodDetail });
        return best;
    }
}
