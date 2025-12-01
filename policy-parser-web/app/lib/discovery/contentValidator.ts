/**
 * CONTENT VALIDATION MODULE
 * 
 * Industry-standard content analysis to verify that a page actually contains
 * privacy policy content, not just a landing page or profile that mentions "privacy".
 * 
 * @author PolicyParser
 * @version 2.0.0
 */

import { ALL_PRIVACY_TERMS, PRIVACY_TERMS } from './multilingual';
import { logger } from '../logger';

/**
 * Minimum requirements for valid privacy policy content
 */
export const CONTENT_REQUIREMENTS = {
    MIN_LENGTH: 500,            // Minimum character count
    MIN_WORD_COUNT: 100,        // Minimum word count
    MIN_PRIVACY_KEYWORDS: 3,    // Minimum privacy-related keywords
    MIN_SECTIONS: 2,            // Minimum content sections/headers
};

/**
 * Key topics that MUST appear in a valid privacy policy
 * At least 2 of these should be present
 */
export const REQUIRED_TOPICS = {
    en: [
        'personal data', 'personal information', 'data we collect',
        'information we collect', 'how we use', 'data processing',
        'data protection', 'your rights', 'third parties',
        'cookies', 'retention', 'security', 'contact us',
        'data controller', 'lawful basis', 'consent'
    ],
    de: [
        'personenbezogene daten', 'daten erheben', 'datenverarbeitung',
        'ihre rechte', 'dritte', 'cookies', 'datenspeicherung',
        'datensicherheit', 'kontakt', 'verantwortlicher',
        'einwilligung', 'widerspruch', 'auskunft'
    ],
    fr: [
        'données personnelles', 'données collectées', 'traitement des données',
        'vos droits', 'tiers', 'cookies', 'conservation des données',
        'sécurité', 'contact', 'responsable du traitement',
        'consentement', 'droit d\'accès'
    ],
    es: [
        'datos personales', 'datos recogidos', 'tratamiento de datos',
        'sus derechos', 'terceros', 'cookies', 'conservación de datos',
        'seguridad', 'contacto', 'responsable del tratamiento',
        'consentimiento'
    ],
    it: [
        'dati personali', 'dati raccolti', 'trattamento dei dati',
        'i tuoi diritti', 'terzi', 'cookies', 'conservazione dei dati',
        'sicurezza', 'contatto', 'titolare del trattamento',
        'consenso'
    ],
    pt: [
        'dados pessoais', 'dados coletados', 'tratamento de dados',
        'seus direitos', 'terceiros', 'cookies', 'retenção de dados',
        'segurança', 'contato', 'controlador de dados',
        'consentimento'
    ],
    nl: [
        'persoonsgegevens', 'gegevens verzamelen', 'gegevensverwerking',
        'uw rechten', 'derden', 'cookies', 'bewaartermijn',
        'beveiliging', 'contact', 'verwerkingsverantwoordelijke',
        'toestemming'
    ],
    ru: [
        'персональные данные', 'собираемые данные', 'обработка данных',
        'ваши права', 'третьи лица', 'cookies', 'хранение данных',
        'безопасность', 'контакты', 'оператор данных',
        'согласие'
    ],
    ja: [
        '個人情報', '収集する情報', '情報の利用',
        'お客様の権利', '第三者', 'クッキー', 'データ保持',
        'セキュリティ', 'お問い合わせ', 'データ管理者',
        '同意'
    ],
    zh: [
        '个人信息', '收集的信息', '信息使用',
        '您的权利', '第三方', 'cookies', '数据保留',
        '安全', '联系我们', '数据控制者',
        '同意'
    ],
    ko: [
        '개인정보', '수집하는 정보', '정보의 이용',
        '귀하의 권리', '제3자', '쿠키', '데이터 보존',
        '보안', '문의', '데이터 관리자',
        '동의'
    ],
    ar: [
        'البيانات الشخصية', 'البيانات المجمعة', 'معالجة البيانات',
        'حقوقك', 'أطراف ثالثة', 'ملفات تعريف الارتباط', 'الاحتفاظ بالبيانات',
        'الأمان', 'اتصل بنا', 'مراقب البيانات',
        'الموافقة'
    ],
    tr: [
        'kişisel veriler', 'toplanan veriler', 'veri işleme',
        'haklarınız', 'üçüncü taraflar', 'çerezler', 'veri saklama',
        'güvenlik', 'iletişim', 'veri sorumlusu',
        'onay', 'kvkk'
    ],
};

