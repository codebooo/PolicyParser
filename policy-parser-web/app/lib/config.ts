export const CONFIG = {
    MAX_RETRIES: 2,
    TIMEOUT_MS: 15000,
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Discovery - Standard paths for privacy policy (default)
    STANDARD_PATHS: [
        '/privacy',
        '/privacy-policy',
        '/legal/privacy',
        '/legal/privacy-policy',
        '/about/privacy',
        '/policies/privacy',
        '/policy',
        '/privacy/policy',
        '/terms', // Sometimes combined
        '/data-protection',
        '/security'
    ],

    // Pro feature: Multiple policy types
    POLICY_TYPES: {
        privacy: {
            name: 'Privacy Policy',
            paths: [
                '/privacy', 
                '/privacy-policy', 
                '/legal/privacy', 
                '/legal/privacy-policy', 
                '/data-protection', 
                '/privacypolicy',
                '/about/privacy',
                '/policies/privacy',
                '/privacy/policy',
                '/help/privacy',
                '/policy/privacy'
            ],
            keywords: ['privacy', 'personal data', 'data protection', 'data policy']
        },
        terms: {
            name: 'Terms of Service',
            paths: [
                '/terms', 
                '/tos', 
                '/terms-of-service', 
                '/legal/terms', 
                '/terms-and-conditions', 
                '/termsofservice', 
                '/user-agreement',
                '/policies/terms',
                '/about/terms',
                '/legal/tos'
            ],
            keywords: ['terms', 'service', 'agreement', 'conditions', 'user agreement']
        },
        cookies: {
            name: 'Cookie Policy',
            paths: [
                '/cookies', 
                '/cookie-policy', 
                '/legal/cookies', 
                '/cookiepolicy', 
                '/cookie-notice',
                '/policies/cookies',
                '/help/cookies'
            ],
            keywords: ['cookie', 'tracking', 'browser storage']
        },
        security: {
            name: 'Security Policy',
            paths: [
                '/security', 
                '/security-policy', 
                '/legal/security', 
                '/trust', 
                '/trust-center',
                '/about/security'
            ],
            keywords: ['security', 'encryption', 'protection', 'secure']
        },
        gdpr: {
            name: 'GDPR Notice',
            paths: [
                '/gdpr', 
                '/legal/gdpr', 
                '/eu-privacy', 
                '/european-privacy',
                '/privacy/gdpr'
            ],
            keywords: ['gdpr', 'european', 'eu privacy', 'data subject']
        },
        ccpa: {
            name: 'CCPA Notice',
            paths: [
                '/ccpa', 
                '/california-privacy', 
                '/legal/ccpa', 
                '/ca-privacy', 
                '/your-privacy-choices',
                '/privacy/ccpa'
            ],
            keywords: ['ccpa', 'california', 'do not sell', 'consumer privacy']
        },
        ai: {
            name: 'AI/ML Terms',
            paths: [
                '/ai-terms', 
                '/ai-policy', 
                '/machine-learning-policy', 
                '/legal/ai', 
                '/ai-guidelines', 
                '/generative-ai-terms'
            ],
            keywords: ['artificial intelligence', 'machine learning', 'ai', 'model training', 'generative']
        },
        acceptable_use: {
            name: 'Acceptable Use Policy',
            paths: [
                '/acceptable-use', 
                '/aup', 
                '/legal/acceptable-use', 
                '/usage-policy', 
                '/community-guidelines',
                '/policies/community',
                '/community-standards'
            ],
            keywords: ['acceptable use', 'prohibited', 'content policy', 'guidelines']
        }
    } as const,

    // Scoring
    MIN_CONTENT_LENGTH: 500,
    REQUIRED_KEYWORDS: ['privacy', 'personal data', 'collection', 'information'],
    
    // Special domain handling - sites that require specific policy paths
    // because they redirect standard paths to login
    // NOTE: Meta domains require Googlebot User-Agent (handled in DirectFetchStrategy and fetcher)
    SPECIAL_DOMAINS: {
        'facebook.com': {
            privacy: 'https://www.facebook.com/privacy/policy/',
            terms: 'https://www.facebook.com/legal/terms',
        },
        'www.facebook.com': {
            privacy: 'https://www.facebook.com/privacy/policy/',
            terms: 'https://www.facebook.com/legal/terms',
        },
        'meta.com': {
            privacy: 'https://www.facebook.com/privacy/policy/',
        },
        'instagram.com': {
            privacy: 'https://privacycenter.instagram.com/policy',
            terms: 'https://help.instagram.com/581066165581870',
        },
        'threads.net': {
            privacy: 'https://help.instagram.com/515230437301944',
        },
        'whatsapp.com': {
            privacy: 'https://www.whatsapp.com/legal/privacy-policy',
            terms: 'https://www.whatsapp.com/legal/terms-of-service',
        },
        'twitter.com': {
            privacy: 'https://twitter.com/en/privacy',
            terms: 'https://twitter.com/en/tos',
        },
        'x.com': {
            privacy: 'https://x.com/en/privacy',
            terms: 'https://x.com/en/tos',
        },
        'tiktok.com': {
            privacy: 'https://www.tiktok.com/legal/page/row/privacy-policy/en',
            terms: 'https://www.tiktok.com/legal/page/row/terms-of-service/en',
        },
    } as Record<string, Partial<Record<PolicyType | 'privacy' | 'terms' | 'cookies', string>>>,
} as const;

export type PolicyType = keyof typeof CONFIG.POLICY_TYPES;
