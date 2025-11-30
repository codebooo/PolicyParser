import got from 'got';
import { CONFIG } from '../config';
import { logger } from '../logger';

/**
 * URLs or patterns that indicate authentication walls or non-policy pages
 */
const BLOCKED_URL_PATTERNS = [
    '/login',
    '/signin',
    '/sign-in',
    '/authenticate',
    '/auth/',
    'accounts.google.com',
    '/oauth',
    '/sso/',
    'login.php',
    '?next=',
    'returnUrl=',
    'redirect_uri=',
    '/challenge/',
    '/checkpoint/'
];

/**
 * Domains that require Googlebot user-agent to fetch content
 * (they block regular browser requests but allow search engine bots)
 */
const BOT_REQUIRED_DOMAINS = [
    'facebook.com',
    'instagram.com',
    'whatsapp.com',
    'threads.net',
    'meta.com',
];

/**
 * Locale codes that indicate non-English content
 * Used to detect geo-redirects to local language versions
 */
const NON_ENGLISH_LOCALE_PATTERNS = [
    /\/de\//i, /\/de-de\//i,    // German
    /\/fr\//i, /\/fr-fr\//i,    // French
    /\/es\//i, /\/es-es\//i,    // Spanish
    /\/it\//i, /\/it-it\//i,    // Italian
    /\/pt\//i, /\/pt-br\//i,    // Portuguese
    /\/nl\//i,                   // Dutch
    /\/pl\//i,                   // Polish
    /\/ru\//i,                   // Russian
    /\/ja\//i,                   // Japanese
    /\/ko\//i,                   // Korean
    /\/zh\//i,                   // Chinese
    /\/ar\//i,                   // Arabic
    /\/tr\//i,                   // Turkish
    /\/sv\//i,                   // Swedish
    /\/no\//i,                   // Norwegian
    /\/da\//i,                   // Danish
    /\/fi\//i,                   // Finnish
];

/**
 * English locale patterns to try if non-English detected
 */
const ENGLISH_LOCALE_REPLACEMENTS: [RegExp, string][] = [
    [/\/(de|fr|es|it|pt|nl|pl|ru|ja|ko|zh|ar|tr|sv|no|da|fi)(-[a-z]{2})?\//i, '/us/'],
    [/\/(de|fr|es|it|pt|nl|pl|ru|ja|ko|zh|ar|tr|sv|no|da|fi)(-[a-z]{2})?\//i, '/en/'],
    [/\/(de|fr|es|it|pt|nl|pl|ru|ja|ko|zh|ar|tr|sv|no|da|fi)(-[a-z]{2})?\//i, '/en-us/'],
];

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/**
 * Validates that a URL is not an authentication/login page
 */
export function isValidPolicyUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return !BLOCKED_URL_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Check if a URL requires bot user-agent
 */
function requiresBotUA(url: string): boolean {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
        return BOT_REQUIRED_DOMAINS.some(domain => 
            hostname === domain || hostname.endsWith(`.${domain}`)
        );
    } catch {
        return false;
    }
}

/**
 * Check if a URL has been redirected to a non-English locale
 */
function hasNonEnglishLocale(url: string): boolean {
    return NON_ENGLISH_LOCALE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Try to convert a localized URL to English version
 */
function getEnglishUrlVariants(url: string): string[] {
    const variants: string[] = [];
    for (const [pattern, replacement] of ENGLISH_LOCALE_REPLACEMENTS) {
        if (pattern.test(url)) {
            variants.push(url.replace(pattern, replacement));
        }
    }
    return variants;
}

/**
 * Core fetch function without locale handling
 */
async function fetchHtmlCore(url: string, userAgent: string): Promise<{ body: string; finalUrl: string }> {
    const response = await got(url, {
        timeout: { request: CONFIG.TIMEOUT_MS },
        headers: { 
            'User-Agent': userAgent,
            // Request English version of pages
            'Accept-Language': 'en-US,en;q=0.9',
            // Some sites check this
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        retry: {
            limit: CONFIG.MAX_RETRIES
        } as any,
        followRedirect: true,
        // Check final URL after redirects
        hooks: {
            afterResponse: [
                (response, retryWithMergedOptions) => {
                    // Check if we got redirected to a login page
                    const finalUrl = response.url;
                    if (!isValidPolicyUrl(finalUrl)) {
                        throw new Error(`Redirected to authentication page: ${finalUrl}`);
                    }
                    return response;
                }
            ]
        }
    });
    
    return { body: response.body, finalUrl: response.url };
}

export async function fetchHtml(url: string): Promise<string> {
    // First check if URL looks like a login page
    if (!isValidPolicyUrl(url)) {
        logger.error(`URL appears to be a login/auth page: ${url}`);
        throw new Error(`Cannot fetch content from authentication page. Please ensure the policy URL is publicly accessible.`);
    }

    // Determine if we need to use Googlebot UA
    const useBotUA = requiresBotUA(url);
    const userAgent = useBotUA ? GOOGLEBOT_UA : CONFIG.USER_AGENT;
    
    if (useBotUA) {
        logger.info(`Using Googlebot UA for ${url}`);
    }

    try {
        let { body, finalUrl } = await fetchHtmlCore(url, userAgent);
        
        // Check if we were redirected to a non-English locale
        if (hasNonEnglishLocale(finalUrl)) {
            logger.info(`[fetchHtml] Detected non-English locale redirect: ${finalUrl}`);
            
            // Try to get English version
            const englishVariants = getEnglishUrlVariants(finalUrl);
            
            for (const englishUrl of englishVariants) {
                try {
                    logger.info(`[fetchHtml] Trying English URL: ${englishUrl}`);
                    const englishResult = await fetchHtmlCore(englishUrl, userAgent);
                    
                    // Check if we got a valid response (not redirected back to non-English)
                    if (!hasNonEnglishLocale(englishResult.finalUrl)) {
                        logger.info(`[fetchHtml] Successfully fetched English version from: ${englishResult.finalUrl}`);
                        body = englishResult.body;
                        finalUrl = englishResult.finalUrl;
                        break;
                    }
                } catch (englishError: any) {
                    logger.debug(`[fetchHtml] English variant ${englishUrl} failed: ${englishError?.message}`);
                    // Continue to next variant
                }
            }
            
            // If still non-English after trying all variants, log warning but continue
            if (hasNonEnglishLocale(finalUrl)) {
                logger.warn(`[fetchHtml] Could not find English version, using localized content from: ${finalUrl}`);
            }
        }

        // Double-check the response body for signs it's a login page
        const lowerBody = body.toLowerCase().slice(0, 5000); // Check first 5KB
        
        const loginIndicators = [
            '<input type="password"',
            'sign in to continue',
            'log in to continue',
            'please log in',
            'login required',
            'authentication required',
            'enter your password'
        ];
        
        if (loginIndicators.some(indicator => lowerBody.includes(indicator))) {
            logger.error(`Page content appears to be a login form: ${url}`);
            throw new Error(`Cannot access policy - page requires authentication`);
        }

        return body;
    } catch (error: any) {
        logger.error(`Failed to fetch HTML from ${url}`, error.message);
        throw new Error(`Failed to fetch content: ${error.message}`);
    }
}
