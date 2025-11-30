import { DiscoveryStrategy } from './Strategy';
import { DirectFetchStrategy } from './DirectFetchStrategy';
import { StandardPathStrategy } from './StandardPathStrategy';
import { SitemapStrategy } from './SitemapStrategy';
import { HomepageScraperStrategy } from './HomepageScraperStrategy';
import { SearchFallbackStrategy } from './SearchFallbackStrategy';
import { PolicyCandidate } from '../types/policy';
import { logger } from '../logger';
import { deepLogger } from '../deepLogger';

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
        const best = allCandidates[0];
        deepLogger.log('discovery', 'selected', 'info', 
            `Selected best candidate: ${best.url}`, {
                url: best.url,
                confidence: best.confidence,
                source: best.source,
                methodDetail: best.methodDetail,
                totalCandidatesConsidered: allCandidates.length
            });

        return best;
    }
}
