"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp, Search, Globe, Link as LinkIcon, Lock, ShieldAlert, Eye, EyeOff, Zap, FileStack, ChevronRight, X, ScrollText, Shield, AlertOctagon, AlertCircle, CircleAlert, CircleCheck, Sparkles, Star, Users, Bell } from "lucide-react"
import { clsx } from "clsx"
import { analyzeDomain, discoverAllPolicies, analyzeSpecificPolicy, analyzeText } from "../actions"
import { readStreamableValue } from "@ai-sdk/rsc"
import { checkProStatus } from "../checkProStatus"
import { trackPolicy, untrackPolicy, getTrackedPolicies } from "../trackingActions"
import { submitCommunityScore, getCommunityScore, getUserVote } from "../communityActions"

type AnalysisStep = "input" | "searching" | "processing" | "results"
type InputMethod = "file" | "url" | "paste"
type AnalysisMode = "single" | "comprehensive"
type FindingCategory = "THREAT" | "WARNING" | "CAUTION" | "NORMAL" | "GOOD" | "BRILLIANT"

interface LabeledFinding {
  category: FindingCategory;
  text: string;
}

interface SecureUsageRecommendation {
  priority: "high" | "medium" | "low";
  recommendation: string;
}

interface DiscoveredPolicy {
  type: string;
  name: string;
  url: string;
}

interface PolicyAnalysisResult {
  type: string;
  name: string;
  url: string;
  analysis: any | null;
  status: 'pending' | 'analyzing' | 'complete' | 'error';
  error?: string;
}

// Category styling configuration
const FINDING_CATEGORY_CONFIG: Record<FindingCategory, { 
  label: string; 
  bgColor: string; 
  textColor: string; 
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  THREAT: { 
    label: "THREAT", 
    bgColor: "bg-red-500/10", 
    textColor: "text-red-500", 
    borderColor: "border-red-500/30",
    icon: AlertOctagon
  },
  WARNING: { 
    label: "WARNING", 
    bgColor: "bg-orange-500/10", 
    textColor: "text-orange-400", 
    borderColor: "border-orange-500/30",
    icon: AlertTriangle
  },
  CAUTION: { 
    label: "CAUTION", 
    bgColor: "bg-yellow-500/10", 
    textColor: "text-yellow-400", 
    borderColor: "border-yellow-500/30",
    icon: CircleAlert
  },
  NORMAL: { 
    label: "NORMAL", 
    bgColor: "bg-slate-500/10", 
    textColor: "text-slate-400", 
    borderColor: "border-slate-500/30",
    icon: Info
  },
  GOOD: { 
    label: "GOOD", 
    bgColor: "bg-green-500/10", 
    textColor: "text-green-400", 
    borderColor: "border-green-500/30",
    icon: CircleCheck
  },
  BRILLIANT: { 
    label: "BRILLIANT", 
    bgColor: "bg-cyan-500/10", 
    textColor: "text-cyan-400", 
    borderColor: "border-cyan-500/30",
    icon: Sparkles
  },
};

// Sort order for findings (most severe first)
const CATEGORY_SORT_ORDER: FindingCategory[] = ["THREAT", "WARNING", "CAUTION", "NORMAL", "GOOD", "BRILLIANT"];

