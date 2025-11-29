import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { logger } from '../logger';

/**
 * Gemini API keys for rotation when hitting rate limits.
 * Keys are rotated on each call to distribute load.
 */
const GEMINI_API_KEYS = [
    'AIzaSyCkI2lVGTXy6ZU-pUcnUGEgz2Px6elVu6o',
    'AIzaSyBPAVID8wf239kWZmRD3MToArCOie3lXAk',
    'AIzaSyCDLMl4WxOEOjvipo_xF_Jspb-SKIvs-p4'
];

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
    const key = GEMINI_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
    logger.info(`Using Gemini API key index: ${currentKeyIndex}`);
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
