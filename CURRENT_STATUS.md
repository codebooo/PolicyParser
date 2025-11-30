# Current Status & Changelog

## Project Overview
**PolicyParser** is a Next.js web application designed to analyze policy documents using AI. It features a modern, dark-themed UI with a responsive design.

## Current Status
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **AI Provider**: Google Gemini (`gemini-2.5-flash`) with 3-key rotation
- **UI Components**: Custom components using `lucide-react` icons.
- **Features**:
  - Landing page with "How it works" section.
  - Analysis page with file upload and text input.
  - Privacy Policy and Terms of Service pages.
  - **Labeled Key Findings**: Color-coded categories (THREAT, WARNING, CAUTION, NORMAL, GOOD, BRILLIANT)
  - **Original Text View**: Full extracted policy text without AI modification
  - **Secure Usage Recommendations**: AI-powered tips for secure service usage
  - **Pro Feature**: Comprehensive multi-policy analysis (Privacy, Terms, Cookies, Security, GDPR, CCPA, AI Terms, Acceptable Use)
  - **PAWD Algorithm**: Policy Auto-Web Discovery with English preference and login page detection

## Active Tasks
- [x] Fix hydration errors caused by browser extensions.
- [x] Update background gradient to `linear-gradient(69deg, #000000, #1a5a5a)`.
- [x] Integrate Google Gemini API for real analysis.
- [x] Implement "Search Company" feature using AI to find policies.
- [x] Add labeled key findings with severity categories.
- [x] Add Original Text button for raw policy viewing.
- [x] Add Secure Usage Recommendations box.
- [x] Fix PAWD to prefer English/original policies.
- [x] Fix login page redirect detection (Facebook, Instagram, etc.).
- [x] Enable deep logging by default with file persistence.
- [x] Improve policy analysis error handling and logging.
- [x] Fix track policy button (requires tracked_policies table).

## Changelog

### [2025-11-30] - Deep Logging & Track Policy Fixes
- **Feature**: Enabled deep logging by default - logs are now saved to `/deep_logs/` folder
- **Fix**: Improved `analyzeSpecificPolicy` with detailed step-by-step error logging
- **Fix**: Improved `extractPolicyContent` with comprehensive error handling and debugging
- **Fix**: Track policy now shows detailed error messages instead of generic failures
- **Fix**: Track policy now excludes `rawPolicyText` from stored analysis to prevent storage issues
- **Migration**: Added `supabase/migrations/20241130_create_tracked_policies.sql` - MUST be run on Supabase

### [2025-11-29] - Key Findings Labels & Secure Usage
- **Feature**: Added labeled key findings with 6 severity categories:
  - `THREAT` (red): Critical privacy violations, data sales, severe security risks
  - `WARNING` (orange): Major concerns like broad data sharing, indefinite retention
  - `CAUTION` (yellow): Minor issues or vague wording requiring attention
  - `NORMAL` (gray): Standard industry practices
  - `GOOD` (green): Positive features like opt-outs, data deletion rights
  - `BRILLIANT` (cyan): Exceptional user protection
- **Feature**: Added "Original Text" button to view full extracted policy without AI modification
- **Feature**: Added "Secure Usage Recommendations" card with AI-generated tips for secure service usage
- **Fix**: Updated PAWD algorithm to always prefer English/original policies (`Accept-Language: en-US,en;q=0.9`)
- **Fix**: Added login page detection to prevent analyzing authentication pages
  - Detects redirect URLs containing `/login`, `/signin`, `?next=`, etc.
  - Detects login form content in page HTML
- **Fix**: Added special domain handling for sites that redirect policy URLs (Facebook, Instagram, WhatsApp, Threads)
- **Update**: Improved User-Agent string for better compatibility
- **Update**: Added more standard policy paths for discovery
- **Update**: AI prompt now generates structured findings with categories and secure usage recommendations

### [2025-11-28] - Gemini Integration & Pro Features
- **Feature**: Switched from OpenAI to Gemini AI (`gemini-2.5-flash`) with 3-key rotation
- **Feature**: Added Pro multi-policy analysis (Privacy, Terms, Cookies, Security, GDPR, CCPA, AI Terms, Acceptable Use)
- **Feature**: Added 100+ known company-to-domain mappings for reliable resolution
- **Fix**: Fixed `ai/rsc` module import to use `@ai-sdk/rsc`
- **Fix**: Fixed `checkTrackedPoliciesForUpdates` export

### [2025-11-20] - UI Enhancements
- **Feature**: Added "Full Text" view mode with AI-generated navigation sidebar and scroll-to-section functionality.
- **Update**: Redesigned background to match "The Ready" aesthetic (Deep Purple/Black with vibrant Pink/Orange gradients and grain).
- **Feature**: Added "Bullet Point" view mode with color-coded categories.
- **Feature**: Implemented "Privacy Score" (0-100) with a consistent scoring rubric.
- **Fix**: Corrected Gemini API model name to `gemini-2.5-pro` as requested.
- **Fix**: Adjusted z-index and opacity of grain overlay to ensure visibility over the gradient.
- **Added**: `CURRENT_STATUS.md` to track project progress.
- **Update**: Background gradient changed to `linear-gradient(69deg, #000000, #1a5a5a)` with grain overlay.
- **Fix**: Attempted to fix hydration errors on SVG icons by adding `suppressHydrationWarning`.
- **Feature**: Integrated Google Gemini API for real document analysis (replacing mock data).

## Architecture Notes

### PAWD (Policy Auto-Web Discovery) Algorithm
1. **DirectFetchStrategy** (NEW): Most reliable - uses GET requests with content verification
2. **StandardPathStrategy**: Checks common policy paths with HEAD/GET requests + special domain handling
3. **SitemapStrategy**: Parses sitemap.xml for policy URLs
4. **HomepageScraperStrategy**: Scrapes footer links for policy references
5. **SearchFallbackStrategy**: Uses DuckDuckGo and Bing search as last resort

### Login Page Detection
- URL patterns: `/login`, `/signin`, `/auth/`, `?next=`, `returnUrl=`, etc.
- Content patterns: password inputs, "sign in to continue", etc.
- Special domain configs for sites that require known policy URLs

### Key Findings Schema
```typescript
interface LabeledFinding {
  category: "THREAT" | "WARNING" | "CAUTION" | "NORMAL" | "GOOD" | "BRILLIANT";
  text: string;
}

interface SecureUsageRecommendation {
  priority: "high" | "medium" | "low";
  recommendation: string;
}
```