/**
 * Patterns that indicate this is NOT a privacy policy
 * (False positive indicators)
 */
export const NEGATIVE_INDICATORS = [
    // Social media profile pages
    /followers?\s*:\s*\d+/i,
    /following\s*:\s*\d+/i,
    /posts?\s*:\s*\d+/i,
    /connections?\s*:\s*\d+/i,
    /^\s*about\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s*$/im,  // "About John Smith" pattern
    /^\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s*\|\s*LinkedIn/im,
    /company\s+size\s*:\s*/i,
    /industry\s*:\s*/i,
    /headquarters\s*:\s*/i,
    /founded\s*:\s*\d{4}/i,
    
    // News articles
    /^(breaking|latest|news|article|story)\s*:/i,
    /published\s+(on\s+)?\w+\s+\d{1,2},\s+\d{4}/i,
    /by\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s*$/im,
    /min\s+read/i,
    /share\s+(this\s+)?(article|story|post)/i,
    
    // Product pages
    /add\s+to\s+cart/i,
    /buy\s+now/i,
    /price\s*:\s*[$€£¥]/i,
    /in\s+stock/i,
    /out\s+of\s+stock/i,
    /customer\s+reviews?\s*\(\d+\)/i,
    
    // Login/Auth pages
    /sign\s+in\s+with/i,
    /log\s+in\s+to\s+continue/i,
    /create\s+(an?\s+)?account/i,
    /forgot\s+(your\s+)?password/i,
    /don't\s+have\s+an?\s+account/i,
    
    // Directory listings
    /similar\s+companies/i,
    /related\s+companies/i,
    /competitors/i,
    /company\s+profile/i,
    /business\s+profile/i,
];

/**
 * Positive indicators that this IS a privacy policy
 */
