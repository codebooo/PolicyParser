"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { createClient } from "@/utils/supabase/client"
import { checkProStatus } from "../checkProStatus"
import { getTrackedPolicies, untrackPolicy, checkTrackedPoliciesForUpdates } from "../trackingActions"
import { Loader2, Shield, Zap, Trash2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function AccountPage() {
    const [user, setUser] = useState<any>(null)
    const [isPro, setIsPro] = useState(false)
    const [loading, setLoading] = useState(true)
    const [trackedPolicies, setTrackedPolicies] = useState<any[]>([])
    const [checkingUpdates, setCheckingUpdates] = useState(false)
    const [updates, setUpdates] = useState<any[]>([])
    const router = useRouter()

    useEffect(() => {
        const init = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                router.push('/login')
                return
            }

            setUser(user)

            const status = await checkProStatus()
            setIsPro(status.isPro)

            const policies = await getTrackedPolicies()
            setTrackedPolicies(policies)

            setLoading(false)
        }
        init()
    }, [router])

    const handleUntrack = async (domain: string) => {
        if (confirm(`Are you sure you want to stop tracking ${domain}?`)) {
            await untrackPolicy(domain)
            setTrackedPolicies(prev => prev.filter(p => p.domain !== domain))
        }
    }

    const handleCheckUpdates = async () => {
        setCheckingUpdates(true)
        setUpdates([])
        try {
            const result = await checkTrackedPoliciesForUpdates()
            if (result.success && result.updates) {
                setUpdates(result.updates)
                if (result.updates.length === 0) {
                    alert("No updates found for your tracked policies.")
                }
            } else {
                alert(result.error || "Failed to check for updates.")
            }
        } catch (e) {
            console.error(e)
            alert("An error occurred while checking for updates.")
        } finally {
            setCheckingUpdates(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                    <p className="text-muted-foreground">Welcome back, {user?.user_metadata?.full_name || user?.email}</p>
                </div>
                <Link href="/analyze">
                    <Button variant="outline">New Analysis</Button>
                </Link>
            </div>

            {/* Profile Card */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Shield className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-xl">{user?.email}</CardTitle>
                        <CardDescription>Member since {new Date(user?.created_at).toLocaleDateString()}</CardDescription>
                    </div>
                    <div className="ml-auto">
                        {isPro ? (
                            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-amber-400/30 rounded-full">
                                <Zap className="h-4 w-4 text-amber-400" />
                                <span className="text-sm font-bold text-amber-400">PRO MEMBER</span>
                            </div>
                        ) : (
                            <Link href="/plans">
                                <Button size="sm" className="bg-gradient-to-r from-primary to-cyan-600 hover:opacity-90">Upgrade to Pro</Button>
                            </Link>
                        )}
                    </div>
                </CardHeader>
            </Card>

            {/* Tracked Policies */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-foreground">Tracked Policies</h2>
                    <Button
                        onClick={handleCheckUpdates}
                        disabled={checkingUpdates || trackedPolicies.length === 0}
                        variant="outline"
                    >
                        {checkingUpdates ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        Check for Updates
                    </Button>
                </div>

                {updates.length > 0 && (
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2 animate-in fade-in slide-in-from-top-2">
                        <h3 className="font-bold text-green-400 flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5" />
                            Updates Found!
                        </h3>
                        <ul className="space-y-1 text-sm text-green-300/80">
                            {updates.map((u, i) => (
                                <li key={i}>• <strong>{u.domain}</strong> has a new policy version detected.</li>
                            ))}
                        </ul>
                    </div>
                )}

                {trackedPolicies.length === 0 ? (
                    <Card className="bg-background/40 border-dashed border-white/10">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                            <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
                            <p className="text-muted-foreground">You are not tracking any policies yet.</p>
                            <Link href="/analyze">
                                <Button variant="ghost">Analyze a policy to start tracking</Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {trackedPolicies.map((policy) => (
                            <Card key={policy.id} className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary font-bold">
                                            {policy.domain.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-foreground">{policy.domain}</h3>
                                            <p className="text-xs text-muted-foreground">Last checked: {new Date(policy.last_checked).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => handleUntrack(policy.domain)} className="text-muted-foreground hover:text-red-400">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
