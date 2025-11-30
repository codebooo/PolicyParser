import { fetchHtml } from './fetcher';
import { cleanHtml } from './cleaner';
import { parseContent } from './parser';
import { convertToMarkdown } from './markdown';
import { logger } from '../logger';

export interface ExtractedPolicy {
    title: string;
    markdown: string;
    rawLength: number;
    url: string;
}

export async function extractPolicyContent(url: string): Promise<ExtractedPolicy> {
    logger.info(`[extractPolicyContent] Starting extraction from ${url}`);

    let rawHtml: string;
    try {
        rawHtml = await fetchHtml(url);
        logger.debug(`[extractPolicyContent] Fetched HTML`, { length: rawHtml.length });
    } catch (fetchError: any) {
        logger.error(`[extractPolicyContent] Failed to fetch HTML from ${url}`, {
            error: fetchError?.message
        });
        throw fetchError;
    }

    let cleanedHtml: string;
    try {
        cleanedHtml = cleanHtml(rawHtml);
        logger.debug(`[extractPolicyContent] Cleaned HTML`, { length: cleanedHtml.length });
    } catch (cleanError: any) {
        logger.error(`[extractPolicyContent] Failed to clean HTML`, { error: cleanError?.message });
        throw new Error(`Failed to process page content: ${cleanError?.message}`);
    }

    let parsed;
    try {
        parsed = parseContent(cleanedHtml, url);
        logger.debug(`[extractPolicyContent] Parsed content`, { 
            title: parsed.title, 
            length: parsed.length 
        });
    } catch (parseError: any) {
        logger.error(`[extractPolicyContent] Failed to parse content`, { error: parseError?.message });
        throw new Error(`Failed to parse page content: ${parseError?.message}`);
    }

    let markdown: string;
    try {
        markdown = convertToMarkdown(parsed.content);
        logger.debug(`[extractPolicyContent] Converted to markdown`, { length: markdown.length });
    } catch (mdError: any) {
        logger.error(`[extractPolicyContent] Failed to convert to markdown`, { error: mdError?.message });
        throw new Error(`Failed to convert content: ${mdError?.message}`);
    }

    if (markdown.length < 500) {
        logger.error(`[extractPolicyContent] Content too short`, { 
            markdownLength: markdown.length,
            url,
            title: parsed.title,
            rawHtmlLength: rawHtml.length
        });
        throw new Error(`Extracted content is too short (${markdown.length} chars). The page may be a redirect, require authentication, or not contain a policy document.`);
    }

    logger.info(`[extractPolicyContent] Successfully extracted content from ${url}`, {
        title: parsed.title,
        markdownLength: markdown.length
    });

    return {
        title: parsed.title,
        markdown: markdown,
        rawLength: parsed.length,
        url: url
    };
}
