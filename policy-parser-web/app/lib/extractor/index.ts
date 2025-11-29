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
    logger.info(`Extracting content from ${url}`);

    const rawHtml = await fetchHtml(url);
    const cleanedHtml = cleanHtml(rawHtml);
    const parsed = parseContent(cleanedHtml, url);
    const markdown = convertToMarkdown(parsed.content);

    if (markdown.length < 500) {
        throw new Error('Extracted content is too short (likely failed extraction)');
    }

    return {
        title: parsed.title,
        markdown: markdown,
        rawLength: parsed.length,
        url: url
    };
}
