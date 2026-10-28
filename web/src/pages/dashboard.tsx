import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Coins,
  Gauge,
  Megaphone,
  PhoneCall,
  PhoneMissed,
  Plus,
  Send,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { CardGridSkeleton, Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/queries';
import { formatCredits, formatDuration, titleCase } from '@/lib/utils';
import type { DashboardData } from '@/types';

const OUTCOME_COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#06b6d4', '#ec4899'];

function StatCard({
  to,
  label,
  value,
  sub,
  icon: Icon,
  tone = 'primary',
}: {
  to: string;
  label: string;
  value: string;
  sub?: string;
  icon: typeof Coins;
  tone?: 'primary' | 'green' | 'amber' | 'red' | 'sky' | 'violet';
}) {
  const tones: Record<string, string> = {
    primary: 'bg-violet-100 text-violet-600',
    green: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-rose-100 text-rose-600',
    sky: 'bg-sky-100 text-sky-600',
    violet: 'bg-fuchsia-100 text-fuchsia-600',
  };
  return (
    <Link to={to} className="group block rounded-xl border bg-card p-4 sm:p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-3 sm:mt-4 text-xl sm:text-2xl font-bold tracking-tight truncate">{value}</p>
      <p className="mt-0.5 text-xs sm:text-sm font-medium text-muted-foreground truncate">{label}</p>
      {sub ? <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground/70 truncate">{sub}</p> : null}
    </Link>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError, refetch } = useDashboard();
  const navigate = useNavigate();

  if (isLoading || !data) {
    return (
      <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full">
        <Skeleton className="h-32 w-full" />
        <CardGridSkeleton count={4} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const d: DashboardData['dashboard'] = data.dashboard;
  const stats = d.stats;
  const onboarding = d.onboarding;

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Demo card */}
      {!onboarding.demo_done ? (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex flex-col items-start gap-4 p-4 sm:p-6 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-semibold">Meet your AI employee</h2>
              <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                Take a 30-second demo call and watch a live Telugu conversation with transcript, summary and outcome.
              </p>
            </div>
            <Button onClick={() => navigate('/calling/instant')} className="w-full sm:w-auto text-xs sm:text-sm h-9">
              <PhoneCall className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" /> Try Demo Call
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4 min-w-0 max-w-full">
        <StatCard to="/billing" label="Available credits" value={formatCredits(stats.credits)} sub="Wallet balance" icon={Coins} tone="primary" />
        <StatCard to="/results/conversations" label="Calls today" value={String(stats.calls_today)} sub={`${formatDuration(stats.minutes_used)} used`} icon={PhoneCall} tone="sky" />
        <StatCard to="/results/conversations" label="Successful calls" value={String(stats.successful_calls)} sub={`${stats.total_calls} total calls`} icon={ThumbsUp} tone="green" />
        <StatCard to="/results/leads" label="Leads contacted" value={String(d.leads.contacted)} sub={`${d.leads.total} total leads`} icon={Send} tone="amber" />
        <StatCard to="/results/leads" label="Interested leads" value={String(d.leads.interested)} sub={`${d.leads.conversion_pct}% per successful call`} icon={TrendingUp} tone="violet" />
        <StatCard to="/employees" label="Active AI employees" value={String(d.counts.employees)} sub="In your team" icon={Users} tone="green" />
        <StatCard to="/calling/campaigns" label="Active campaigns" value={String(d.counts.active_campaigns)} sub="Running right now" icon={Megaphone} tone="red" />
        <StatCard to="/performance" label="Avg call duration" value={formatDuration(stats.avg_duration)} sub="Across employees" icon={Gauge} tone="sky" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 lg:grid-cols-3 min-w-0 max-w-full">
        <Card className="lg:col-span-2 min-w-0 overflow-hidden">
          <CardHeader className="flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base">Calls over time</CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" /> Calls</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Minutes</span>
            </div>
          </CardHeader>
          <CardContent className="h-64 min-w-0 max-w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.charts.callsOverTime}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={35} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                <Area type="monotone" dataKey="calls" stroke="#8b5cf6" strokeWidth={2} fill="url(#callsGrad)" />
                <Area type="monotone" dataKey="minutes" stroke="#38bdf8" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm sm:text-base">Call outcomes</CardTitle>
          </CardHeader>
          <CardContent className="h-64 min-w-0 max-w-full overflow-hidden">
            {d.charts.byOutcome.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
                <PhoneMissed className="mb-2 h-8 w-8" /> No outcomes yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.charts.byOutcome} dataKey="c" nameKey="outcome" innerRadius={50} outerRadius={82} paddingAngle={2}>
                    {d.charts.byOutcome.map((_, i) => (
                      <Cell key={i} fill={OUTCOME_COLORS[i % OUTCOME_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {d.charts.byOutcome.map((o, i) => (
                <span key={o.outcome} className="flex items-center gap-1 text-[11px] sm:text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: OUTCOME_COLORS[i % OUTCOME_COLORS.length] }} />
                  {titleCase(o.outcome)} ({o.c})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 lg:grid-cols-3 min-w-0 max-w-full">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-1.5">
            <CardTitle className="text-sm sm:text-base">Employee performance</CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-violet-500" /> Calls
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Success
              </span>
            </div>
          </CardHeader>
          <CardContent className="h-56 min-w-0 max-w-full overflow-hidden">
            {!d.charts.employeePerf || d.charts.employeePerf.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
                <Users className="mb-2 h-8 w-8 opacity-40" />
                No employees yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.charts.employeePerf} layout="vertical" margin={{ left: 5, right: 10, top: 5, bottom: 5 }}>
                  <XAxis type="number" hide domain={[0, (dataMax: number) => Math.max(dataMax, 3)]} />
                  <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                  <Bar dataKey="calls" name="Total calls" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="successful" name="Successful" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm sm:text-base">Credit usage</CardTitle>
            <span className="text-xs text-muted-foreground font-medium">Last 7 days</span>
          </CardHeader>
          <CardContent className="h-56 min-w-0 max-w-full overflow-hidden">
            {!d.charts.creditUsage || d.charts.creditUsage.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
                <Coins className="mb-2 h-8 w-8 opacity-40" />
                No credit usage yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.charts.creditUsage} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="creditUsageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" allowDecimals={false} domain={[0, (dataMax: number) => Math.max(dataMax, 5)]} width={30} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                  <Area type="monotone" dataKey="credits" name="Credits" stroke="#f59e0b" strokeWidth={2} fill="url(#creditUsageGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm sm:text-base">Lead funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Total leads', value: d.leads.total, pct: 100 },
              { label: 'Contacted', value: d.leads.contacted, pct: d.leads.total ? Math.round((d.leads.contacted / d.leads.total) * 100) : 0 },
              { label: 'Interested', value: d.leads.interested, pct: d.leads.total ? Math.round((d.leads.interested / d.leads.total) * 100) : 0 },
              // conversion_pct is interested leads divided by successful calls,
              // so it is a percentage and not a lead count. Labelling it
              // "Converted" alongside the counts above read as a fourth count.
              { label: 'Interested per successful call', pct: d.leads.conversion_pct, pctLabel: true },
            ].map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs sm:text-sm">{r.label}</span>
                  <span className="font-semibold text-xs sm:text-sm">{r.pctLabel ? `${r.pct}%` : r.value}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${Math.min(100, r.pct)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent employees */}
        <Card className="lg:col-span-1 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">Recent employees</CardTitle>
            </div>
            <Link to="/employees" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 flex flex-col justify-center">
            {d.recentEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-6 px-3 rounded-xl border border-dashed bg-muted/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 shadow-xs mb-3">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-foreground">No Employees Yet</h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">
                  Build your first lifelike Telugu voice agent in 2 minutes.
                </p>
                <Button
                  size="default"
                  onClick={() => navigate('/employees/new')}
                  className="mt-4 w-full font-bold shadow-md gap-2 text-sm bg-primary hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Build AI Employee
                </Button>
              </div>
            ) : (
              d.recentEmployees.map((emp) => (
                <Link key={emp.id} to={`/employees/${emp.id}`} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/60 transition-colors">
                  <Avatar name={emp.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{emp.name}</p>
                    <p className="truncate text-xs text-muted-foreground mt-0.5">{emp.role} · {emp.language}</p>
                  </div>
                  <StatusBadge status={emp.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent campaigns */}
        <Card className="lg:col-span-1 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">Recent campaigns</CardTitle>
            </div>
            <Link to="/calling/campaigns" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 flex flex-col justify-center">
            {d.recentCampaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-6 px-3 rounded-xl border border-dashed bg-muted/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs mb-3">
                  <Megaphone className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-foreground">No Campaigns Active</h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">
                  Automate outbound calling at scale across all your leads.
                </p>
                <Button
                  size="default"
                  onClick={() => navigate('/calling/campaigns')}
                  className="mt-4 w-full font-bold shadow-md gap-2 text-sm bg-primary hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Create Campaign
                </Button>
              </div>
            ) : (
              d.recentCampaigns.map((c) => (
                <Link key={c.id} to={`/calling/campaigns/${c.id}`} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/60 transition-colors">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground mt-0.5">{c.employee_name} · {c.processed_leads}/{c.total_leads} leads</p>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent leads */}
        <Card className="lg:col-span-1 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">Recent leads</CardTitle>
            </div>
            <Link to="/results/leads" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 flex flex-col justify-center">
            {d.recentLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-6 px-3 rounded-xl border border-dashed bg-muted/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 shadow-xs mb-3">
                  <PhoneCall className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-foreground">No Leads Found</h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">
                  Import contacts or create instant call triggers to see results.
                </p>
                <Button
                  size="default"
                  onClick={() => navigate('/results/leads')}
                  className="mt-4 w-full font-bold shadow-md gap-2 text-sm bg-primary hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Import Leads
                </Button>
              </div>
            ) : (
              d.recentLeads.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/60 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{l.name || 'Unnamed Lead'}</p>
                    <p className="truncate text-xs text-muted-foreground mt-0.5">{l.phone} · {l.company || 'Direct Contact'}</p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {isError ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Couldn't refresh dashboard data.
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : null}
    </div>
  );
}