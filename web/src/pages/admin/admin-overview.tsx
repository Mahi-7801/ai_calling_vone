import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  PhoneCall,
  CreditCard,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  RotateCw,
  Radio,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { api } from '@/lib/api';
import { formatCurrencyINR } from '@/lib/utils';

interface AdminRecentCall {
  id: number;
  call_id: string;
  phone_number: string;
  direction: string;
  status: string;
  duration?: number;
  created_at: string;
  org_name?: string;
  employee_name?: string;
}

interface AdminOverviewData {
  orgs: number;
  users: number;
  employees: number;
  numbers: number;
  callsToday: number;
  callsTodayMinutes: number;
  calls30: number;
  minutes30: number;
  revenue: number;
  creditsUsed: number;
  callsOver7Days: Array<{ day: string; calls: number }>;
  activeCallsCount?: number;
  recentCalls?: AdminRecentCall[];
}

export function AdminOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOverview = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const res = await api.get<{ success: boolean; overview: AdminOverviewData }>('/admin/overview');
      setData(res.overview);
    } finally {
      if (!quiet) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    // Auto-refresh every 8 seconds for real-time supervisory overview
    const interval = setInterval(() => {
      fetchOverview(true);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const activeCalls = data.activeCallsCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Overview</h1>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live Telemetry (8s Sync)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time multi-tenant telemetry, carrier infrastructure, and platform revenue metrics.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOverview(false)}
            disabled={isRefreshing}
            className="gap-2 text-xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Top 4 Primary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Customer Revenue</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white shadow-xs">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-foreground">{formatCurrencyINR(data.revenue)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">From credit purchases &amp; top-ups</p>
        </Card>

        {/* Live Active Calls KPI */}
        <Card
          onClick={() => navigate('/admin/live-calls')}
          className="p-4 cursor-pointer hover:border-emerald-500/50 transition border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-card"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active Concurrent Calls</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600">
              <Radio className={`h-4 w-4 ${activeCalls > 0 ? 'animate-pulse' : ''}`} />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl font-extrabold text-foreground">{activeCalls}</p>
            <span className="text-[11px] font-semibold text-emerald-600">
              {activeCalls > 0 ? 'Live In-Progress' : 'Idle'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{data.callsToday} total calls placed today</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Organizations</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-600">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{data.orgs}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{data.users} registered users</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active AI Employees</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{data.employees}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{data.numbers} provisioned phone numbers</p>
        </Card>
      </div>

      {/* Carrier Infrastructure Status Bar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-3 rounded-lg border bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <p className="text-xs font-semibold text-foreground">Twilio PSTN (US)</p>
              <p className="text-[10px] text-muted-foreground font-mono">+1 737 250 8034</p>
            </div>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px]">Connected</Badge>
        </div>

        <div className="p-3 rounded-lg border bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <p className="text-xs font-semibold text-foreground">VoBiz PSTN (India)</p>
              <p className="text-[10px] text-muted-foreground font-mono">+91 806 535 4620</p>
            </div>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px]">Connected</Badge>
        </div>

        <div className="p-3 rounded-lg border bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <div>
              <p className="text-xs font-semibold text-foreground">Cartesia Sonic TTS</p>
              <p className="text-[10px] text-muted-foreground">Ultra-Low 120ms</p>
            </div>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px]">1,020 Voices</Badge>
        </div>

        <div className="p-3 rounded-lg border bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <div>
              <p className="text-xs font-semibold text-foreground">Groq LPU Engine</p>
              <p className="text-[10px] text-muted-foreground">Llama 3.3 70B</p>
            </div>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px]">Sub-150ms</Badge>
        </div>
      </div>

      {/* Quick Action Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          onClick={() => navigate('/admin/live-calls')}
          className="cursor-pointer transition hover:border-emerald-500/50 hover:shadow-sm"
        >
          <CardHeader className="p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Radio className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-base mt-3">Live Call Supervisor Wallboard</CardTitle>
            <CardDescription className="text-xs">
              Watch active PSTN sessions, stream real-time duration counters, and emergency terminate stuck calls.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card
          onClick={() => navigate('/admin/voice-clones')}
          className="cursor-pointer transition hover:border-primary/50 hover:shadow-sm"
        >
          <CardHeader className="p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-base mt-3">Voice Clones Studio</CardTitle>
            <CardDescription className="text-xs">
              Review customer voice clones, listen to audio samples, and manage Cartesia voice IDs.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card
          onClick={() => navigate('/admin/payments')}
          className="cursor-pointer transition hover:border-purple-500/50 hover:shadow-sm"
        >
          <CardHeader className="p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <CreditCard className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-base mt-3">Payments &amp; PDF Receipts</CardTitle>
            <CardDescription className="text-xs">
              Download tax invoice PDF receipts, manage customer ledger balances, and grant top-ups.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* 7-Day Platform Call Volume Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" /> Platform Call Volume (Last 7 Days)
            </CardTitle>
            <CardDescription className="text-xs">
              Daily completed calls across all tenant accounts.
            </CardDescription>
          </div>
          <span className="text-xs font-semibold text-purple-600 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
            {data.callsToday} calls today
          </span>
        </CardHeader>
        <CardContent className="h-64 pt-2">
          {!data.callsOver7Days || data.callsOver7Days.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
              <PhoneCall className="mb-2 h-8 w-8 opacity-40" />
              No calls recorded in the last 7 days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.callsOver7Days} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminCallsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9333ea" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#9333ea" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} domain={[0, (dataMax: number) => Math.max(dataMax, 5)]} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                <Area type="monotone" dataKey="calls" name="Total Calls" stroke="#9333ea" strokeWidth={2.5} fill="url(#adminCallsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Live Recent Platform Calls Feed */}
      {data.recentCalls && data.recentCalls.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Live Activity Feed
              </CardTitle>
              <CardDescription className="text-xs">
                Most recent calls processed by the platform across all tenant organizations.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/live-calls')}
              className="text-xs text-primary gap-1"
            >
              Open Supervisor <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Call ID</th>
                    <th className="py-2.5 px-4">Organization</th>
                    <th className="py-2.5 px-4">AI Employee</th>
                    <th className="py-2.5 px-4">Destination</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Duration</th>
                    <th className="py-2.5 px-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentCalls.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-medium text-foreground">
                        {c.call_id}
                      </td>
                      <td className="py-2.5 px-4 font-medium">
                        {c.org_name || 'Organization'}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {c.employee_name || 'Agent'}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {c.phone_number}
                      </td>
                      <td className="py-2.5 px-4">
                        {c.status === 'connected' ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1 text-[10px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Connected
                          </Badge>
                        ) : c.status === 'completed' ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                            Completed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            {c.status}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono">
                        {c.duration ? `${c.duration}s` : '0s'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-muted-foreground">
                        {new Date(c.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 30-Day Platform Volume */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> 30-Day Platform Calling Activity
          </CardTitle>
          <CardDescription className="text-xs">
            Cumulative calls placed across all organizations over the last 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/20 border">
            <div>
              <p className="text-xs text-muted-foreground">30-Day Completed Calls</p>
              <p className="text-2xl font-bold text-foreground mt-1">{data.calls30}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">30-Day Total Minutes</p>
              <p className="text-2xl font-bold text-foreground mt-1">{data.minutes30} mins</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Credits Consumed</p>
              <p className="text-2xl font-bold text-primary mt-1">{Math.round(data.creditsUsed)} cr</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Carrier Lines</p>
              <p className="text-2xl font-bold text-foreground mt-1">{data.numbers} DIDs</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
