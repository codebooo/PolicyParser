import { logger } from '../logger';

// Polyfill DOMMatrix for pdfjs-dist in Node.js environment (Next.js server actions)
if (typeof global !== 'undefined' && typeof (global as any).DOMMatrix === 'undefined') {
    (global as any).DOMMatrix = class DOMMatrix {
        a: number = 1; b: number = 0; c: number = 0; d: number = 1; e: number = 0; f: number = 0;
        m11: number = 1; m12: number = 0; m13: number = 0; m14: number = 0;
        m21: number = 0; m22: number = 1; m23: number = 0; m24: number = 0;
        m31: number = 0; m32: number = 0; m33: number = 1; m34: number = 0;
        m41: number = 0; m42: number = 0; m43: number = 0; m44: number = 1;
        is2D: boolean = true;
        isIdentity: boolean = true;

        constructor(init?: string | number[]) {
            if (Array.isArray(init)) {
                if (init.length >= 6) {
                    this.a = init[0]; this.b = init[1]; this.c = init[2];
                    this.d = init[3]; this.e = init[4]; this.f = init[5];
                }
            }
        }
        multiply() { return this; }
        translate() { return this; }
        scale() { return this; }
        rotate() { return this; }
        rotateFromVector() { return this; }
        flipX() { return this; }
        flipY() { return this; }
        skewX() { return this; }
        skewY() { return this; }
        inverse() { return this; }
        transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
        toFloat32Array() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
        toFloat64Array() { return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
        toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
    };
}

/**
 * Parse PDF buffer and extract text content
 * 
 * Using pdf-parse which works in Node.js server environment.
 * Includes DOMMatrix polyfill for pdfjs-dist compatibility.
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
