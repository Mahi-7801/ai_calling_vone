import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building,
  Check,
  CreditCard,
  Crown,
  FileText,
  History,
  Mail,
  PhoneCall,
  Plus,
  Receipt,
  RotateCw,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useBilling, useCreateOrder, useEmployees, useVerifyPayment } from '@/hooks/queries';
import { cn, formatCurrencyINR, formatDateTime, titleCase } from '@/lib/utils';
import type { BillingPackage } from '@/types';

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

type BillingTab = 'overview' | 'credits' | 'transactions' | 'usage' | 'gst';

interface TabItem {
  key: BillingTab;
  label: string;
  count?: number;
}

export function BillingPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user, setWallet } = useAuth();
  const { data, isLoading, isFetching, refetch } = useBilling();
  const { data: empData } = useEmployees();
  const createOrder = useCreateOrder();
  const verifyPayment = useVerifyPayment();

  const [activeTab, setActiveTab] = useState<BillingTab>('overview');
  const [buying, setBuying] = useState<string | null>(null);

  // Keep hook order stable even while billing data is still loading.
  const spentThisMonth = useMemo(() => {
    if (!data?.billing) return 0;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return data.billing.transactions
      .filter((t: any) => t.type === 'debit' && new Date(t.created_at).getTime() >= monthStart.getTime())
      .reduce((sum: number, t: any) => sum + Number(t.credits || 0), 0);
  }, [data?.billing?.transactions]);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const b = data.billing;
  const balance = Number(b.wallet.balance ?? 0);
  const isLowBalance = balance < 100;

  // Derived statistics matching Outpero specification
  const talkTimeValueMin = Math.max(0, Math.floor(balance / 3.5));
  const talkTimePremiumMin = Math.max(0, Math.floor(balance / 6.8));

  const now = new Date();
  const currentMonthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Calculate live employees. Previously fell back to a hardcoded 4 when the
  // list was empty, so a brand new org saw "4 of 4 employees live".
  const employeesList = empData?.employees ?? [];
  const totalEmployeesCount = employeesList.length;
  const liveEmployeesCount = employeesList.filter((e) => Boolean(e.assigned_number)).length;

  // Month spend calculation. The backend previously returned an all-time
  // SUM(credits_used) with no date filter, so this was labelled "spent in
  const tabs: TabItem[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'credits', label: 'Credits' },
    { key: 'transactions', label: 'Transactions', count: b.transactions.length },
    { key: 'usage', label: 'Usage' },
    { key: 'gst', label: 'GST' },
  ];

  const buy = async (pkg: BillingPackage) => {
    setBuying(pkg.key);
    try {
      const order = await createOrder.mutateAsync({ packageKey: pkg.key, amount: pkg.price, credits: pkg.credits });

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Could not load the Razorpay checkout script. Check your connection and retry.');

      // The payment id and signature are only produced by the gateway's checkout
      // handler. Verifying without them cannot succeed, so the real checkout has
      // to run before credits can be granted.
      const result = await new Promise<{ paymentId: string; signature: string }>((resolve, reject) => {
        const options = {
          key: order.order.keyId,
          amount: Math.round(order.order.amount * 100),
          currency: order.order.currency || 'INR',
          name: 'Telugu AI Calling Platform',
          description: `${pkg.credits.toLocaleString('en-IN')} credits`,
          order_id: order.order.orderId,
          prefill: { name: user?.name || '', email: user?.email || '' },
          theme: { color: '#7c3aed' },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
          handler: (response: { razorpay_payment_id: string; razorpay_signature: string }) => {
            resolve({ paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
          },
        };
        const rzp = new (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay(options);
        rzp.open();
      });

      const verified = await verifyPayment.mutateAsync({
        orderId: order.order.orderId,
        paymentId: result.paymentId,
        paymentRecordId: order.order.paymentId,
        signature: result.signature,
        credits: order.order.credits,
      });
      await refetch();
      setWallet({ ...b.wallet, balance: verified.walletBalance ?? b.wallet.balance });
      toast.success(`${pkg.credits.toLocaleString('en-IN')} credits added`, `Payment for ${pkg.name} package verified successfully.`);
    } catch (err) {
      const message = err instanceof ApiClientError || err instanceof Error ? err.message : 'Payment could not be completed.';
      toast.error('Purchase failed', message);
      refetch();
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Finish setting up your AI employee */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 rounded-xl border border-amber-200/90 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
            <PhoneCall className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Finish setting up your AI employee</p>
            <p className="text-xs text-muted-foreground">About three minutes, and free to build and test.</p>
          </div>
        </div>
        <Button
          onClick={() => navigate('/employees')}
          className="h-8 shrink-0 rounded-lg bg-[#d97706] px-4 text-xs font-semibold text-white shadow-xs hover:bg-[#b45309]"
        >
          Continue
        </Button>
      </div>

      {/* Header: Billing & Credits with Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
            Billing
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Credits &amp; billing</h1>
          <p className="text-sm text-muted-foreground">
            Everything runs on credits · 1 credit = ₹1 · they never expire
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 rounded-lg text-xs font-medium self-start sm:self-center"
        >
          <RotateCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Tabs Navigation: Overview | Credits | Transactions | Usage | GST */}
      <div className="border-b border-border">
        <div className="flex flex-wrap gap-2 -mb-px">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-hidden',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
                {typeof tab.count === 'number' && tab.count > 0 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 5 KPI Cards Grid */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {/* Card 1: Credits balance */}
            <Card className="flex flex-col justify-between border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Credits balance</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="text-2xl font-bold tracking-tight text-foreground">
                    ₹{balance.toFixed(2)}
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      isLowBalance
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    )}
                  >
                    {isLowBalance ? 'Low balance' : 'Active balance'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">· Never expires</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('credits')}
                className="mt-3 h-7 w-full rounded-md text-xs font-medium border-primary/30 hover:bg-primary/5"
              >
                <Plus className="mr-1 h-3 w-3" /> Add credits
              </Button>
            </Card>

            {/* Card 2: Talk time remaining */}
            <Card className="flex flex-col justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Talk time remaining</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  {talkTimeValueMin} min
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {talkTimePremiumMin} min on Premium
              </p>
            </Card>

            {/* Card 3: Estimated runway */}
            <Card className="flex flex-col justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Estimated runway</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">—</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">not enough usage to estimate</p>
            </Card>

            {/* Card 4: Spent in [Month Year] */}
            <Card className="flex flex-col justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Spent in {currentMonthName}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  ₹{Math.round(spentThisMonth)}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {b.usage.calls ?? 0} calls · {b.usage.minutes ?? 0} min
              </p>
            </Card>

            {/* Card 5: Employees live */}
            <Card className="flex flex-col justify-between p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Employees live</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                  {liveEmployeesCount} of {totalEmployeesCount}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">with a number, taking real calls</p>
            </Card>
          </div>

          {/* What calls cost */}
          <div>
            <h2 className="text-base font-bold tracking-tight text-foreground mb-3">What calls cost</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Talk time card (spans 2 columns) */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Talk time</CardTitle>
                  <CardDescription className="text-xs">
                    Charged per minute, by the voice each employee uses — set on its Voice tab
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Value */}
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-1">
                      <p className="text-2xl font-bold tracking-tight text-foreground">
                        ₹3.5<span className="text-xs font-normal text-muted-foreground">/min</span>
                      </p>
                      <p className="text-xs font-semibold text-foreground">Value</p>
                      <p className="text-xs text-muted-foreground">Everyday calling</p>
                    </div>

                    {/* Standard */}
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-1">
                      <p className="text-2xl font-bold tracking-tight text-foreground">
                        ₹5<span className="text-xs font-normal text-muted-foreground">/min</span>
                      </p>
                      <p className="text-xs font-semibold text-foreground">Standard</p>
                      <p className="text-xs text-muted-foreground">More natural</p>
                    </div>

                    {/* Premium */}
                    <div className="relative rounded-xl border border-purple-500/40 bg-purple-500/5 p-4 space-y-1">
                      <span className="absolute top-2.5 right-2.5 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                        Most lifelike
                      </span>
                      <p className="text-2xl font-bold tracking-tight text-purple-600 dark:text-purple-400">
                        ₹6.8<span className="text-xs font-normal text-muted-foreground">/min</span>
                      </p>
                      <p className="text-xs font-semibold text-foreground">Premium</p>
                      <p className="text-xs text-muted-foreground">Highest naturalness</p>
                    </div>
                  </div>

                  {/* Footnotes & Rules */}
                  <div className="rounded-lg bg-muted/40 p-3.5 space-y-1 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Nobody picks up? You pay ₹0. Ringing, busy and unanswered calls cost nothing at all.
                    </p>
                    <p>
                      Billed in 30-second blocks. A call under 30 seconds costs half a minute; a 40-second call costs one minute.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* A phone number card */}
              <Card className="flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">A phone number</CardTitle>
                  <CardDescription className="text-xs">
                    One per employee that takes real calls · renews monthly
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-3xl font-extrabold text-foreground">
                      ₹649<span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Building, training and testing an employee are free. AI actions — drafting a script, a suggestion, a chat rehearsal — cost about ₹0.2 each, and only when you actually use one.
                  </p>
                </CardContent>
                <CardFooter className="pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/phone-numbers')}
                    className="w-full text-xs font-medium h-8"
                  >
                    Manage phone numbers <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>

          {/* Enterprise Volume Calling Callout */}
          <div className="rounded-xl border border-border bg-gradient-to-r from-card via-muted/20 to-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  Enterprise
                </span>
                <h3 className="text-sm font-semibold text-foreground">Calling at volume?</h3>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                Per-minute rates below the ones above, more simultaneous calls, and a named contact.
              </p>
            </div>
            <a
              href="mailto:custom@outpero.com?subject=Volume%20pricing%20enquiry"
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0 shadow-xs"
            >
              <Mail className="h-3.5 w-3.5 text-primary" />
              custom@outpero.com
            </a>
          </div>
        </div>
      )}

      {/* TAB 2: CREDITS (BUY CREDITS) */}
      {activeTab === 'credits' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Buy credits</h2>
              <p className="text-xs text-muted-foreground">
                Track usage and top up your credit wallet. All credit top-ups are added immediately.
              </p>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
              Current balance: <span className="font-semibold text-foreground">₹{balance.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {b.pricing.packages.map((pkg) => {
              const isGrowth = pkg.key === 'growth';
              const isEnterprise = pkg.key === 'enterprise';
              return (
                <Card
                  key={pkg.key}
                  className={cn(
                    'relative flex flex-col justify-between transition-all hover:border-primary/50',
                    isGrowth ? 'border-primary/50 shadow-sm ring-1 ring-primary/20' : ''
                  )}
                >
                  {isGrowth && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Most Popular
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      {isEnterprise ? (
                        <Crown className="h-4 w-4 text-primary" />
                      ) : (
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                      )}
                      <CardTitle className="text-base">{pkg.name}</CardTitle>
                    </div>
                    <p className="text-2xl font-bold tracking-tight text-foreground">
                      {formatCurrencyINR(pkg.price)}
                    </p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {pkg.credits.toLocaleString('en-IN')} credits
                    </p>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground pb-4">
                    <p>
                      ~{Math.round(pkg.credits / Math.max(1, b.pricing.creditPerMinute)).toLocaleString('en-IN')} minutes of AI calling at {formatCurrencyINR(b.pricing.creditPerMinute)}/minute.
                    </p>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button
                      className="w-full text-xs font-semibold h-9"
                      variant={isGrowth ? 'default' : 'outline'}
                      loading={buying === pkg.key}
                      onClick={() => buy(pkg)}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Buy {pkg.credits.toLocaleString('en-IN')} credits
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 text-xs text-muted-foreground flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
            <p>
              Payments are processed securely by our backend payment provider. Pricing is managed by your administrator.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: TRANSACTIONS & PAYMENTS */}
      {activeTab === 'transactions' && (
        <div className="space-y-6">
          {/* Credit Transactions Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-primary" /> Transactions
              </CardTitle>
              <CardDescription className="text-xs">
                Detailed ledger of credit top-ups, call debits, and system allocations.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {b.transactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <StatusBadge status={t.type === 'credit' ? 'paid' : 'debit'} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'font-semibold text-sm',
                            t.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                          )}
                        >
                          {t.type === 'credit' ? '+' : '−'}
                          {t.amount}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {t.balance_after}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                          {t.reference || t.description || '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatDateTime(t.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Check className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">No transactions recorded</p>
                  <p className="text-xs text-muted-foreground">Your transaction ledger will appear here after calls or top-ups.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Online Payments Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4 text-primary" /> Payments
              </CardTitle>
              <CardDescription className="text-xs">
                History of online checkout orders and provider reconciliation.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {b.payments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          {p.reference || `pay_${p.id}`}
                        </TableCell>
                        <TableCell className="font-semibold text-sm">
                          {formatCurrencyINR(p.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {titleCase(p.provider)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatDateTime(p.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <p className="text-sm font-medium">No online payments yet</p>
                  <p className="text-xs text-muted-foreground">Top-up payment invoices will be listed here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: USAGE */}
      {activeTab === 'usage' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Current credits</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{Math.round(balance)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Calls</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{b.usage.calls ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Minutes used</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{b.usage.minutes ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">Credits consumed</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{b.usage.credits_consumed ?? 0}</p>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" /> Usage Breakdown
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time tracking of AI voice call minutes, prompt syntheses, and carrier connectivity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Voice calling consumption</p>
                  <p className="text-xs text-muted-foreground">Billed in 30-second blocks per active call</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{b.usage.minutes ?? 0} mins</p>
                  <p className="text-xs text-muted-foreground">{b.usage.calls ?? 0} completed calls</p>
                </div>
              </div>

              <div className="rounded-lg border p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">AI Actions (Script drafting, Chat rehearsals)</p>
                  <p className="text-xs text-muted-foreground">₹0.2 per AI generation action</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">Included</p>
                  <p className="text-xs text-muted-foreground">Free during trial</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: GST & TAX DETAILS */}
      {activeTab === 'gst' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" /> GST &amp; Tax Information
              </CardTitle>
              <CardDescription className="text-xs">
                Configure your business GSTIN and billing address for GST-compliant tax invoices.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-3.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Legal Business Name</p>
                  <p className="text-sm font-semibold text-foreground">Outpero Technologies Private Limited</p>
                </div>
                <div className="rounded-lg border p-3.5 space-y-1">
                  <p className="text-xs text-muted-foreground">GSTIN / Tax ID</p>
                  <p className="text-sm font-semibold font-mono text-foreground">27AAPCU9603R1ZV</p>
                </div>
                <div className="rounded-lg border p-3.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Tax Regime</p>
                  <p className="text-sm font-semibold text-foreground">India GST (18% inclusive)</p>
                </div>
                <div className="rounded-lg border p-3.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Registered Address</p>
                  <p className="text-sm font-semibold text-foreground">Bengaluru, Karnataka, India</p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-4 space-y-1.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" /> Tax Invoicing Policy
                </p>
                <p>
                  All purchases made on Outpero include applicable goods and services taxes (GST at 18%). Invoices with full input tax credit (ITC) eligibility are automatically generated upon successful payment.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}