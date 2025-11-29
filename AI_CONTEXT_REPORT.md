# PolicyParser Project Context & Architecture Report

## 1. Project Overview
**Name:** PolicyParser
**Purpose:** A web application that analyzes complex legal documents (Privacy Policies, Terms of Service) using AI to provide clear, actionable summaries, risk assessments, and privacy scores.
**Core Functionality:**
- **Input:** Users can upload files (PDF/TXT) or search for a company's policy URL.
- **Processing:** Scrapes policy text from URLs (using Cheerio) or reads uploaded files.
- **Analysis:** Uses Google Gemini 2.5 Pro to analyze the text against a privacy rubric.
- **Output:** Displays an Executive Summary, Privacy Score (0-100), Risk Breakdown (High/Medium/Low), Key Findings (Bullet points), and a navigable Full Text view.

## 2. Technology Stack
- **Framework:** Next.js 16.0.3 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 (using `@theme` inline configuration) + `tailwindcss-animate`
- **Runtime:** Node.js
- **AI Provider:** Google Generative AI SDK (`@google/generative-ai`) - Model: `gemini-2.5-pro`
- **Scraping:** `cheerio` (Server-side HTML parsing)
- **Icons:** `lucide-react`
- **Utilities:** `clsx`, `tailwind-merge`

## 3. Project Structure
The project follows the standard Next.js App Router structure.

```
policy-parser-web/
├── app/
│   ├── actions.ts          # SERVER ACTIONS: Core backend logic (Scraping, AI Analysis, Logging)
│   ├── globals.css         # Global styles, Tailwind v4 config, Custom Animations
│   ├── layout.tsx          # Root layout, Fonts (Geist), Global Providers
│   ├── page.tsx            # Landing Page
│   └── analyze/
│       └── page.tsx        # MAIN APP LOGIC: Client-side UI for analysis, state management
├── components/
│   ├── Background.tsx      # Dynamic background component with 3 switchable variants
│   ├── Navbar.tsx          # Navigation component
│   ├── Footer.tsx          # Footer component
│   └── ui/                 # Reusable UI components (Button, etc.)
├── debug/                  # Generated at runtime: Stores JSON logs of scraping/analysis
├── public/                 # Static assets
└── package.json            # Dependencies and scripts
```

## 4. Key Components & Logic

### Backend Logic (`app/actions.ts`)
- **`findAndFetchPolicy(query: string)`**:
  - Attempts to guess policy URLs if a company name is provided (e.g., `domain.com/privacy`, `domain.com/legal/privacy-policy`).
  - Uses `fetch` with a real User-Agent to bypass basic bot protection.
  - Uses `cheerio` to parse HTML, remove clutter (scripts, navs), and extract main text.
  - **Debug Logging:** Writes search queries and fetch results to `debug/log_*.json` if `DEBUG_MODE` is true.
- **`analyzePolicy(text: string)`**:
  - Sends the cleaned text to Google Gemini.
  - Enforces a strict JSON schema for the response (see Data Structures below).

### Frontend Logic (`app/analyze/page.tsx`)
- **State Management:** Handles steps (`input` -> `searching` -> `processing` -> `results`).
- **Process Visualization:** Displays a "Perplexity-style" step-by-step log during the search phase.
- **View Modes:**
  - **Overview:** Combined view of Summary, Privacy Score, Key Findings, and Risks.
  - **Full Text:** Split view with a sticky Table of Contents and the full policy text.
- **Key Findings Sorting:** Automatically sorts bullet points by severity: `Threat` -> `Warning` -> `Caution` -> `Normal` -> `Good` -> `Brilliant`.

### Visual Design (`components/Background.tsx`)
- Currently implements a **Background Switcher** (temporary feature) allowing the user to toggle between 3 styles:
  1. **Grainy Mesh (SVG Noise):** High-frequency SVG noise overlay on top of moving gradient blobs.
  2. **Retro Static (CSS Pattern):** Pure CSS moire pattern with moving spotlights (TV static effect).
  3. **Distorted Flux (SVG Filter):** Full-screen SVG displacement map creating a liquid/warped effect.

## 5. Data Structures

### Analysis Result Interface
The frontend expects the AI to return data matching this structure:

```typescript
interface AnalysisResult {
  summary: string;
  privacyScore: number; // 0-100
  risks: {
    level: "high" | "medium" | "low";
    title: string;
    description: string;
  }[];
  details: {
    title: string;
    content: string;
  }[];
  bulletPoints: {
    category: "Threat" | "Warning" | "Caution" | "Normal" | "Good" | "Brilliant";
    text: string;
  }[];
  fullTextSections: {
    id: string;
    title: string;
    content: string; // The exact original text
    summary?: string; // AI generated summary of the section
  }[];
}
```

## 6. Configuration Details
- **Tailwind v4:** Configuration is handled in `app/globals.css` using the `@theme` directive. Custom animations (`blob`) are defined here.
- **Environment Variables:** Requires `GEMINI_API_KEY` in `.env.local`.

## 7. Current Development State
- **Debug Mode:** Enabled in `app/actions.ts`. Creates a `debug/` folder in the root.
- **Scraping:** Heuristic-based. Tries multiple URL patterns. Handles 403/401 errors gracefully by trying next candidates.
- **UI Polish:** "The Ready" aesthetic (Deep Purple/Black, high contrast, noise textures).

## 8. Instructions for AI Agents
When generating code or instructions for this project:
1. **Respect the Server/Client Boundary:** Keep heavy logic and API calls in `actions.ts`. Keep UI state in `page.tsx`.
2. **Maintain the JSON Schema:** Any changes to the AI prompt in `actions.ts` must be reflected in the `AnalysisResult` interface in `page.tsx`.
3. **Use Tailwind v4 Syntax:** Do not look for `tailwind.config.js`. Check `app/globals.css`.
4. **Preserve Debugging:** Do not remove the `logDebug` calls in `actions.ts` unless explicitly asked.
5. **Handle Errors Gracefully:** The scraping logic is fragile; always ensure fallback mechanisms or clear error messages are preserved.
