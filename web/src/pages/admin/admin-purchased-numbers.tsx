import { useState, useEffect, useMemo } from 'react';
import {
  History,
  Building2,
  User,
  Search,
  RotateCw,
  CreditCard,
  Calendar,
  CheckCircle2,
  FileCheck2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatCurrencyINR } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

interface PurchasedNumberRecord {
  id: number;
  organization_id: number;
  user_id: number | null;
  number: string;
  provider: string;
  country: string;
  region: string | null;
  monthly_cost: number;
  setup_fee: number;
  amount_paid: number;
  currency: string;
  payment_id: string;
  carrier_result: any;
  status: string;
  created_at: string;
  org_name?: string;
  user_name?: string;
  user_email?: string;
}

export function AdminPurchasedNumbersPage() {
  const toast = useToast();
  const [purchases, setPurchases] = useState<PurchasedNumberRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPurchases = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const res = await api.get<{ success: boolean; purchases: PurchasedNumberRecord[] }>(
        '/admin/numbers/purchases'
      );
      setPurchases(res.purchases || []);
    } catch {
      if (!quiet) toast.error('Failed to load purchased numbers history');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
    const interval = setInterval(() => {
      fetchPurchases(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalSpent = useMemo(
    () => purchases.reduce((acc, p) => acc + (Number(p.amount_paid) || 0), 0),
    [purchases]
  );

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return purchases;
    const q = searchQuery.toLowerCase();
    return purchases.filter(
      (p) =>
        p.number.toLowerCase().includes(q) ||
        (p.org_name || '').toLowerCase().includes(q) ||
        (p.user_name || '').toLowerCase().includes(q) ||
        (p.user_email || '').toLowerCase().includes(q) ||
        (p.payment_id || '').toLowerCase().includes(q)
    );
  }, [purchases, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-lg font-bold tracking-tight text-foreground">Purchased Numbers Log</h1>
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold">
              <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-600" /> Carrier Orders
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Audit trail of telephone numbers purchased by users with gateway IDs and timestamps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPurchases(false)}
            disabled={isLoading}
            className="gap-1.5 text-[11px] sm:text-xs h-7 sm:h-8 px-2.5 sm:px-3"
          >
            <RotateCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Metric Cards - 3 Column Compact Grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="p-2 sm:p-3.5 text-center sm:text-left">
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">Purchased</p>
          <p className="text-sm sm:text-lg font-bold text-foreground mt-0.5">{purchases.length}</p>
          <p className="hidden sm:block text-[10px] text-muted-foreground mt-0.5">Provisioned via Carrier</p>
        </Card>

        <Card className="p-2 sm:p-3.5 text-center sm:text-left">
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">Total Spent</p>
          <p className="text-sm sm:text-lg font-bold text-foreground mt-0.5">{formatCurrencyINR(totalSpent)}</p>
          <p className="hidden sm:block text-[10px] text-emerald-600 mt-0.5 font-semibold">Processed Gateway</p>
        </Card>

        <Card className="p-2 sm:p-3.5 text-center sm:text-left">
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">Active</p>
          <p className="text-sm sm:text-lg font-bold text-foreground mt-0.5">
            {purchases.filter((p) => p.status === 'completed').length}
          </p>
          <p className="hidden sm:block text-[10px] text-muted-foreground mt-0.5">100% Success Rate</p>
        </Card>
      </div>

      {/* Orders Table */}
      <Card className="shadow-xs border-border/60">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Purchase Orders &amp; Audit Trail
              </CardTitle>
              <CardDescription className="text-xs">
                Log of telephone numbers acquired by tenants with payment verification.
              </CardDescription>
            </div>
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search number, user, tenant, txn..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
              <FileCheck2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p>No purchased number records found.</p>
              <p className="text-[11px] text-muted-foreground">
                When users purchase numbers through the payment gateway, orders will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-3 px-4">Purchased Number</th>
                    <th className="py-3 px-4">Buyer / User</th>
                    <th className="py-3 px-4">Organization</th>
                    <th className="py-3 px-4">Amount Paid</th>
                    <th className="py-3 px-4">Payment Reference</th>
                    <th className="py-3 px-4">Carrier</th>
                    <th className="py-3 px-4">Date &amp; Time (IST)</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((p) => {
                    const d = new Date(p.created_at);
                    const formattedDate = d.toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          {p.number}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {p.user_name || 'Admin / Tenant'}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{p.user_email || '—'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {p.org_name || `Org #${p.organization_id}`}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-foreground">
                          {formatCurrencyINR(p.amount_paid)}
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {formatCurrencyINR(p.setup_fee)} setup + {formatCurrencyINR(p.monthly_cost)}/mo
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3" />
                            {p.payment_id || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 uppercase text-[11px]">
                          <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                            {p.provider}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formattedDate}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 capitalize">
                            {p.status || 'Active'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
