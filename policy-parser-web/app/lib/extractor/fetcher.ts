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

        // Double-check the response body for signs it's a login page
        const body = response.body;
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