export default function AnalyzePage() {
  const [step, setStep] = useState<AnalysisStep>("input")
  const [inputMethod, setInputMethod] = useState<InputMethod>("url")
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("single")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [analysisResults, setAnalysisResults] = useState<any | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)

  // Pro & Multi-policy State
  const [isPro, setIsPro] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [discoveredPolicies, setDiscoveredPolicies] = useState<DiscoveredPolicy[]>([])
  const [policyResults, setPolicyResults] = useState<PolicyAnalysisResult[]>([])
  const [selectedPolicyIndex, setSelectedPolicyIndex] = useState(0)
  const [analyzedDomain, setAnalyzedDomain] = useState<string | null>(null)

  // Community State
  const [communityScore, setCommunityScore] = useState<number | null>(null)
  const [voteCount, setVoteCount] = useState(0)
  const [userVote, setUserVote] = useState<number | null>(null)
  const [isTracked, setIsTracked] = useState(false)

  // Original Text Modal State
  const [showOriginalText, setShowOriginalText] = useState(false)
  
  // Dropdown States
  const [dataCollectedOpen, setDataCollectedOpen] = useState(true)
  const [thirdPartyOpen, setThirdPartyOpen] = useState(true)
  
  // Community Score Voting UI
  const [showVoteSlider, setShowVoteSlider] = useState(false)
  const [voteValue, setVoteValue] = useState(50)

  // File Upload & Paste Text State
  const [pastedText, setPastedText] = useState("")
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  useEffect(() => {
    checkProStatus().then(status => {
      setIsPro(status.isPro)
      setUserId(status.userId)
    })
  }, [])

  const startAnalysis = async () => {
    // Handle file/paste text analysis
    if (inputMethod === "file" || inputMethod === "paste") {
      await startTextAnalysis();
      return;
    }

    if (!searchQuery) return;

    // If Pro and comprehensive mode, do multi-policy analysis
    if (isPro && analysisMode === "comprehensive") {
      await startComprehensiveAnalysis();
      return;
    }

    // Standard single policy analysis
    setStep("searching")
    setProgressSteps([])
    setStatusMessage("Initializing...")
    setAnalysisResults(null)

    try {
      const { output } = await analyzeDomain(searchQuery);

      for await (const update of readStreamableValue(output)) {
        if (!update) continue;
        
        if (update.status === 'complete') {
          setAnalysisResults(update.data)
          setSourceUrl(update.data?.url || null)
          setAnalyzedDomain(update.data?.domain || null)
          setStep("results")

          if (update.data?.url) {
            fetchExtraData(update.data.url)
          }
        } else if (update.status === 'error') {
          setStep("input")
          alert("Analysis failed: " + update.message)
          break;
        } else {
          setStatusMessage(update.message)
          setProgressSteps(prev => {
            if (prev[prev.length - 1] !== update.message) {
              return [...prev, update.message]
            }
            return prev
          })
        }
      }
    } catch (error: any) {
      console.error("Analysis failed", error)
      setStep("input")
      alert("Analysis failed: " + (error?.message || "Unknown error"))
    }
  }

  const startTextAnalysis = async () => {
    if (!pastedText || pastedText.trim().length < 100) {
      alert("Please paste at least 100 characters of policy text.");
      return;
    }

    setStep("searching")
    setProgressSteps([])
    setStatusMessage("Analyzing your text...")
    setAnalysisResults(null)

    try {
      const sourceName = uploadedFileName || "Pasted Text";
      const { output } = await analyzeText(pastedText, sourceName);

      for await (const update of readStreamableValue(output)) {
        if (!update) continue;
        
        if (update.status === 'complete') {
          setAnalysisResults(update.data)
          setSourceUrl(null) // No URL for text analysis
          setAnalyzedDomain(update.data?.domain || sourceName)
          setStep("results")
        } else if (update.status === 'error') {
          setStep("input")
          alert("Analysis failed: " + update.message)
          break;
        } else {
          setStatusMessage(update.message)
          setProgressSteps(prev => {
            if (prev[prev.length - 1] !== update.message) {
              return [...prev, update.message]
            }
            return prev
          })
        }
      }
    } catch (error: any) {
      console.error("Text analysis failed", error)
      setStep("input")
      alert("Analysis failed: " + (error?.message || "Unknown error"))
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = ['text/plain', 'text/html', 'application/pdf'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.html') && !file.name.endsWith('.pdf')) {
      alert("Please upload a .txt, .html, or .pdf file");
      return;
    }

    // For PDF files, we'd need a PDF parser - for now just support text files
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      alert("PDF support coming soon. Please copy the text and use 'Paste Text' instead.");
      return;
    }

    try {
      const text = await file.text();
      setPastedText(text);
      setUploadedFileName(file.name);
      setInputMethod("paste"); // Switch to paste view to show the text
    } catch (error) {
      alert("Failed to read file. Please try pasting the text instead.");
    }
  }

  const startComprehensiveAnalysis = async () => {
    setStep("searching")
    setProgressSteps([])
    setStatusMessage("Discovering all policies...")
    setDiscoveredPolicies([])
    setPolicyResults([])

    try {
      // Step 1: Discover all policies
      setProgressSteps(prev => [...prev, "Discovering available policies..."])
      const discovery = await discoverAllPolicies(searchQuery);

      if (!discovery.success || !discovery.policies || discovery.policies.length === 0) {
        throw new Error(discovery.error || "No policies found for this company");
      }

      setAnalyzedDomain(discovery.domain || null)
      setDiscoveredPolicies(discovery.policies)
      setProgressSteps(prev => [...prev, `Found ${discovery.policies!.length} policies: ${discovery.policies!.map(p => p.name).join(', ')}`])

      // Initialize results array
      const initialResults: PolicyAnalysisResult[] = discovery.policies.map(p => ({
        type: p.type,
        name: p.name,
        url: p.url,
        analysis: null,
        status: 'pending'
      }));
      setPolicyResults(initialResults);

      // Step 2: Analyze each policy
      setStatusMessage("Analyzing policies...")
      
      for (let i = 0; i < discovery.policies.length; i++) {
        const policy = discovery.policies[i];
        
        setPolicyResults(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'analyzing' } : p
        ));
        
        setProgressSteps(prev => [...prev, `Analyzing ${policy.name}...`])
        
        try {
          const { output } = await analyzeSpecificPolicy(policy.url, policy.name);
          
          for await (const update of readStreamableValue(output)) {
            if (!update) continue;
            
            if (update.status === 'complete') {
              setPolicyResults(prev => prev.map((p, idx) => 
                idx === i ? { ...p, status: 'complete', analysis: update.data } : p
              ));
              setProgressSteps(prev => [...prev, `✓ ${policy.name} analyzed (Score: ${update.data?.score || 'N/A'})`])
            } else if (update.status === 'error') {
              setPolicyResults(prev => prev.map((p, idx) => 
                idx === i ? { ...p, status: 'error', error: update.message } : p
              ));
              setProgressSteps(prev => [...prev, `✗ ${policy.name} failed: ${update.message}`])
            }
          }
        } catch (e: any) {
          setPolicyResults(prev => prev.map((p, idx) => 
            idx === i ? { ...p, status: 'error', error: e?.message || 'Unknown error' } : p
          ));
        }
      }

      // Use first successful analysis as main result
      const firstSuccess = initialResults.find(r => r.status === 'complete');
      if (firstSuccess?.analysis) {
        setAnalysisResults(firstSuccess.analysis);
        setSourceUrl(firstSuccess.url);
      }

      setStep("results")
      setStatusMessage("Analysis complete!")

    } catch (error: any) {
      console.error("Comprehensive analysis failed", error)
      setStep("input")
      alert("Analysis failed: " + (error?.message || "Unknown error"))
    }
  }

  const fetchExtraData = async (url: string) => {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');

      const scoreData = await getCommunityScore(domain);
      setCommunityScore(scoreData.averageScore);
      setVoteCount(scoreData.voteCount);

      const voteData = await getUserVote(domain);
      setUserVote(voteData.userScore);

      const trackedPolicies = await getTrackedPolicies();
      const isTracking = trackedPolicies.some((p: any) => p.domain === domain);
      setIsTracked(isTracking);
    } catch (e) {
      console.error("Failed to fetch extra data", e);
    }
  }

  const handleTrackToggle = async () => {
    if (!sourceUrl) return;
    const domain = new URL(sourceUrl).hostname.replace(/^www\./, '');
    if (isTracked) {
      await untrackPolicy(domain);
      setIsTracked(false);
    } else {
      // Pass the policy URL and current analysis for change detection
      await trackPolicy(domain, sourceUrl, displayedAnalysis);
      setIsTracked(true);
    }
  }

  const handleVote = async (score: number) => {
    if (!sourceUrl) return;
    const domain = new URL(sourceUrl).hostname.replace(/^www\./, '');
    const result = await submitCommunityScore(domain, score);
    if (result.success && 'averageScore' in result) {
      setCommunityScore(result.averageScore);
      setVoteCount(result.voteCount!);
      setUserVote(score);
    }
  }

  const currentPolicyResult = policyResults[selectedPolicyIndex];
  const displayedAnalysis = analysisMode === "comprehensive" && currentPolicyResult?.analysis 
    ? currentPolicyResult.analysis 
    : analysisResults;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {step === "input" && (
        <div className="flex flex-col items-center text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Analyze a Policy</h1>
            <p className="text-muted-foreground">Upload a document or search for a company's policy.</p>
          </div>

          {/* Mode Toggle for Pro Users */}
          {isPro && (
            <div className="flex items-center gap-2 p-1 bg-background/40 backdrop-blur-sm border border-white/10 rounded-lg">
              <Button
                variant={analysisMode === "single" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAnalysisMode("single")}
                className={clsx(
                  "transition-all",
                  analysisMode === "single" && "shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                )}
              >
                <FileText className="h-4 w-4 mr-2" />
                Single Policy
              </Button>
              <Button
                variant={analysisMode === "comprehensive" ? "default" : "ghost"}
                size="sm"
                onClick={() => setAnalysisMode("comprehensive")}
                className={clsx(
                  "transition-all",
                  analysisMode === "comprehensive" && "shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                )}
              >
                <FileStack className="h-4 w-4 mr-2" />
                All Policies
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-black rounded">PRO</span>
              </Button>
            </div>
          )}

          {/* Input Method Toggle */}
          <div className="flex items-center gap-2 p-1 bg-background/40 backdrop-blur-sm border border-white/10 rounded-lg">
            <Button
              variant={inputMethod === "url" ? "default" : "ghost"}
              size="sm"
              onClick={() => setInputMethod("url")}
              className={clsx(
                "transition-all",
                inputMethod === "url" && "shadow-[0_0_10px_rgba(6,182,212,0.3)]"
              )}
            >
              <Search className="h-4 w-4 mr-2" />
              Search Company
            </Button>
            <Button
              variant={inputMethod === "paste" ? "default" : "ghost"}
              size="sm"
              onClick={() => setInputMethod("paste")}
              className={clsx(
                "transition-all",
                inputMethod === "paste" && "shadow-[0_0_10px_rgba(6,182,212,0.3)]"
              )}
            >
              <FileText className="h-4 w-4 mr-2" />
              Paste Text
            </Button>
            <label className="cursor-pointer">
              <input
                id="file-upload"
                type="file"
                accept=".txt,.html,.htm"
                onChange={handleFileUpload}
                className="hidden"
              />
              <span className={clsx(
                "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 rounded-md px-3 py-1",
                inputMethod === "file" 
                  ? "bg-primary text-primary-foreground shadow hover:bg-primary/90 shadow-[0_0_10px_rgba(6,182,212,0.3)]" 
                  : "hover:bg-accent hover:text-accent-foreground"
              )}>
                <UploadCloud className="h-4 w-4" />
                Upload File
              </span>
            </label>
          </div>

          {/* Pro Mode Info */}
          {isPro && analysisMode === "comprehensive" && (
            <div className="w-full max-w-xl p-4 rounded-lg bg-gradient-to-r from-amber-400/10 to-orange-500/10 border border-amber-400/20">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-medium text-amber-400">Comprehensive Company Analysis</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We'll scan the entire company and analyze all available policies: Privacy Policy, Terms of Service, Cookie Policy, Security Policy, GDPR/CCPA notices, AI Terms, Data Processing Agreements, and more.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Non-Pro Upgrade Prompt for Comprehensive */}
          {!isPro && (
            <div className="w-full max-w-xl p-4 rounded-lg bg-gradient-to-r from-primary/5 to-cyan-500/5 border border-primary/20">
              <div className="flex items-start gap-3">
                <FileStack className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Want to analyze all company policies?</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upgrade to Pro to analyze Privacy Policy, Terms of Service, Cookie Policy, and all other legal documents in one click.
                  </p>
                  <a href="/plans" className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline">
                    <Zap className="h-3 w-3" />
                    Upgrade to Pro
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="w-full max-w-xl space-y-6">
            {/* URL Search Input */}
            {inputMethod === "url" && (
              <>
                <div className="relative">
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 bg-background/40 border-white/10 backdrop-blur-sm transition-all"
                    placeholder="e.g. 'Google', 'Spotify', or 'https://example.com/privacy'"
                    onKeyDown={(e) => e.key === "Enter" && startAnalysis()}
                  />
                  <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground pointer-events-none" />
                </div>

                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground text-left">
                      Enter a company name and our AI will automatically find and analyze their latest {analysisMode === "comprehensive" ? "Privacy Policy, Terms of Service, and all other legal documents" : "Privacy Policy"}.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Paste Text Input */}
            {inputMethod === "paste" && (
              <>
                <div className="space-y-2">
                  {uploadedFileName && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground p-2 bg-primary/5 rounded-lg">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {uploadedFileName}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setUploadedFileName(null);
                          setPastedText("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <Textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    className="w-full min-h-[200px] bg-background/40 border-white/10 backdrop-blur-sm transition-all resize-y"
                    placeholder="Paste the privacy policy or terms of service text here..."
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {pastedText.length.toLocaleString()} characters
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground text-left">
                      Paste any policy document text and our AI will analyze it. Minimum 100 characters required.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Main Action Button */}
            <Button
              size="lg"
              className={clsx(
                "w-full max-w-xl text-lg h-14 rounded-lg transition-all",
                analysisMode === "comprehensive" 
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-bold shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.7)]"
                  : "shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.7)]"
              )}
              onClick={startAnalysis}
              disabled={inputMethod === "url" ? !searchQuery : pastedText.length < 100}
            >
              {analysisMode === "comprehensive" ? (
                <>
                  <FileStack className="h-5 w-5 mr-2" />
                  Search Whole Company
                </>
              ) : (
                "Find & Analyze"
              )}
            </Button>
          </div>
        </div>
      )}

      {(step === "searching" || step === "processing") && (
        <div className="flex flex-col items-center justify-center py-20 space-y-8 animate-in fade-in duration-500">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
            <Globe className="absolute inset-0 m-auto h-8 w-8 text-primary animate-pulse" />
          </div>
          <div className="text-center space-y-4 max-w-md">
            <h2 className="text-2xl font-bold text-foreground">{statusMessage}</h2>
            <div className="space-y-2 text-left bg-background/60 p-4 rounded-lg border border-white/10 backdrop-blur-md h-64 overflow-y-auto">
              {progressSteps.map((msg, i) => (
                <div key={i} className="flex items-center gap-2 text-muted-foreground animate-in fade-in slide-in-from-left-2">
                  <CheckCircle2 className={clsx(
                    "h-4 w-4 shrink-0",
                    msg.startsWith("✓") ? "text-green-500" : msg.startsWith("✗") ? "text-red-500" : "text-green-500"
                  )} />
                  <span className="text-sm">{msg.replace(/^[✓✗]\s*/, '')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === "results" && displayedAnalysis && (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-8">
          {/* Original Text Modal */}
          {showOriginalText && displayedAnalysis.rawPolicyText && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-background border border-white/10 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <ScrollText className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Original Policy Text</h3>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowOriginalText(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans leading-relaxed">
                      {displayedAnalysis.rawPolicyText}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Policy Tabs for Comprehensive Mode */}
          {analysisMode === "comprehensive" && policyResults.length > 1 && (
            <div className="flex flex-wrap gap-2 p-2 bg-background/40 backdrop-blur-sm border border-white/10 rounded-lg">
              {policyResults.map((policy, index) => (
                <Button
                  key={policy.type}
                  variant={selectedPolicyIndex === index ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedPolicyIndex(index)}
                  className={clsx(
                    "transition-all",
                    selectedPolicyIndex === index && "shadow-[0_0_10px_rgba(6,182,212,0.3)]",
                    policy.status === 'error' && "text-red-400"
                  )}
                >
                  {policy.name}
                  {policy.status === 'complete' && policy.analysis?.score && (
                    <span className={clsx(
                      "ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded",
                      policy.analysis.score >= 80 ? "bg-green-500/20 text-green-400" :
                        policy.analysis.score >= 60 ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-red-500/20 text-red-400"
                    )}>
                      {policy.analysis.score}
                    </span>
                  )}
                  {policy.status === 'error' && (
                    <AlertTriangle className="ml-1 h-3 w-3 text-red-400" />
                  )}
                </Button>
              ))}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-4">
                <Button variant="ghost" className="pl-0 hover:bg-transparent hover:text-primary" onClick={() => setStep("input")}>
                  <ChevronDown className="h-4 w-4 rotate-90 mr-2" />
                  Back to Search
                </Button>
                {displayedAnalysis.rawPolicyText && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowOriginalText(true)}
                    className="border-white/10 hover:bg-white/5"
                  >
                    <ScrollText className="h-4 w-4 mr-2" />
                    Original Text
                  </Button>
                )}
              </div>
              <h1 className="text-4xl font-bold text-foreground">
                {analysisMode === "comprehensive" && currentPolicyResult ? currentPolicyResult.name : "Analysis Results"}
              </h1>
              {/* Source URL Link - Always link to original policy, not just domain */}
              {(sourceUrl || (analysisMode === "comprehensive" && currentPolicyResult?.url)) && (
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={analysisMode === "comprehensive" && currentPolicyResult?.url ? currentPolicyResult.url : sourceUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate max-w-md"
                  >
                    {analysisMode === "comprehensive" && currentPolicyResult?.url 
                      ? currentPolicyResult.url 
                      : sourceUrl}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    (Original Source)
                  </span>
                </div>
              )}
              {analyzedDomain && !sourceUrl && !currentPolicyResult?.url && (
                <p className="text-sm text-muted-foreground">
                  {analyzedDomain}
                </p>
              )}
              <p className="text-muted-foreground text-lg">
                {displayedAnalysis.summary}
              </p>
            </div>

            <Card className="w-full md:w-auto min-w-[300px] bg-background/60 backdrop-blur-xl border-primary/20 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
              <CardContent className="p-6 flex items-center justify-between gap-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Privacy Score</p>
                  <div className="flex items-baseline gap-1">
                    <span className={clsx(
                      "text-5xl font-black tracking-tighter",
                      displayedAnalysis.score >= 80 ? "text-green-400" :
                        displayedAnalysis.score >= 60 ? "text-yellow-400" :
                          "text-red-500"
                    )}>
                      {displayedAnalysis.score}
                    </span>
                    <span className="text-muted-foreground font-medium">/100</span>
                  </div>
                </div>
                <div className={clsx(
                  "h-20 w-20 rounded-full flex items-center justify-center border-4 shadow-inner",
                  displayedAnalysis.score >= 80 ? "border-green-500/30 bg-green-500/10 text-green-400" :
                    displayedAnalysis.score >= 60 ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" :
                      "border-red-500/30 bg-red-500/10 text-red-500"
                )}>
                  <ShieldAlert className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Track Policy Card - Pro Feature */}
          {userId && (
            <Card className={clsx(
              "border transition-all",
              isTracked 
                ? "bg-primary/10 border-primary/30" 
                : "bg-white/5 border-white/10 hover:border-primary/30"
            )}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    isTracked ? "bg-primary/20 text-primary" : "bg-white/10 text-muted-foreground"
                  )}>
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">
                      {isTracked ? "Tracking this policy" : "Track this policy"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isTracked 
                        ? "You'll be notified when this policy changes" 
                        : "Get notified when this privacy policy is updated"
                      }
                    </p>
                  </div>
                </div>
                <Button
                  variant={isTracked ? "outline" : "default"}
                  size="sm"
                  onClick={handleTrackToggle}
                  className={clsx(
                    isTracked && "border-primary/30 text-primary hover:bg-primary/10"
                  )}
                >
                  {isTracked ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Tracking
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4 mr-2" />
                      Track Policy
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Community Score Section */}
          <Card className="bg-background/40 border-white/10">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
                    <Users className="h-7 w-7 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Community Score</p>
                    <div className="flex items-baseline gap-2">
                      {communityScore !== null ? (
                        <>
                          <span className={clsx(
                            "text-3xl font-bold",
                            communityScore >= 80 ? "text-green-400" :
                              communityScore >= 60 ? "text-yellow-400" :
                                "text-red-500"
                          )}>
                            {communityScore}
                          </span>
                          <span className="text-muted-foreground text-sm">/100</span>
                          <span className="text-xs text-muted-foreground">({voteCount} {voteCount === 1 ? 'vote' : 'votes'})</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-sm">No votes yet</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 w-full md:w-auto">
                  {userVote !== null ? (
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      <span className="text-sm text-muted-foreground">Your rating: <span className="text-foreground font-medium">{userVote}/100</span></span>
                    </div>
                  ) : userId ? (
                    showVoteSlider ? (
                      <div className="flex flex-col gap-3 p-4 rounded-lg bg-white/5 border border-white/10 min-w-[250px]">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Your rating:</span>
                          <span className={clsx(
                            "text-lg font-bold",
                            voteValue >= 80 ? "text-green-400" :
                              voteValue >= 60 ? "text-yellow-400" :
                                "text-red-500"
                          )}>{voteValue}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={voteValue}
                          onChange={(e) => setVoteValue(Number(e.target.value))}
                          className="w-full accent-primary"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowVoteSlider(false)}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              handleVote(voteValue);
                              setShowVoteSlider(false);
                            }}
                            className="flex-1 bg-primary hover:bg-primary/90"
                          >
                            Submit
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowVoteSlider(true)}
                        className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Rate this policy
                      </Button>
                    )
                  ) : (
                    <p className="text-xs text-muted-foreground">Log in to rate this policy</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Secure Usage Recommendations */}
          {displayedAnalysis.secure_usage_recommendations && displayedAnalysis.secure_usage_recommendations.length > 0 && (
            <Card className="bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-400">
                  <Lock className="h-5 w-5" />
                  Secure Usage Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {displayedAnalysis.secure_usage_recommendations.map((rec: SecureUsageRecommendation, index: number) => (
                  <div 
                    key={index} 
                    className={clsx(
                      "flex items-start gap-3 p-3 rounded-lg border",
                      rec.priority === 'high' ? "bg-green-500/10 border-green-500/30" :
                        rec.priority === 'medium' ? "bg-emerald-500/10 border-emerald-500/20" :
                          "bg-teal-500/10 border-teal-500/20"
                    )}
                  >
                    <CircleCheck className={clsx(
                      "h-5 w-5 shrink-0 mt-0.5",
                      rec.priority === 'high' ? "text-green-400" :
                        rec.priority === 'medium' ? "text-emerald-400" :
                          "text-teal-400"
                    )} />
                    <p className="text-sm leading-relaxed">{rec.recommendation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Key Findings - Now with Labels */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Key Findings</h2>
            {displayedAnalysis.key_findings && (
              Array.isArray(displayedAnalysis.key_findings) && displayedAnalysis.key_findings.length > 0 ? (
                // Sort findings by severity
                [...displayedAnalysis.key_findings]
                  .sort((a: LabeledFinding | string, b: LabeledFinding | string) => {
                    // Handle both old string format and new object format
                    const catA = typeof a === 'object' && a.category ? a.category : 'NORMAL';
                    const catB = typeof b === 'object' && b.category ? b.category : 'NORMAL';
                    return CATEGORY_SORT_ORDER.indexOf(catA as FindingCategory) - CATEGORY_SORT_ORDER.indexOf(catB as FindingCategory);
                  })
                  .map((finding: LabeledFinding | string, index: number) => {
                    // Handle both old string format and new object format
                    const isLabeledFinding = typeof finding === 'object' && finding.category;
                    const category: FindingCategory = isLabeledFinding ? (finding as LabeledFinding).category : 'NORMAL';
                    const text = isLabeledFinding ? (finding as LabeledFinding).text : (finding as string);
                    const config = FINDING_CATEGORY_CONFIG[category];
                    const IconComponent = config.icon;
                    
                    return (
                      <div 
                        key={index} 
                        className={clsx(
                          "p-4 rounded-lg border flex items-start gap-3",
                          config.bgColor,
                          config.borderColor
                        )}
                      >
                        <IconComponent className={clsx("h-5 w-5 shrink-0 mt-0.5", config.textColor)} />
                        <div className="flex-1 min-w-0">
                          <span className={clsx(
                            "inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded mb-2",
                            config.textColor,
                            config.bgColor
                          )}>
                            {config.label}
                          </span>
                          <p className="text-sm leading-relaxed">{text}</p>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p className="text-muted-foreground text-sm">No key findings available.</p>
              )
            )}
          </div>

          {/* Data Collected & Third Party Sharing - Dropdowns */}
          <div className="space-y-4">
            {/* Data Collected Dropdown */}
            <div className="border border-white/10 rounded-lg bg-background/40 overflow-hidden">
              <button
                onClick={() => setDataCollectedOpen(!dataCollectedOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Eye className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Data Collected</h3>
                    <p className="text-xs text-muted-foreground">{displayedAnalysis.data_collected?.length || 0} data types identified</p>
                  </div>
                </div>
                {dataCollectedOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {dataCollectedOpen && (
                <div className="px-4 pb-4 border-t border-white/5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-4">
                    {displayedAnalysis.data_collected?.map((item: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"></div>
                        <span className="truncate">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Third Party Sharing Dropdown */}
            <div className="border border-white/10 rounded-lg bg-background/40 overflow-hidden">
              <button
                onClick={() => setThirdPartyOpen(!thirdPartyOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <Users className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Third Party Sharing</h3>
                    <p className="text-xs text-muted-foreground">{displayedAnalysis.third_party_sharing?.length || 0} sharing partners identified</p>
                  </div>
                </div>
                {thirdPartyOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {thirdPartyOpen && (
                <div className="px-4 pb-4 border-t border-white/5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-4">
                    {displayedAnalysis.third_party_sharing?.map((item: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-white/5 border border-white/5">
                        <div className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0"></div>
                        <span className="truncate">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Comprehensive Mode Summary */}
          {analysisMode === "comprehensive" && policyResults.length > 1 && (
            <Card className="bg-gradient-to-r from-primary/5 to-cyan-500/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileStack className="h-5 w-5" />
                  All Policies Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {policyResults.map((policy, index) => (
                    <button
                      key={policy.type}
                      onClick={() => setSelectedPolicyIndex(index)}
                      className={clsx(
                        "p-4 rounded-lg border transition-all text-left",
                        selectedPolicyIndex === index 
                          ? "bg-primary/10 border-primary/30" 
                          : "bg-background/40 border-white/10 hover:bg-white/5"
                      )}
                    >
                      <p className="font-medium text-sm">{policy.name}</p>
                      {policy.status === 'complete' && policy.analysis?.score !== undefined && (
                        <p className={clsx(
                          "text-2xl font-bold mt-1",
                          policy.analysis.score >= 80 ? "text-green-400" :
                            policy.analysis.score >= 60 ? "text-yellow-400" :
                              "text-red-500"
                        )}>
                          {policy.analysis.score}
                        </p>
                      )}
                      {policy.status === 'error' && (
                        <p className="text-sm text-red-400 mt-1">Error</p>
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
