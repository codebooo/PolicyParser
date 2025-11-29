import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Users, FileText, Activity } from "lucide-react";
import { clsx } from "clsx";

export default async function AdminPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.email !== 'policyparser.admin@gmail.com') {
        redirect('/');
    }

    const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: analysisCount } = await supabase.from('analyses').select('*', { count: 'exact', head: true });

    const { data: recentAnalyses } = await supabase
        .from('analyses')
        .select('id, company_name, domain, created_at, score, url, discovery_method, policy_url')
        .order('created_at', { ascending: false })
        .limit(10);

    return (
        <div className="container mx-auto py-12 px-4">
            <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-3 mb-12">
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{userCount || 0}</div>
                    </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Analyses</CardTitle>
                        <FileText className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{analysisCount || 0}</div>
                    </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">System Status</CardTitle>
                        <Activity className="h-4 w-4 text-green-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-400">Operational</div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity */}
            <Card className="bg-white/5 border-white/10">
                <CardHeader>
                    <CardTitle>Recent Analyses</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Company</TableHead>
                                <TableHead>Domain</TableHead>
                                <TableHead>Score</TableHead>
                                <TableHead>Discovery Method</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentAnalyses?.map((analysis) => (
                                <TableRow key={analysis.id}>
                                    <TableCell className="font-medium">{analysis.company_name || analysis.domain}</TableCell>
                                    <TableCell>{analysis.domain}</TableCell>
                                    <TableCell>
                                        <span className={clsx(
                                            "font-bold",
                                            analysis.score >= 80 ? "text-green-500" :
                                                analysis.score >= 60 ? "text-yellow-500" :
                                                    "text-red-500"
                                        )}>
                                            {analysis.score}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{analysis.discovery_method || 'Legacy AI'}</span>
                                            {analysis.policy_url && (
                                                <a href={analysis.policy_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline truncate max-w-[200px]">
                                                    {analysis.policy_url}
                                                </a>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{new Date(analysis.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm">View</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
