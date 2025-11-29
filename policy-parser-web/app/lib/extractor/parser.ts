import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface ParsedContent {
    title: string;
    content: string; // HTML content
    textContent: string;
    byline: string;
    length: number;
}

export function parseContent(html: string, url: string): ParsedContent {
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (!article) {
        throw new Error('Failed to parse content with Readability');
    }

    return {
        title: article.title || 'Untitled',
        content: article.content || '',
        textContent: article.textContent || '',
        byline: article.byline || '',
        length: article.length || 0
    };
}
