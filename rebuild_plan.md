# PolicyParser Rebuild Plan: PAWD 3.0 & ANAL 3.0

## Overview
This plan outlines the complete overhaul of the Policy Automated Web Detector (PAWD) and Analysis Logic (ANAL) to address accuracy issues, specifically targeting the "Ebay failure" case where incorrect URLs and garbage content were processed.

## Phase 1: PAWD 3.0 (The "Search-First" Crawler)

The current "crawl from homepage" strategy is inefficient and error-prone for large sites like Ebay. We will shift to a **Search-First** architecture.

### 1. New Discovery Pipeline
Instead of guessing `/privacy` or crawling `ebay.com`, we will:
1.  **Search Engine Query:** Perform a targeted search query (e.g., `site:ebay.com "privacy policy"`) using a robust search scraper (e.g., DuckDuckGo HTML scraping or a custom Google Search wrapper).
2.  **Result Filtering:**
    *   Prioritize URLs containing `privacy`, `legal`, `policy`.
    *   **Exclude** URLs containing `help`, `community`, `support`, `topic`, `faq` (This fixes the Ebay issue where it picked a help article).
    *   Prefer shorter URLs (main policies usually have cleaner URLs).

### 2. Enhanced Puppeteer Extraction
*   **Browser Management:** Improve the `puppeteer` launch logic to reliably find Chrome/Chromium on both Windows (Local) and Linux (Production) without hardcoded paths.
*   **Smart Rendering:**
    *   Block images, fonts, and stylesheets to speed up loading.
    *   Wait for specific text content (e.g., "Effective Date") rather than just `networkidle`.
*   **Content Cleaning:**
    *   Use `@mozilla/readability` (already present) but **tune it** to exclude navigation, footers, and cookie banners more aggressively.
    *   Convert the cleaned HTML to **Markdown** using `turndown`. Markdown is much easier for LLMs to understand than raw text or HTML.

### 3. The "Is-This-It?" Validator
Before passing content to the heavy analyzer:
*   Run a cheap, fast AI check (Gemini Flash or just a regex heuristic).
*   **Check:** Does the title contain "Privacy Policy"? Does the text contain "collect", "use", "share", "rights"?
*   If validation fails, try the next URL from the search results.

## Phase 2: ANAL 3.0 (The "Context-Aware" Analyzer)

The current Map-Reduce approach is over-engineered for Gemini 2.5 Pro, which has a massive context window. It fragments context and leads to hallucinations.

### 1. Single-Pass "God Mode" Analysis
*   **Input:** The *entire* policy in Markdown format (up to ~500k tokens, which covers 99.9% of policies).
*   **Model:** Gemini 2.5 Pro.
*   **Method:** Feed the whole document at once. This allows the AI to see definitions in Section 1 while analyzing Section 10.

### 2. Strict Schema Enforcement
*   Use Gemini's `responseSchema` (JSON mode) to force the output to match our `AnalysisResult` interface exactly.
*   Eliminates `JSON.parse` errors and "markdown block" stripping hacks.

### 3. "Gotcha" Hunter & Quote Verification
*   **Explicit Instructions:** Prompt the AI to specifically hunt for "Data Sale", "Arbitration", "Waivers", and "Tracking".
*   **Quote Requirement:** Require the AI to return the *exact quote* for every risk identified.
*   **Post-Process Verification:** (Optional) Verify that the returned quotes actually exist in the original text (fuzzy match).

## Phase 3: Implementation Steps

1.  **Install Dependencies:** `npm install turndown` (for HTML->Markdown).
2.  **Create `app/lib/searcher.ts`:** Implement the search engine scraper.
3.  **Refactor `app/lib/puppeteerCrawler.ts`:** Implement the new browser logic and Markdown conversion.
4.  **Refactor `app/actions.ts`:**
    *   Replace the old `findPolicy` logic with `Searcher` -> `Puppeteer`.
    *   Replace `analyzePolicy` with the new Single-Pass Gemini logic.
5.  **Test:** Run against Ebay, Facebook, and a small local site.

## Specific Fix for Ebay
The Ebay failure was caused by:
1.  **Bad URL:** `.../help/policies/...` (A help article about the policy, not the policy itself).
2.  **Garbage Content:** The crawler likely extracted the "Help Center" navigation instead of the article text.

**Fix:**
*   **Search:** `site:ebay.com "privacy policy"` returns `https://www.ebay.com/help/policies/member-behaviour-policies/user-privacy-notice?id=4260` (Wait, this *is* the URL PAWD found, but maybe the parameters messed it up or it was a different ID).
*   *Correction:* The main Ebay policy is often at `https://www.ebay.com/privacy`. The searcher should prioritize this "clean" URL over the long `help` one if both appear.
*   **Extraction:** Readability + Markdown will strip the "Help Center" sidebar.
