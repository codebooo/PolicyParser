import { logger } from '../logger';

/**
 * Parse PDF buffer and extract text content
 * 
 * Using pdf-parse which works in Node.js server environment.
 * This avoids the pdfjs-dist worker issues in Next.js server actions.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
    try {
        // Use require for CommonJS module - pdf-parse v2.4.5
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');

        // pdf-parse expects a Buffer directly
        const data = await pdfParse(buffer);

        const text = data.text;

        // Clean up the text
        const cleanedText = text
            .replace(/\n\s*\n/g, '\n\n') // Normalize paragraphs
            .replace(/\s+/g, ' ')        // Normalize spaces  
            .trim();

        logger.info(`[parsePdf] Extracted ${cleanedText.length} chars from PDF (${data.numpages} pages)`);
        return cleanedText;
    } catch (error: any) {
        logger.error('[parsePdf] Failed to parse PDF', error);
        throw new Error(`Failed to parse PDF: ${error.message}`);
    }
}
