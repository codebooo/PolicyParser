import got from 'got';
import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import { logger } from '../logger';

/**
 * Common company name to domain mappings for popular services.
 * This provides a fallback when search engines block requests.
 */
const KNOWN_COMPANIES: Record<string, string> = {
    'google': 'google.com',
    'youtube': 'youtube.com',
    'facebook': 'facebook.com',
    'meta': 'meta.com',
    'instagram': 'instagram.com',
    'twitter': 'twitter.com',
    'x': 'x.com',
    'amazon': 'amazon.com',
    'apple': 'apple.com',
    'microsoft': 'microsoft.com',
    'netflix': 'netflix.com',
    'spotify': 'spotify.com',
    'tiktok': 'tiktok.com',
    'reddit': 'reddit.com',
    'linkedin': 'linkedin.com',
    'discord': 'discord.com',
    'twitch': 'twitch.tv',
    'snapchat': 'snapchat.com',
    'pinterest': 'pinterest.com',
    'whatsapp': 'whatsapp.com',
    'telegram': 'telegram.org',
    'slack': 'slack.com',
    'zoom': 'zoom.us',
    'dropbox': 'dropbox.com',
    'github': 'github.com',
    'gitlab': 'gitlab.com',
    'notion': 'notion.so',
    'figma': 'figma.com',
    'canva': 'canva.com',
    'adobe': 'adobe.com',
    'paypal': 'paypal.com',
    'stripe': 'stripe.com',
    'shopify': 'shopify.com',
    'ebay': 'ebay.com',
    'airbnb': 'airbnb.com',
    'uber': 'uber.com',
    'lyft': 'lyft.com',
    'doordash': 'doordash.com',
    'grubhub': 'grubhub.com',
    'openai': 'openai.com',
    'chatgpt': 'openai.com',
    'anthropic': 'anthropic.com',
    'claude': 'anthropic.com',
    'hulu': 'hulu.com',
    'disney': 'disney.com',
    'disney+': 'disneyplus.com',
    'disneyplus': 'disneyplus.com',
    'hbo': 'hbo.com',
    'hbomax': 'max.com',
    'max': 'max.com',
    'paramount': 'paramount.com',
    'peacock': 'peacocktv.com',
    'crunchyroll': 'crunchyroll.com',
    'steam': 'steampowered.com',
    'epic': 'epicgames.com',
    'epicgames': 'epicgames.com',
    'playstation': 'playstation.com',
    'xbox': 'xbox.com',
    'nintendo': 'nintendo.com',
    'roblox': 'roblox.com',
    'minecraft': 'minecraft.net',
    'valve': 'valvesoftware.com',
    'ea': 'ea.com',
    'activision': 'activision.com',
    'blizzard': 'blizzard.com',
    'ubisoft': 'ubisoft.com',
    'walmart': 'walmart.com',
    'target': 'target.com',
    'costco': 'costco.com',
    'bestbuy': 'bestbuy.com',
    'ikea': 'ikea.com',
    'nike': 'nike.com',
    'adidas': 'adidas.com',
    'samsung': 'samsung.com',
    'sony': 'sony.com',
    'lg': 'lg.com',
    'dell': 'dell.com',
    'hp': 'hp.com',
    'lenovo': 'lenovo.com',
    'asus': 'asus.com',
    'acer': 'acer.com',
    'intel': 'intel.com',
    'amd': 'amd.com',
    'nvidia': 'nvidia.com',
    'tesla': 'tesla.com',
    'ford': 'ford.com',
    'toyota': 'toyota.com',
    'bmw': 'bmw.com',
    'mercedes': 'mercedes-benz.com',
    'volkswagen': 'volkswagen.com',
    'honda': 'honda.com',
    'visa': 'visa.com',
    'mastercard': 'mastercard.com',
    'amex': 'americanexpress.com',
    'americanexpress': 'americanexpress.com',
    'chase': 'chase.com',
    'bankofamerica': 'bankofamerica.com',
    'wellsfargo': 'wellsfargo.com',
    'citi': 'citi.com',
    'capitalone': 'capitalone.com',
    'coinbase': 'coinbase.com',
    'binance': 'binance.com',
    'kraken': 'kraken.com',
    'robinhood': 'robinhood.com',
    'venmo': 'venmo.com',
    'cashapp': 'cash.app',
    'zelle': 'zellepay.com',
};

export async function resolveCompanyToDomain(companyName: string): Promise<string | null> {
    const normalizedName = companyName.toLowerCase().trim().replace(/\s+/g, '');
    
    // First, check known companies map (instant, no network)
    if (KNOWN_COMPANIES[normalizedName]) {
        logger.info(`Found '${companyName}' in known companies map: ${KNOWN_COMPANIES[normalizedName]}`);
        return KNOWN_COMPANIES[normalizedName];
    }

    // Try search as fallback
    try {
        const query = encodeURIComponent(companyName);
        const url = `https://html.duckduckgo.com/html/?q=${query}`;

        const response = await got(url, {
            headers: {
                'User-Agent': CONFIG.USER_AGENT
            },
            timeout: { request: CONFIG.TIMEOUT_MS },
            retry: {
                limit: CONFIG.MAX_RETRIES
            } as any
        });

        const $ = cheerio.load(response.body);

        // Find the first result link
        const firstLink = $('.result__a').first().attr('href');

        if (!firstLink) {
            // Fall back to guessing domain
            return guessDomain(companyName);
        }

        return firstLink;
    } catch (error: any) {
        logger.error(`Search resolution failed for ${companyName}`, error.message);
        // Fall back to domain guessing
        return guessDomain(companyName);
    }
}

/**
 * Attempts to guess the domain from a company name.
 * Tries common TLDs as a last resort.
 */
function guessDomain(companyName: string): string {
    const normalized = companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, ''); // Remove special characters
    
    // Just return the most likely .com domain
    logger.info(`Guessing domain for '${companyName}': ${normalized}.com`);
    return `${normalized}.com`;
}