export const POSITIVE_INDICATORS = [
    // Legal structure markers
    /last\s+updated\s*:?\s*/i,
    /effective\s+date\s*:?\s*/i,
    /version\s*:?\s*\d/i,
    
    // GDPR markers
    /gdpr/i,
    /general\s+data\s+protection\s+regulation/i,
    /article\s+\d{1,2}/i,  // Legal article references
    /data\s+subject/i,
    /lawful\s+basis/i,
    /legitimate\s+interest/i,
    /data\s+controller/i,
    /data\s+processor/i,
    /supervisory\s+authority/i,
    /dpo|data\s+protection\s+officer/i,
    
    // CCPA markers
    /ccpa/i,
    /california\s+consumer\s+privacy/i,
    /do\s+not\s+sell/i,
    /shine\s+the\s+light/i,
    /california\s+resident/i,
    
    // German law markers
    /dsgvo/i,
    /bundesdatenschutzgesetz/i,
    /bdsg/i,
    /telemediengesetz/i,
    /tmg/i,
    
    // Section headers
    /what\s+information\s+(do\s+)?we\s+collect/i,
    /how\s+(do\s+)?we\s+use\s+(your\s+)?information/i,
    /how\s+(do\s+)?we\s+share\s+(your\s+)?information/i,
    /your\s+(privacy\s+)?(rights|choices)/i,
    /how\s+to\s+contact\s+us/i,
    /data\s+retention/i,
    /security\s+measures/i,
    /children('s)?\s+privacy/i,
    /international\s+transfers?/i,
    /cookies?\s+(and|&)\s+tracking/i,
    
    // Table of contents patterns
    /table\s+of\s+contents/i,
    /^\s*\d+\.\s+(introduction|scope|definitions)/im,
];

/**
 * Content validation result
 */
export interface ContentValidationResult {
    isValid: boolean;
    confidence: number;
    issues: string[];
    metrics: {
        characterCount: number;
        wordCount: number;
        privacyKeywordCount: number;
        topicsFound: string[];
        positiveIndicators: number;
        negativeIndicators: number;
        detectedLanguage: string | null;
    };
}

/**
 * Detect the primary language of the content
 */
export function detectLanguage(text: string): string | null {
    const lowerText = text.toLowerCase();
    const languageScores: Record<string, number> = {};
    
    for (const [lang, terms] of Object.entries(PRIVACY_TERMS)) {
        let score = 0;
        for (const term of Object.values(terms)) {
            const matches = (lowerText.match(new RegExp(term, 'gi')) || []).length;
            score += matches;
        }
        if (score > 0) {
            languageScores[lang] = score;
        }
    }
    
    // Find language with highest score
    let bestLang: string | null = null;
    let bestScore = 0;
    
    for (const [lang, score] of Object.entries(languageScores)) {
        if (score > bestScore) {
            bestScore = score;
            bestLang = lang;
        }
    }
    
    return bestLang;
}

/**
 * Count privacy-related keywords in content
 */
export function countPrivacyKeywords(text: string): { count: number; terms: string[] } {
    const lowerText = text.toLowerCase();
    const foundTerms: string[] = [];
    let count = 0;
    
    for (const term of ALL_PRIVACY_TERMS) {
        const matches = (lowerText.match(new RegExp(term, 'gi')) || []).length;
        if (matches > 0) {
            count += matches;
            if (!foundTerms.includes(term)) {
                foundTerms.push(term);
            }
        }
    }
    
    return { count, terms: foundTerms };
}

/**
 * Find required topics present in content
 */
export function findRequiredTopics(text: string, language: string | null): string[] {
    const lowerText = text.toLowerCase();
    const foundTopics: string[] = [];
    
    // Get topics for detected language, fallback to English
    const langKey = (language || 'en') as keyof typeof REQUIRED_TOPICS;
    const topics = REQUIRED_TOPICS[langKey] || REQUIRED_TOPICS.en;
    
    for (const topic of topics) {
        if (lowerText.includes(topic.toLowerCase())) {
            foundTopics.push(topic);
        }
    }
    
    // Also check English topics if different language
    if (language && language !== 'en') {
        for (const topic of REQUIRED_TOPICS.en) {
            if (lowerText.includes(topic.toLowerCase()) && !foundTopics.includes(topic)) {
                foundTopics.push(topic);
            }
        }
    }
    
    return foundTopics;
}

/**
 * Count positive indicators in content
 */
export function countPositiveIndicators(text: string): number {
    let count = 0;
    
    for (const pattern of POSITIVE_INDICATORS) {
        if (pattern.test(text)) {
            count++;
        }
    }
    
    return count;
}

/**
 * Count negative indicators in content
 */
export function countNegativeIndicators(text: string): number {
    let count = 0;
    
    for (const pattern of NEGATIVE_INDICATORS) {
        if (pattern.test(text)) {
            count++;
        }
    }
    
    return count;
}

/**
 * Main content validation function
 * Returns whether the content appears to be a genuine privacy policy
 */
export function validatePolicyContent(text: string): ContentValidationResult {
    const issues: string[] = [];
    
    // Basic metrics
    const characterCount = text.length;
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    
    // Check minimum length
    if (characterCount < CONTENT_REQUIREMENTS.MIN_LENGTH) {
        issues.push(`Content too short (${characterCount} chars, need ${CONTENT_REQUIREMENTS.MIN_LENGTH})`);
    }
    
    if (wordCount < CONTENT_REQUIREMENTS.MIN_WORD_COUNT) {
        issues.push(`Not enough words (${wordCount}, need ${CONTENT_REQUIREMENTS.MIN_WORD_COUNT})`);
    }
    
    // Language detection
    const detectedLanguage = detectLanguage(text);
    
    // Privacy keyword analysis
    const keywordResult = countPrivacyKeywords(text);
    if (keywordResult.count < CONTENT_REQUIREMENTS.MIN_PRIVACY_KEYWORDS) {
        issues.push(`Not enough privacy keywords (${keywordResult.count}, need ${CONTENT_REQUIREMENTS.MIN_PRIVACY_KEYWORDS})`);
    }
    
    // Required topics check
    const topicsFound = findRequiredTopics(text, detectedLanguage);
    if (topicsFound.length < CONTENT_REQUIREMENTS.MIN_SECTIONS) {
        issues.push(`Not enough privacy topics covered (${topicsFound.length}, need ${CONTENT_REQUIREMENTS.MIN_SECTIONS})`);
    }
    
    // Indicator analysis
    const positiveIndicators = countPositiveIndicators(text);
    const negativeIndicators = countNegativeIndicators(text);
    
    if (negativeIndicators > positiveIndicators) {
        issues.push(`More negative indicators (${negativeIndicators}) than positive (${positiveIndicators}) - may not be a privacy policy`);
    }
    
    // Calculate confidence score
    let confidence = 50; // Base score
    
    // Length bonus/penalty
    if (characterCount >= 2000) confidence += 10;
    if (characterCount >= 5000) confidence += 10;
    if (characterCount < 500) confidence -= 30;
    
    // Keyword bonus
    if (keywordResult.count >= 10) confidence += 15;
    if (keywordResult.count >= 20) confidence += 10;
    
    // Topics bonus
    if (topicsFound.length >= 5) confidence += 15;
    if (topicsFound.length >= 10) confidence += 10;
    
    // Indicator adjustment
    confidence += (positiveIndicators * 3);
    confidence -= (negativeIndicators * 5);
    
    // Ensure bounds
    confidence = Math.max(0, Math.min(100, confidence));
    
    // Final validity check
    const isValid = 
        characterCount >= CONTENT_REQUIREMENTS.MIN_LENGTH &&
        keywordResult.count >= CONTENT_REQUIREMENTS.MIN_PRIVACY_KEYWORDS &&
        topicsFound.length >= CONTENT_REQUIREMENTS.MIN_SECTIONS &&
        negativeIndicators <= positiveIndicators + 2 &&
        confidence >= 40;
    
    return {
        isValid,
        confidence,
        issues,
        metrics: {
            characterCount,
            wordCount,
            privacyKeywordCount: keywordResult.count,
            topicsFound,
            positiveIndicators,
            negativeIndicators,
            detectedLanguage
        }
    };
}

/**
 * Quick check if content is obviously NOT a privacy policy
 * Used for fast filtering before full validation
 */
export function quickRejectCheck(text: string): { rejected: boolean; reason?: string } {
    // Too short
    if (text.length < 200) {
        return { rejected: true, reason: 'Content too short' };
    }
    
    // Check for strong negative indicators
    const lowerText = text.toLowerCase();
    
    // LinkedIn company profile pattern
    if (lowerText.includes('linkedin') && 
        (lowerText.includes('followers') || lowerText.includes('employees on linkedin'))) {
        return { rejected: true, reason: 'Appears to be a LinkedIn profile' };
    }
    
    // Facebook page pattern
    if (lowerText.includes('facebook') && 
        (lowerText.includes('likes') || lowerText.includes('people like this'))) {
        return { rejected: true, reason: 'Appears to be a Facebook page' };
    }
    
    // News article pattern
    if (/\d+\s+min\s+read/i.test(text) || /published\s+\d+\s+(hours?|days?|weeks?)\s+ago/i.test(text)) {
        return { rejected: true, reason: 'Appears to be a news article' };
    }
    
    // Company directory pattern
    if (lowerText.includes('company size') && lowerText.includes('industry') && lowerText.includes('headquarters')) {
        return { rejected: true, reason: 'Appears to be a company directory listing' };
    }
    
    // No privacy-related content at all
    const hasAnyPrivacyTerm = ALL_PRIVACY_TERMS.some(term => lowerText.includes(term.toLowerCase()));
    if (!hasAnyPrivacyTerm) {
        return { rejected: true, reason: 'No privacy-related terms found' };
    }
    
    return { rejected: false };
}

/**
 * Log content validation for debugging
 */
export function logContentValidation(url: string, text: string): void {
    const quickCheck = quickRejectCheck(text);
    
    if (quickCheck.rejected) {
        logger.info(`Content rejected for ${url}: ${quickCheck.reason}`);
        return;
    }
    
    const result = validatePolicyContent(text);
    
    logger.info(`Content validation for ${url}`, {
        isValid: result.isValid,
        confidence: result.confidence,
        language: result.metrics.detectedLanguage,
        wordCount: result.metrics.wordCount,
        topicsFound: result.metrics.topicsFound.length,
        positiveIndicators: result.metrics.positiveIndicators,
        negativeIndicators: result.metrics.negativeIndicators,
        issues: result.issues
    });
}
