import { z } from 'zod';

/**
 * Category labels for key findings, matching the UI color scheme:
 * - THREAT: Critical privacy violations, data sales, severe security risks (red)
 * - WARNING: Major concerns like broad data sharing, indefinite retention (orange)
 * - CAUTION: Minor issues or vague wording requiring attention (yellow)
 * - NORMAL: Standard industry practices, neither good nor bad (gray)
 * - GOOD: Positive features like opt-outs, data deletion rights (green)
 * - BRILLIANT: Exceptional user protection going above and beyond (cyan)
 */
export const FindingCategory = z.enum([
    'THREAT',
    'WARNING', 
    'CAUTION',
    'NORMAL',
    'GOOD',
    'BRILLIANT'
]);

export type FindingCategoryType = z.infer<typeof FindingCategory>;

export const LabeledFindingSchema = z.object({
    category: FindingCategory,
    text: z.string()
});

export type LabeledFinding = z.infer<typeof LabeledFindingSchema>;

export const SecureUsageRecommendationSchema = z.object({
    priority: z.enum(['high', 'medium', 'low']),
    recommendation: z.string()
});

export type SecureUsageRecommendation = z.infer<typeof SecureUsageRecommendationSchema>;

export const AnalysisResultSchema = z.object({
    // AI may return any number, we clamp to 0-100 in the code after parsing
    score: z.number(),
    summary: z.string(),
    key_findings: z.array(LabeledFindingSchema), // Now labeled with categories
    data_collected: z.array(z.string()),
    third_party_sharing: z.array(z.string()),
    user_rights: z.array(z.string()),
    secure_usage_recommendations: z.array(SecureUsageRecommendationSchema), // New: Tips for secure usage
    contact_info: z.string().optional(),
    last_updated: z.string().optional(),
    word_count: z.number().optional(),
    reading_level: z.string().optional(),
    clauses_found: z.array(z.string()).optional(), // For deterministic scoring
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
