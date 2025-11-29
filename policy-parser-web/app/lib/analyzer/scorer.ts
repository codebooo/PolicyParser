import { AnalysisResult } from '../types/analysis';

export function calculateScore(analysis: Partial<AnalysisResult>): number {
    let score = 100;
    const deductions: string[] = [];

    // 1. Critical Missing Clauses
    const clauses = analysis.clauses_found || [];

    if (!clauses.includes('deletion_clause')) {
        score -= 15;
        deductions.push('No data deletion clause (-15)');
    }

    if (!clauses.includes('contact_clause') && !analysis.contact_info) {
        score -= 10;
        deductions.push('No contact information (-10)');
    }

    // 2. Data Collection & Sharing
    if (analysis.third_party_sharing?.some(s => s.toLowerCase().includes('sell') || s.toLowerCase().includes('marketing'))) {
        score -= 20;
        deductions.push('Sells data or shares for marketing (-20)');
    }

    // 3. Readability
    if (analysis.reading_level === 'Complex') {
        score -= 5;
        deductions.push('Complex legal jargon (-5)');
    }

    // 4. Vague Language (Heuristic based on findings)
    const findings = analysis.key_findings?.join(' ') || '';
    if (findings.toLowerCase().includes('vague') || findings.toLowerCase().includes('unclear')) {
        score -= 10;
        deductions.push('Vague or unclear language (-10)');
    }

    return Math.max(0, score);
}
