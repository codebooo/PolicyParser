# CRITICAL_RISK_ANALYSIS - Resolution Plan

**Created:** December 11, 2024  
**Status:** 🟡 In Progress  
**Reference:** [CRITICAL_RISK_ANALYSIS.md](./CRITICAL_RISK_ANALYSIS.md)

---

## Resolution Tracking

### 🔴 Priority 1: Immediate Legal Risk Reduction

| # | Issue | Fix | Status | File(s) |
|---|-------|-----|--------|---------|
| 1.1 | AI positioned as "Legal Expert" | Reframe to "Educational Summarizer" | ✅ DONE | `app/lib/analyzer/prompt.ts` |
| 1.2 | Risk categories sound like legal advice | Rename THREAT→"Concerning", WARNING→"Notable", etc. | ✅ DONE | `app/lib/analyzer/prompt.ts`, `app/lib/types/analysis.ts`, `app/analyze/page.tsx` |
| 1.3 | "Privacy Score" implies legal compliance | Renamed categories, kept scoring (can remove later) | ⏸️ PARTIAL | `app/lib/analyzer/scorer.ts` |
| 1.4 | Privacy policy claims "no data storage" | Rewrite to disclose Supabase storage | ✅ DONE | `app/privacy/page.tsx` |
| 1.5 | Privacy policy auto-dates | Hardcode actual last-updated date | ✅ DONE | `app/privacy/page.tsx` |
| 1.6 | No prominent disclaimer on results | Add disclaimer component to all results | ✅ DONE | `app/analyze/page.tsx`, `components/EducationalDisclaimer.tsx` |

---

### 🟠 Priority 2: Scraping Risk Mitigation

| # | Issue | Fix | Status | File(s) |
|---|-------|-----|--------|---------|
| 2.1 | Googlebot impersonation (CFAA risk) | Remove GOOGLEBOT_UA constant | ✅ DONE | `app/lib/extractor/fetcher.ts` |
| 2.2 | BOT_REQUIRED_DOMAINS bypass | Remove or replace with honest fallback | ✅ DONE | `app/lib/extractor/fetcher.ts` |
| 2.3 | No robots.txt compliance | Add robots.txt parser before scraping | ⬜ TODO | `app/lib/extractor/fetcher.ts` |
| 2.4 | Aggressive UA rotation | Keep only 2-3 legitimate browser UAs | ✅ DONE | `app/lib/extractor/fetcher.ts` |

---

### 🟡 Priority 3: Trust & Transparency

| # | Issue | Fix | Status | File(s) |
|---|-------|-----|--------|---------|
| 3.1 | No AI confidence indicators | Add confidence level to analysis output | ⬜ TODO | `app/lib/types/analysis.ts` |
| 3.2 | No source attribution | Always show link to original policy | ⬜ TODO | `app/analyze/page.tsx` |
| 3.3 | Terms of Service too weak | Strengthen limitations, add arbitration | ⬜ TODO | `app/terms/page.tsx` |
| 3.4 | Third-party data sharing undisclosed | List Google Gemini, Supabase explicitly | ⬜ TODO | `app/privacy/page.tsx` |

---

### ⚖️ Requires Legal Counsel

| # | Issue | Action Needed | Status |
|---|-------|---------------|--------|
| L1 | UPL risk assessment | Get legal opinion for target jurisdictions | ⬜ PENDING |
| L2 | Terms of Service review | Lawyer review of liability limits | ⬜ PENDING |
| L3 | GDPR compliance | Determine if DPA needed with vendors | ⬜ PENDING |
| L4 | Copyright fair use opinion | Legal assessment of AI analysis workflow | ⬜ PENDING |

---

## Implementation Order

```
Week 1: Legal Risk Reduction (Priority 1)
├── [ ] 1.1 - Reframe AI prompt (30 min)
├── [ ] 1.2 - Rename risk categories (1 hour)
├── [ ] 1.4 - Fix privacy policy content (2 hours)
├── [ ] 1.5 - Fix privacy policy date (5 min)
└── [ ] 1.6 - Add disclaimers (2 hours)

Week 2: Scraping Safety (Priority 2)
├── [ ] 2.1 - Remove Googlebot UA (30 min)
├── [ ] 2.2 - Remove BOT_REQUIRED_DOMAINS (30 min)
└── [ ] 2.4 - Clean up UA list (30 min)

Week 3: Transparency (Priority 3)
├── [ ] 3.1 - Add confidence indicators (4 hours)
├── [ ] 3.2 - Add source links (1 hour)
└── [ ] 3.4 - Update third-party disclosures (1 hour)

Ongoing: Legal Counsel
├── [ ] L1 - Schedule UPL consultation
├── [ ] L2 - ToS legal review
├── [ ] L3 - GDPR assessment
└── [ ] L4 - Copyright opinion
```

---

## Code Changes Summary

### `app/lib/analyzer/prompt.ts`
```diff
- You are a Senior Data Privacy Auditor and Legal Expert
+ You are an educational privacy policy summarizer

- ### THREAT (Privacy Score: -20 points each)
+ ### CONCERNING LANGUAGE (Readability Impact: High)

- ### WARNING (Privacy Score: -10 points each)  
+ ### NOTABLE POINTS (Readability Impact: Medium)
```

### `app/privacy/page.tsx`
```diff
- <p>Last Updated: {new Date().toLocaleDateString()}</p>
+ <p>Last Updated: December 11, 2024</p>

- <p className="font-bold">We do not collect, store, or share your personal data.</p>
+ <p className="font-bold">What we collect and how we handle your data:</p>
+ <ul>
+   <li>Account users: Analysis history stored in Supabase</li>
+   <li>Anonymous: Document content processed in memory only</li>
+   <li>Third parties: Text sent to Google Gemini for AI analysis</li>
+ </ul>
```

### `app/lib/extractor/fetcher.ts`
```diff
- const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
+ // REMOVED: Googlebot impersonation poses CFAA risk

- const BOT_REQUIRED_DOMAINS = ['facebook.com', 'instagram.com', ...];
+ const BOT_REQUIRED_DOMAINS = []; // Disabled - respect site access controls
```

---

## Sign-off Checklist

Before launch, confirm:

- [ ] All Priority 1 items completed
- [ ] All Priority 2 items completed  
- [ ] Legal counsel consulted on L1-L4
- [ ] Privacy policy reviewed by lawyer
- [ ] Terms of Service reviewed by lawyer
- [ ] Test run with no Googlebot impersonation
- [ ] Disclaimers visible on all result pages

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ TODO | Not started |
| 🔄 IN PROGRESS | Currently working |
| ✅ DONE | Completed |
| ⏸️ BLOCKED | Waiting on external |
| ❌ WONTFIX | Decided not to fix |
