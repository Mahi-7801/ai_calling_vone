import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  Phone,
  PhoneMissed,
  Star,
  ThumbsUp,
  TrendingUp,
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
import { EmptyState } from '@/components/ui/empty-state';
import { CardGridSkeleton, Skeleton } from '@/components/ui/skeleton';
import { usePerformance } from '@/hooks/queries';
import { formatCredits, formatDuration, titleCase } from '@/lib/utils';

const OUTCOME_COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#06b6d4', '#ec4899'];

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  value: string;
  icon: typeof Phone;
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
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export function PerformancePage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePerformance();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <CardGridSkeleton count={4} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const p = data.performance;
  const t = p.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/employees')}
          className="gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-bold">Performance</h1>
        <p className="text-sm text-muted-foreground">Call analytics across your AI employees.</p>
      </div>

      {isError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Couldn't load performance data. Try refreshing the page.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total calls" value={String(t.total_calls ?? 0)} icon={Phone} tone="primary" />
        <MetricCard label="Answered calls" value={String(t.answered_calls ?? 0)} icon={CheckCircle2} tone="green" />
        <MetricCard label="Completed calls" value={String(t.completed_calls ?? 0)} icon={ThumbsUp} tone="sky" />
        <MetricCard label="Failed calls" value={String(t.failed_calls ?? 0)} icon={PhoneMissed} tone="red" />
        <MetricCard label="Average duration" value={formatDuration(t.avg_duration ?? 0)} icon={Clock} tone="amber" />
        <MetricCard label="Interested leads" value={String(t.interested ?? 0)} icon={Star} tone="violet" />
        <MetricCard label="Conversion" value={`${Math.round((t.conversion ?? 0) * 100)}%`} icon={TrendingUp} tone="green" />
        <MetricCard label="Credits used" value={formatCredits(t.credits_used ?? 0)} icon={BarChart3} tone="sky" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calls & minutes per day</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {!p.perDay || p.perDay.length === 0 ? (
              <EmptyState title="No calls in the last 14 days" description="Runs some calls and analytics will build up here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={p.perDay}>
                  <defs>
                    <linearGradient id="perfCallsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                  <Area type="monotone" dataKey="calls" stroke="#8b5cf6" strokeWidth={2} fill="url(#perfCallsGrad)" />
                  <Area type="monotone" dataKey="minutes" stroke="#38bdf8" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outcome distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {!p.outcomeDistribution || p.outcomeDistribution.length === 0 ? (
              <EmptyState title="No outcomes yet" description="Call outcomes will be shown here after your first calls." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={p.outcomeDistribution} dataKey="c" nameKey="outcome" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {p.outcomeDistribution.map((_, i) => (
                        <Cell key={i} fill={OUTCOME_COLORS[i % OUTCOME_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {p.outcomeDistribution.map((o, i) => (
                    <span key={o.outcome} className="flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: OUTCOME_COLORS[i % OUTCOME_COLORS.length] }} />
                      {titleCase(o.outcome)} ({o.c})
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee comparison</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {!p.employeeComparison || p.employeeComparison.length === 0 ? (
            <EmptyState
              title="No employees yet"
              description="Create an AI employee to start comparing performance."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.employeeComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)' }} />
                <Bar dataKey="calls" name="Calls" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="successful" name="Successful" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="interested" name="Interested" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employee performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {p.employeeComparison.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>
            ) : (
              p.employeeComparison.map((e) => (
                <Link key={e.id} to={`/employees/${e.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.role}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold">{e.calls ?? 0} calls</p>
                    <p className="text-muted-foreground">{formatDuration(e.avg_duration ?? 0)} avg</p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick stats</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total calls', value: String(t.total_calls ?? 0) },
              { label: 'Avg duration', value: formatDuration(t.avg_duration ?? 0) },
              { label: 'Conversion', value: `${Math.round((t.conversion ?? 0) * 100)}%` },
              { label: 'Credits used', value: formatCredits(t.credits_used ?? 0) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-3 text-center">
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}