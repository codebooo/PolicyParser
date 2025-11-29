import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadCloud, BrainCircuit, ShieldCheck, ArrowRight, AlertTriangle, Info, CheckCircle2, Search, Layers, Cpu, Code, Server } from "lucide-react";

export default function HowItWorksPage() {
    return (
        <div className="container mx-auto px-4 py-20 max-w-5xl">
            <div className="text-center space-y-4 mb-16">
                <h1 className="text-4xl md:text-6xl font-bold text-foreground tracking-tight">
                    How <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">PolicyParser</span> Works
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    We use advanced AI to read, understand, and summarize complex legal documents so you don't have to.
                </p>
            </div>

            <div className="grid gap-12 relative">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-accent/50 to-transparent -translate-x-1/2 z-0"></div>

                {/* Step 1 */}
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-16">
                    <div className="w-full md:w-1/2 flex justify-center md:justify-end">
                        <div className="h-20 w-20 bg-primary/20 text-primary rounded-2xl flex items-center justify-center border border-primary/30 shadow-[0_0_30px_rgba(6,182,212,0.3)] backdrop-blur-md">
                            <UploadCloud className="h-10 w-10" />
                        </div>
                    </div>
                    <div className="w-full md:w-1/2 text-center md:text-left">
                        <h2 className="text-2xl font-bold text-foreground mb-2">1. Upload or Search</h2>
                        <p className="text-muted-foreground text-lg">
                            Simply upload a PDF/text file or search for a company's name. We automatically find their latest privacy policy or terms of service.
                        </p>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="relative z-10 flex flex-col md:flex-row-reverse items-center gap-8 md:gap-16">
                    <div className="w-full md:w-1/2 flex justify-center md:justify-start">
                        <div className="h-20 w-20 bg-secondary/20 text-secondary-foreground rounded-2xl flex items-center justify-center border border-secondary/30 shadow-[0_0_30px_rgba(124,58,237,0.3)] backdrop-blur-md">
                            <BrainCircuit className="h-10 w-10" />
                        </div>
                    </div>
                    <div className="w-full md:w-1/2 text-center md:text-right">
                        <h2 className="text-2xl font-bold text-foreground mb-2">2. AI Analysis</h2>
                        <p className="text-muted-foreground text-lg">
                            Our Gemini-powered AI scans the entire document in seconds, identifying risks, data collection practices, and "gotchas" hidden in the fine print.
                        </p>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-16">
                    <div className="w-full md:w-1/2 flex justify-center md:justify-end">
                        <div className="h-20 w-20 bg-accent/20 text-accent rounded-2xl flex items-center justify-center border border-accent/30 shadow-[0_0_30px_rgba(34,211,238,0.3)] backdrop-blur-md">
                            <ShieldCheck className="h-10 w-10" />
                        </div>
                    </div>
                    <div className="w-full md:w-1/2 text-center md:text-left">
                        <h2 className="text-2xl font-bold text-foreground mb-2">3. Get Results</h2>
                        <p className="text-muted-foreground text-lg">
                            Receive a simple Privacy Score, a plain-English summary, and a detailed breakdown of threats and warnings.
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-20 mb-20">
                <h2 className="text-3xl font-bold text-center text-foreground mb-10">Understanding the Findings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border bg-red-950/40 border-red-900 text-red-200 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-1" />
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider block mb-1 text-red-500">Threat</span>
                            <p className="text-sm">Critical privacy violations, data sales, or severe security risks.</p>
                        </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-orange-900/20 border-orange-800 text-orange-300 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0 mt-1" />
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider block mb-1 text-orange-400">Warning</span>
                            <p className="text-sm">Major concerns like broad data sharing or indefinite retention.</p>
                        </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-yellow-900/20 border-yellow-800 text-yellow-300 flex items-start gap-3">
                        <Info className="h-5 w-5 text-yellow-400 shrink-0 mt-1" />
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider block mb-1 text-yellow-400">Caution</span>
                            <p className="text-sm">Minor issues or vague wording that requires attention.</p>
                        </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-blue-900/20 border-blue-800 text-blue-300 flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0 mt-1" />
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider block mb-1 text-blue-400">Brilliant</span>
                            <p className="text-sm">Exceptional user protection that goes above and beyond.</p>
                        </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-green-900/20 border-green-800 text-green-300 flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-1" />
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider block mb-1 text-green-400">Good</span>
                            <p className="text-sm">Positive features like clear opt-outs or data deletion rights.</p>
                        </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-background/40 border-white/10 text-muted-foreground flex items-start gap-3">
                        <Info className="h-5 w-5 text-slate-400 shrink-0 mt-1" />
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider block mb-1 text-slate-500">Normal</span>
                            <p className="text-sm">Standard industry practices that are neither good nor bad.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-20 text-center">
                <Link href="/analyze">
                    <Button size="lg" className="text-lg px-10 h-16 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.7)] transition-all hover:scale-105 group">
                        Try it yourself <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </Link>
            </div>
            <div className="mt-32 border-t border-white/10 pt-20">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold text-foreground mb-4">Technical Deep Dive</h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                        A look under the hood of our privacy analysis engine.
                    </p>
                </div>

                <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                    
                    {/* Step 1 */}
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-background shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <Search className="w-5 h-5 text-primary" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-foreground">1. Intelligent Discovery (PAWD)</h3>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">Node.js + Puppeteer</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Instead of guessing URLs, we use a custom search agent. It queries DuckDuckGo for the company's latest policy, parses the SERP, and identifies the most relevant "Privacy Policy" or "Terms" link using heuristic scoring.
                            </p>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-background shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <Layers className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-foreground">2. Extraction & Normalization</h3>
                                <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-1 rounded">Turndown + Readability</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                We launch a headless Chromium instance to render the page. It handles lazy-loading content by auto-scrolling. The HTML is then passed through Mozilla's Readability to strip clutter (ads, navs) and converted into clean Markdown for optimal AI token usage.
                            </p>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-background shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <Cpu className="w-5 h-5 text-violet-400" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-foreground">3. Single-Pass Analysis (ANAL)</h3>
                                <span className="text-xs font-mono text-violet-400 bg-violet-400/10 px-2 py-1 rounded">Gemini 2.5 Pro</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Leveraging the 2M token context window of Gemini 2.5 Pro, we ingest the entire document in a single pass. This avoids the "context loss" of chunk-based methods, allowing the AI to cross-reference definitions in the intro with clauses in the appendix.
                            </p>
                        </div>
                    </div>

                    {/* Step 4 */}
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-background shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <Code className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-foreground">4. Structured Output Enforcement</h3>
                                <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">JSON Schema</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                We don't just ask for a summary. We enforce a strict JSON schema that mandates specific fields: `privacyScore`, `risks` (with severity levels), and `bulletPoints` (with categories). This ensures the UI always receives predictable, type-safe data.
                            </p>
                        </div>
                    </div>

                    {/* Step 5 */}
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-background shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <Server className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-foreground">5. Resilience & Fallback</h3>
                                <span className="text-xs font-mono text-orange-400 bg-orange-400/10 px-2 py-1 rounded">Grok 4.1 API</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                If the primary model fails or hallucinates, the system automatically fails over to Grok 4.1 via OpenRouter. This redundancy ensures high availability and accuracy even during API outages.
                            </p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
