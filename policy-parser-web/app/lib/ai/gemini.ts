import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { logger } from '../logger';

/**
 * Gemini API keys for rotation when hitting rate limits.
 * Keys should be set as comma-separated values in GEMINI_API_KEYS env var,
 * or a single key in GEMINI_API_KEY env var.
 * 
 * Example: GEMINI_API_KEYS=key1,key2,key3
 */
function getApiKeys(): string[] {
    // Check for multiple keys first
    const multipleKeys = process.env.GEMINI_API_KEYS;
    if (multipleKeys) {
        const keys = multipleKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (keys.length > 0) {
            return keys;
        }
    }
    
    // Fall back to single key
    const singleKey = process.env.GEMINI_API_KEY;
    if (singleKey) {
        return [singleKey];
    }
    
    throw new Error('No Gemini API key configured. Set GEMINI_API_KEY or GEMINI_API_KEYS in .env.local');
}

/**
 * OpenRouter API key for Grok backup (x-ai/grok-3-beta)
 */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Current key index for round-robin rotation
 */
let currentKeyIndex = 0;

/**
 * Get the next API key in rotation
 */
function getNextApiKey(): string {
    const keys = getApiKeys();
    const key = keys[currentKeyIndex % keys.length];
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    logger.info(`Using Gemini API key index: ${currentKeyIndex} of ${keys.length}`);
    return key;
}

/**
 * Create a Gemini provider instance with the next API key in rotation
 */
export function getGeminiProvider() {
    const apiKey = getNextApiKey();
    return createGoogleGenerativeAI({
        apiKey
    });
}

/**
 * Get the Gemini model for analysis
 * Uses gemini-2.5-flash for all operations
 */
export function getGeminiModel() {
    const google = getGeminiProvider();
    return google('gemini-2.5-flash');
}

/**
 * Default model name for Gemini
 */
export const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Backup: OpenRouter Grok model
 * Used when Gemini rate limits are exhausted
 */
export async function getGrokBackupModel() {
    if (!OPENROUTER_API_KEY) {
        logger.warn('OpenRouter API key not configured, Grok backup unavailable');
        return null;
    }
    
    // OpenRouter uses OpenAI-compatible API
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openrouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: OPENROUTER_API_KEY,
    });
    
    return openrouter('x-ai/grok-3-beta');
}
