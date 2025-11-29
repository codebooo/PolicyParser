import { DiscoveryStrategy } from './Strategy';
import { DirectFetchStrategy } from './DirectFetchStrategy';
import { StandardPathStrategy } from './StandardPathStrategy';
import { SitemapStrategy } from './SitemapStrategy';
import { HomepageScraperStrategy } from './HomepageScraperStrategy';
import { SearchFallbackStrategy } from './SearchFallbackStrategy';
import { PolicyCandidate } from '../types/policy';
import { logger } from '../logger';

export class PolicyDiscoveryEngine {
    private strategies: DiscoveryStrategy[];

    constructor() {
        this.strategies = [
            new DirectFetchStrategy(),    // Most reliable - uses GET with content verification
            new StandardPathStrategy(),   // HEAD requests on standard paths
            new SitemapStrategy(),        // Includes Robots.txt check internally
            new HomepageScraperStrategy(),
            new SearchFallbackStrategy()
        ];
    }

    async discover(domain: string): Promise<PolicyCandidate | null> {
        logger.info(`Starting discovery for ${domain}`);

        const allCandidates: PolicyCandidate[] = [];

        for (const strategy of this.strategies) {
            logger.info(`Running strategy: ${strategy.name}`);
            try {
                const candidates = await strategy.execute(domain);
                if (candidates.length > 0) {
                    logger.info(`Strategy ${strategy.name} found ${candidates.length} candidates`);
                    allCandidates.push(...candidates);

                    // If we found a high confidence candidate (>=85), stop early
                    const perfectMatch = candidates.find(c => c.confidence >= 85);
                    if (perfectMatch) {
                        logger.info(`Found high-confidence match (${perfectMatch.confidence}), stopping early.`);
                        break;
                    }
                }
            } catch (e) {
                logger.error(`Strategy ${strategy.name} failed`, e);
            }
        }

        if (allCandidates.length === 0) {
            return null;
        }

        // Sort by confidence descending
        allCandidates.sort((a, b) => b.confidence - a.confidence);

        // Return best
        return allCandidates[0];
    }
}
