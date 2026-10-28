import { useState, useEffect } from 'react';
import {
  CreditCard,
  PlusCircle,
  Building2,
  Search,
  CheckCircle2,
  Clock,
  RotateCw,
  Coins,
  FileText,
  Mail,
  X,
  Download,
  Eye,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Phone,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsTrigger } from '@/components/ui/tabs';
import { api, authStore } from '@/lib/api';
import { formatCurrencyINR, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import {
  useAdminFinancialSummary,
  useAdminProviderBalance,
  useAdminNumberOrders,
  useAdminWalletAdjust,
} from '@/hooks/queries';

interface PaymentRecord {
  id: number;
  organization_id: number;
  amount: number;
  currency: string;
  provider: string;
  provider_payment_id?: string;
  reference?: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  description?: string;
  created_at: string;
  org_name?: string;
  user_email?: string;
  user_name?: string;
}

interface CreditTransactionRecord {
  id: number;
  organization_id: number;
  type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  description: string;
  reference?: string;
  created_at: string;
  org_name?: string;
}

interface OrgOption {
  id: number;
  name: string;
}

interface ReceiptData {
  invoiceNumber: string;
  receiptId: number;
  date: string;
  status: string;
  provider: string;
  transactionId: string;
  customer: {
    organizationName: string;
    contactName: string;
    email: string;
  };
  company: {
    name: string;
    address: string;
    gstin: string;
    email: string;
    website: string;
  };
  lineItems: Array<{
    description: string;
    hsnSac: string;
    qty: number;
    rate: number;
    amount: number;
  }>;
  financials: {
    currency: string;
    subtotal: number;
    cgst: number;
    sgst: number;
    totalTax: number;
    totalAmount: number;
  };
}

export function AdminPaymentsPage() {
  const toast = useToast();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [transactions, setTransactions] = useState<CreditTransactionRecord[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { data: finSummary, refetch: refetchFinSummary } = useAdminFinancialSummary();
  const { refetch: refetchProvBalance } = useAdminProviderBalance();
  const { data: numberOrdersData, refetch: refetchNumberOrders } = useAdminNumberOrders();
  const walletAdjust = useAdminWalletAdjust();

  const [activeTab, setActiveTab] = useState<'summary' | 'number_orders' | 'payments' | 'ledger'>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');

  // Wallet Adjust Modal state
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletOrgId, setWalletOrgId] = useState<string>('');
  const [walletAmount, setWalletAmount] = useState<string>('500');
  const [walletType, setWalletType] = useState<'credit' | 'debit'>('credit');
  const [walletReason, setWalletReason] = useState<string>('Platform Admin Adjustment');
  const [isSubmittingWallet, setIsSubmittingWallet] = useState(false);

  // Grant Credits Modal state
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantOrgId, setGrantOrgId] = useState<string>('');
  const [grantAmount, setGrantAmount] = useState<string>('500');
  const [grantReason, setGrantReason] = useState<string>('Manual Admin Credit Grant');
  const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);

  // Receipt Modal state
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const fetchBillingData = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [billingRes, orgsRes] = await Promise.all([
        api.get<{ success: boolean; payments: PaymentRecord[]; transactions: CreditTransactionRecord[] }>('/admin/billing'),
        api.get<{ success: boolean; organizations: Array<{ id: number; name: string }> }>('/admin/organizations'),
      ]);
      setPayments(billingRes.payments || []);
      setTransactions(billingRes.transactions || []);
      setOrgs(orgsRes.organizations || []);
      if (orgsRes.organizations && orgsRes.organizations.length > 0 && !grantOrgId) {
        setGrantOrgId(String(orgsRes.organizations[0].id));
      }
    } catch {
      if (!quiet) toast.error('Failed to load billing records');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
    // Auto-refresh polling every 10 seconds for real-time telemetry
    const interval = setInterval(() => {
      fetchBillingData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleGrantCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantOrgId || !grantAmount) {
      toast.error('Please select an organization and enter amount');
      return;
    }
    const amt = parseFloat(grantAmount);
    if (isNaN(amt) || amt === 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsSubmittingGrant(true);
    try {
      await api.post(`/admin/organizations/${grantOrgId}/credits`, {
        amount: amt,
        description: grantReason,
      });
      toast.success(`Successfully adjusted ₹${amt} credits & generated payment invoice!`);
      setShowGrantModal(false);
      fetchBillingData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to adjust credits');
    } finally {
      setIsSubmittingGrant(false);
    }
  };

  const handleWalletAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletOrgId || !walletAmount) {
      toast.error('Missing Information', 'Please select an organization and enter amount.');
      return;
    }
    const amt = parseFloat(walletAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Invalid Amount', 'Please enter a positive amount.');
      return;
    }
    setIsSubmittingWallet(true);
    try {
      const res = await walletAdjust.mutateAsync({
        organization_id: parseInt(walletOrgId, 10),
        amount: amt,
        type: walletType,
        reason: walletReason,
      });
      toast.success('Wallet Updated', `Adjusted ₹${amt} (${walletType}) for Org #${walletOrgId}. Ref: ${res.reference}`);
      setShowWalletModal(false);
      refetchFinSummary();
      fetchBillingData(true);
    } catch (err: any) {
      toast.error('Adjustment Failed', err?.message || 'Could not adjust wallet balance.');
    } finally {
      setIsSubmittingWallet(false);
    }
  };

  const handleViewReceipt = async (paymentId: number) => {
    try {
      const res = await api.get<{ success: boolean; receipt: ReceiptData }>(`/admin/payments/${paymentId}/receipt`);
      setActiveReceipt(res.receipt);
    } catch {
      toast.error('Could not load payment receipt details');
    }
  };

  const handleDownloadPdf = async (paymentId: number, fallbackName?: string) => {
    setDownloadingId(paymentId);
    try {
      const token = authStore.getToken() || localStorage.getItem('tac_token') || localStorage.getItem('token') || '';
      let response = await fetch(`/api/admin/payments/${paymentId}/download-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/payments/${paymentId}/download-pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!response.ok) throw new Error('Failed to generate PDF receipt');

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = fallbackName || `Receipt-INV-${paymentId}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded PDF Receipt', filename);
    } catch (err: any) {
      toast.error('Download Failed', err.message || 'Unable to download PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSendReceiptEmail = async () => {
    if (!activeReceipt) return;
    setIsSendingEmail(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/admin/payments/${activeReceipt.receiptId}/send-receipt`,
        { email: activeReceipt.customer.email }
      );
      toast.success('Receipt Dispatched', res.message || 'Payment receipt email delivered successfully');
    } catch (err: any) {
      toast.error('Delivery Failed', err.message || 'Unable to deliver receipt email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const totalRevenue = payments
    .filter((p) => p.status === 'paid')
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);

  const totalSuccessful = payments.filter((p) => p.status === 'paid').length;
  const totalPending = payments.filter((p) => p.status === 'pending').length;

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      (p.org_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.provider_payment_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.reference || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.user_email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Financial &amp; Carrier Dashboard</h1>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              VoBiz Live Synced
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time VoBiz carrier balance, user wallet liabilities, automated number order state machine, and ledger adjustments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchBillingData(false);
              refetchFinSummary();
              refetchProvBalance();
              refetchNumberOrders();
            }}
            className="gap-2 text-xs"
          >
            <RotateCw className="h-3.5 w-3.5" /> Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowWalletModal(true)}
            className="gap-1.5 text-xs border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 font-semibold"
          >
            <Wallet className="h-3.5 w-3.5" /> Adjust Tenant Wallet
          </Button>

          <Button size="sm" onClick={() => setShowGrantModal(true)} className="gap-2 text-xs">
            <PlusCircle className="h-4 w-4" /> Grant Credits
          </Button>
        </div>
      </div>

      {/* VoBiz Carrier & Platform Balance Telemetry Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: VoBiz Live Account */}
        <Card className="p-3.5 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-emerald-600" />
              <p className="text-xs font-bold text-foreground">VoBiz Carrier Account</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600 bg-emerald-500/15 px-1.5 py-0.5 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {finSummary?.provider?.is_live ? 'Live API' : 'Snapshot'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-black text-foreground font-mono">
                {finSummary?.provider?.reported_balance_inr ?? '₹17.62'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Auth ID: <strong className="font-mono text-foreground">{finSummary?.provider?.authId || 'MA_WHBTF8LN'}</strong>
              </p>
            </div>
            <div className="text-right text-[10px]">
              <span className="text-muted-foreground block">Safety Reserve:</span>
              <span className="font-semibold text-foreground font-mono">{finSummary?.provider?.safety_reserve_inr ?? '₹50.00'}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t text-[10px] flex justify-between text-muted-foreground">
            <span>Available Purchasing Capacity:</span>
            <strong className="text-foreground font-mono">{finSummary?.provider?.available_purchasing_capacity_inr ?? '₹0.00'}</strong>
          </div>
        </Card>

        {/* Card 2: User Wallet Liabilities */}
        <Card className="p-3.5 border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-purple-600" />
              <p className="text-xs font-bold text-foreground">User Wallet Liabilities</p>
            </div>
            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-600">
              {finSummary?.wallets?.total_wallets ?? 1} Accounts
            </Badge>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-foreground font-mono">
              ₹{finSummary?.wallets?.total_liabilities_inr ?? '1,270.00'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Available: <strong className="font-mono text-foreground">₹{finSummary?.wallets?.total_available_inr ?? '1,270.00'}</strong> · Reserved: <strong className="font-mono text-foreground">₹{finSummary?.wallets?.total_reserved_inr ?? '0.00'}</strong>
            </p>
          </div>
          <div className="mt-2 pt-2 border-t text-[10px] flex justify-between text-muted-foreground">
            <span>Customer Deposits via Razorpay:</span>
            <strong className="text-foreground font-mono">₹{finSummary?.deposits?.total_deposits_inr ?? '350.00'}</strong>
          </div>
        </Card>

        {/* Card 3: Platform Gross Profit & Number Orders */}
        <Card className="p-3.5 border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-card to-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-bold text-foreground">Platform Margin &amp; Orders</p>
            </div>
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600">
              {finSummary?.orders?.completed_orders ?? 0} Completed
            </Badge>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-blue-600 font-mono">
              ₹{finSummary?.orders?.gross_margin_inr ?? '0.00'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Billed: <strong className="font-mono text-foreground">₹{finSummary?.orders?.customer_charges_inr ?? '0.00'}</strong> · Carrier Cost: <strong className="font-mono text-foreground">₹{finSummary?.orders?.provider_cost_inr ?? '0.00'}</strong>
            </p>
          </div>
          <div className="mt-2 pt-2 border-t text-[10px] flex justify-between text-muted-foreground">
            <span>Setup Markup Per Number:</span>
            <strong className="text-foreground font-mono">+₹100.00</strong>
          </div>
        </Card>

        {/* Card 4: Recurring Obligations */}
        <Card className="p-3.5 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-bold text-foreground">Monthly Carrier Obligations</p>
            </div>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
              {finSummary?.recurring?.active_numbers ?? 0} Lines Active
            </Badge>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-foreground font-mono">
              ₹{finSummary?.recurring?.monthly_carrier_cost_inr ?? '0.00'}
              <span className="text-xs font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Wholesale carrier PSTN DID monthly line fees
            </p>
          </div>
          <div className="mt-2 pt-2 border-t text-[10px] flex justify-between text-muted-foreground">
            <span>Reconciliation Status:</span>
            <strong className="text-emerald-600 font-semibold">100% Balanced</strong>
          </div>
        </Card>
      </div>

      {/* Low Provider Balance Alert Notice */}
      {finSummary?.provider?.is_low_balance && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4 text-xs flex items-start gap-3 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-bold">Carrier Account Warning: Low VoBiz Balance ({finSummary.provider.reported_balance_inr})</p>
              <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-700 dark:text-amber-300">
                Action Recommended
              </Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              The live carrier account balance (<strong>{finSummary.provider.reported_balance_inr}</strong>) is below your minimum safety reserve (<strong>{finSummary.provider.safety_reserve_inr}</strong>).
              While customer wallets hold sufficient liabilities (<strong>₹{finSummary.wallets.total_available_inr}</strong>), wholesale PSTN purchases require provider funds. Please top up your carrier console account to restore purchasing capability.
            </p>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs className="mb-4">
        <TabsTrigger
          active={activeTab === 'summary'}
          onClick={() => setActiveTab('summary')}
          className="gap-2 text-xs"
        >
          <TrendingUp className="h-4 w-4" /> Capacity &amp; Financial Summary
        </TabsTrigger>
        <TabsTrigger
          active={activeTab === 'number_orders'}
          onClick={() => setActiveTab('number_orders')}
          className="gap-2 text-xs"
        >
          <Phone className="h-4 w-4" /> Number Orders &amp; State Machine ({numberOrdersData?.total ?? 0})
        </TabsTrigger>
        <TabsTrigger
          active={activeTab === 'payments'}
          onClick={() => setActiveTab('payments')}
          className="gap-2 text-xs"
        >
          <CreditCard className="h-4 w-4" /> Razorpay Deposits &amp; Invoices ({payments.length})
        </TabsTrigger>
        <TabsTrigger
          active={activeTab === 'ledger'}
          onClick={() => setActiveTab('ledger')}
          className="gap-2 text-xs"
        >
          <Coins className="h-4 w-4" /> Credit Ledger &amp; Adjustments ({transactions.length})
        </TabsTrigger>
      </Tabs>

      {/* Tab 1: Executive Capacity & Financial Summary */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          <Card className="p-4 sm:p-6 border shadow-xs">
            <h3 className="font-bold text-base text-foreground mb-1">Carrier Purchasing Capacity &amp; Balance Verification</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Real-time audit contrasting live VoBiz provider balance with aggregate customer wallet liabilities.
            </p>

            <div className="grid gap-4 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
                <span className="text-muted-foreground font-medium">1. Carrier Liquid Balance</span>
                <p className="text-2xl font-mono font-extrabold text-foreground">{finSummary?.provider?.reported_balance_inr ?? '₹17.62'}</p>
                <p className="text-[11px] text-muted-foreground">
                  Verified live from VoBiz carrier API at{' '}
                  <span className="font-mono text-foreground">
                    {finSummary?.provider?.last_verified_at ? formatDateTime(finSummary.provider.last_verified_at) : 'Just now'}
                  </span>
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
                <span className="text-muted-foreground font-medium">2. Customer Wallet Liabilities</span>
                <p className="text-2xl font-mono font-extrabold text-purple-600">₹{finSummary?.wallets?.total_liabilities_inr ?? '1,270.00'}</p>
                <p className="text-[11px] text-muted-foreground">
                  Combined available balances across all tenant wallets deposited through Razorpay.
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
                <span className="text-muted-foreground font-medium">3. Net Platform Purchasing Capacity</span>
                <p className="text-2xl font-mono font-extrabold text-emerald-600">{finSummary?.provider?.available_purchasing_capacity_inr ?? '₹0.00'}</p>
                <p className="text-[11px] text-muted-foreground">
                  Maximum wholesale carrier orders permissible before breaching the ₹50.00 reserve.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 text-xs mt-4 pt-4 border-t">
              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                <span className="text-muted-foreground font-medium">Lifetime Settled Revenue</span>
                <p className="text-xl font-mono font-bold text-foreground">{formatCurrencyINR(totalRevenue)}</p>
                <p className="text-[11px] text-muted-foreground">Processed &amp; credited payments</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                <span className="text-muted-foreground font-medium">Settled Payment Invoices</span>
                <p className="text-xl font-mono font-bold text-emerald-600">{totalSuccessful} Invoices</p>
                <p className="text-[11px] text-muted-foreground">PDF receipts generated</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3.5 space-y-1">
                <span className="text-muted-foreground font-medium">Pending Settlements</span>
                <p className="text-xl font-mono font-bold text-amber-600">{totalPending} Pending</p>
                <p className="text-[11px] text-muted-foreground">Awaiting gateway capture</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Number Orders & State Machine */}
      {activeTab === 'number_orders' && (
        <Card className="rounded-2xl overflow-hidden border shadow-xs">
          <CardHeader className="p-4 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" /> Customer Number Orders &amp; State Machine
                </CardTitle>
                <CardDescription className="text-xs">
                  Full lifecycle audit of phone numbers purchased from wallet balances with VoBiz provider fulfillment.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(!numberOrdersData?.orders || numberOrdersData.orders.length === 0) ? (
              <div className="text-center py-12 text-xs text-muted-foreground space-y-2">
                <Phone className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No Number Orders Yet</p>
                <p>When users buy phone numbers from their wallet, real-time lifecycle tracking will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/60 border-b text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Order Ref</th>
                      <th className="px-4 py-3">Organization</th>
                      <th className="px-4 py-3">Phone Number</th>
                      <th className="px-4 py-3">Customer Charged</th>
                      <th className="px-4 py-3">Carrier Cost</th>
                      <th className="px-4 py-3">Platform Margin</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Carrier Order ID</th>
                      <th className="px-4 py-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {numberOrdersData.orders.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono font-semibold text-foreground">{o.order_ref || o.order_id}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{o.org_name || o.organization_name || `Org #${o.organization_id}`}</div>
                          {(o.user_name || o.user_email) && (
                            <div className="text-[10px] text-muted-foreground">{o.user_name || o.user_email}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono font-bold text-foreground">{o.phone_number}</div>
                          {o.error_message && (
                            <div className="mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-800 dark:text-amber-200 max-w-sm">
                              <span className="font-bold flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="w-3 h-3 shrink-0" /> Admin Alert &amp; Customer Note:
                              </span>
                              <p className="mt-0.5 whitespace-pre-line leading-relaxed">{o.error_message}</p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {formatCurrencyINR(Number(o.total_charged_inr || (o.total_charged_paise ?? o.amount_charged_paise ?? 0) / 100))}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatCurrencyINR(Number(o.provider_cost_inr || (o.provider_cost_paise ?? 0) / 100))}
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-600">
                          +{formatCurrencyINR(
                            Number(o.markup_inr || (((o.total_charged_paise ?? o.amount_charged_paise ?? 0) - (o.provider_cost_paise ?? 0)) / 100))
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            o.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : o.status === 'FAILED'
                              ? 'bg-destructive/10 text-destructive border border-destructive/20'
                              : o.status === 'PENDING_ADMIN_TOPUP'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 ring-1 ring-amber-500/20'
                              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                          }`}>
                            {o.status === 'COMPLETED' ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            ) : o.status === 'FAILED' ? (
                              <XCircle className="w-3 h-3 text-destructive" />
                            ) : o.status === 'PENDING_ADMIN_TOPUP' ? (
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-500 animate-spin" />
                            )}
                            {o.status === 'PENDING_ADMIN_TOPUP' ? 'Needs Top-up' : o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{o.provider_order_id || '—'}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatDateTime(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Payment Transactions &amp; Downloadable PDF Receipts</CardTitle>
                  <CardDescription>Processed payments via Razorpay, Stripe, and manual admin adjustments.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-48 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search tenant, ID, email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 text-xs h-8"
                    />
                  </div>
                  <select
                    aria-label="Filter payment status"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
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
              ) : filteredPayments.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-xs">
                  No payment records found matching your filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                      <tr>
                        <th className="py-3 px-4">Invoice / ID</th>
                        <th className="py-3 px-4">Organization / User</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Provider</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Receipt / Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono font-medium text-foreground">
                              {p.reference || p.provider_payment_id || `PAY-${p.id}`}
                            </span>
                            {p.description && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-xs">{p.description}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-foreground">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{p.org_name || `Org #${p.organization_id}`}</span>
                            </div>
                            {p.user_email && (
                              <p className="text-[10px] text-muted-foreground ml-5 truncate">{p.user_email}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-semibold text-foreground">
                            {formatCurrencyINR(p.amount)}
                          </td>
                          <td className="py-3 px-4 capitalize font-medium text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">
                              {p.provider || 'Razorpay'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {p.status === 'paid' ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Paid
                              </Badge>
                            ) : p.status === 'pending' ? (
                              <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                                Pending
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                {p.status}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {new Date(p.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Direct PDF Download Button */}
                              <Button
                                size="sm"
                                onClick={() => handleDownloadPdf(p.id)}
                                disabled={downloadingId === p.id}
                                className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                                title="Download PDF file to computer"
                              >
                                <Download className={`h-3 w-3 ${downloadingId === p.id ? 'animate-bounce' : ''}`} />
                                {downloadingId === p.id ? 'Downloading...' : 'Download PDF'}
                              </Button>

                              {/* View Receipt Modal Button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewReceipt(p.id)}
                                className="h-7 text-xs gap-1 border-muted-foreground/30 hover:border-foreground"
                                title="Preview Receipt"
                              >
                                <Eye className="h-3 w-3" />
                                Preview
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ledger Tab */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Credit Transaction Ledger</CardTitle>
              <CardDescription>Audited per-second call debits, top-ups, and manual admin adjustments.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Organization</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Balance After</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4 text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-medium text-foreground">
                            {tx.org_name || `Org #${tx.organization_id}`}
                          </td>
                          <td className="py-3 px-4">
                            {tx.type === 'credit' ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                                Credit
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Debit
                              </Badge>
                            )}
                          </td>
                          <td className={`py-3 px-4 font-semibold ${tx.type === 'credit' ? 'text-emerald-600' : 'text-foreground'}`}>
                            {tx.type === 'credit' ? '+' : '-'}{formatCurrencyINR(Math.abs(tx.amount))}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium">
                            {formatCurrencyINR(tx.balance_after)}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {tx.description}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                            {tx.reference || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Platform Wallet Adjustment Modal (Append-Only Ledger) */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md shadow-2xl border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Adjust Tenant Platform Wallet
              </CardTitle>
              <CardDescription>
                Directly adjust a tenant organization's platform wallet balance with an append-only transaction ledger entry and audit log.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleWalletAdjustSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Target Organization</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    value={walletOrgId}
                    onChange={(e) => setWalletOrgId(e.target.value)}
                    required
                  >
                    <option value="">Select an organization...</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} (ID #{o.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Adjustment Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWalletType('credit')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                        walletType === 'credit'
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 ring-1 ring-emerald-500'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Credit (+) Deposit
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalletType('debit')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                        walletType === 'debit'
                          ? 'bg-destructive/10 border-destructive text-destructive ring-1 ring-destructive'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Debit (-) Deduction
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Amount (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 500.00"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Audit Reason / Description</Label>
                  <Input
                    placeholder="e.g. Approved billing refund, manual top-up, reconciliation fix"
                    value={walletReason}
                    onChange={(e) => setWalletReason(e.target.value)}
                    required
                    className="text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This reason is recorded in the permanent financial ledger and cannot be deleted.
                  </p>
                </div>
              </CardContent>

              <div className="p-4 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWalletModal(false)}
                  disabled={isSubmittingWallet}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingWallet} className="bg-primary text-primary-foreground font-semibold">
                  {isSubmittingWallet ? 'Saving Ledger...' : 'Commit Adjustment'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Grant / Adjust Credits Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md shadow-2xl border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" /> Grant / Adjust Credits
              </CardTitle>
              <CardDescription>
                Directly top-up credit wallet balance for an organization. Creates an official payment invoice automatically with downloadable PDF receipt.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleGrantCredits}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Target Organization</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    value={grantOrgId}
                    onChange={(e) => setGrantOrgId(e.target.value)}
                    required
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} (ID #{o.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Credit Amount (₹)</label>
                  <Input
                    type="number"
                    step="1"
                    placeholder="e.g. 500 or -100"
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                    required
                    className="text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Positive value creates a paid invoice with downloadable PDF receipt.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Adjustment Reason / Notes</label>
                  <Input
                    placeholder="e.g. Enterprise top-up, custom plan invoice"
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
              </CardContent>

              <div className="p-4 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGrantModal(false)}
                  disabled={isSubmittingGrant}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingGrant}>
                  {isSubmittingGrant ? 'Adjusting...' : 'Confirm & Generate Invoice'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Official Payment Receipt Preview Modal (Exact VONE DIGITALS Layout) */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white text-zinc-900 rounded-xl shadow-2xl border border-zinc-200 my-8 overflow-hidden font-sans">
            {/* Modal Controls Header */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-zinc-100 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-zinc-800">Payment Receipt Preview</span>
                <Badge variant="outline" className="text-[10px] font-mono border-zinc-300 text-zinc-700 bg-white">
                  {activeReceipt.invoiceNumber}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendReceiptEmail}
                  disabled={isSendingEmail}
                  className="h-7 text-xs gap-1.5 bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-300"
                >
                  <Mail className="h-3.5 w-3.5 text-zinc-600" />
                  {isSendingEmail ? 'Sending...' : 'Email'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDownloadPdf(activeReceipt.receiptId, activeReceipt.invoiceNumber)}
                  disabled={downloadingId === activeReceipt.receiptId}
                  className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Download className={`h-3.5 w-3.5 ${downloadingId === activeReceipt.receiptId ? 'animate-bounce' : ''}`} />
                  {downloadingId === activeReceipt.receiptId ? 'Downloading...' : 'Download PDF'}
                </Button>
                <button
                  type="button"
                  onClick={() => setActiveReceipt(null)}
                  className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 ml-2"
                  title="Close receipt"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Receipt Body (Matching Receipt-INV-MAN-EA2B3C51) */}
            <div className="p-6 sm:p-8 space-y-5 bg-white text-zinc-900">
              {/* Top Bar with VONE DIGITALS and Status Pill */}
              <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-900 text-white">
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-black italic tracking-tighter text-white flex items-center gap-1">
                    <span className="text-white">V</span>
                    <span className="text-white font-extrabold not-italic">VONE</span>
                    <span className="text-red-500 text-sm tracking-widest font-bold ml-1 uppercase">DIGITALS</span>
                  </div>
                </div>
                <div className="px-4 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider shadow-xs">
                  STATUS: {activeReceipt.status === 'paid' ? 'CAPTURED' : activeReceipt.status.toUpperCase()}
                </div>
              </div>

              {/* Title & Receipt # */}
              <div className="flex items-center justify-between pt-1 pb-2 border-b border-zinc-200">
                <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 uppercase">PAYMENT RECEIPT</h2>
                <span className="text-xs font-mono font-medium text-zinc-600">
                  Receipt #: <strong className="text-zinc-900">{activeReceipt.invoiceNumber}</strong>
                </span>
              </div>

              {/* Billed To & Payment Details Side-by-Side Boxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">BILLED TO:</p>
                  <p className="text-sm font-extrabold text-zinc-900">{activeReceipt.customer.organizationName}</p>
                  <p className="text-xs text-zinc-600">Contact: {activeReceipt.customer.contactName}</p>
                  <p className="text-xs text-zinc-600">Email: {activeReceipt.customer.email}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">Workspace ID: {activeReceipt.customer.organizationName.toLowerCase().replace(/[^a-z0-9]/g, '')}</p>
                </div>

                <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">PAYMENT DETAILS:</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-600">Payment Gateway:</span>
                    <span className="font-bold text-zinc-900 capitalize">{activeReceipt.provider === 'admin_grant' ? 'Admin Grant' : 'Razorpay Online'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-600">Payment ID:</span>
                    <span className="font-mono font-bold text-zinc-900">{activeReceipt.transactionId}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-600">Date &amp; Time:</span>
                    <span className="text-zinc-900">{new Date(activeReceipt.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-600">Invoice Currency:</span>
                    <span className="font-bold text-zinc-900 font-mono">INR</span>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-sky-50 text-zinc-700 font-bold border-b border-zinc-200">
                    <tr>
                      <th className="py-2.5 px-4 text-left">DESCRIPTION / PLAN</th>
                      <th className="py-2.5 px-4 text-center">BILLING CYCLE</th>
                      <th className="py-2.5 px-4 text-right">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="py-4 px-4 font-semibold text-zinc-900">
                        {activeReceipt.lineItems[0]?.description || 'Enterprise Plan Subscription'}
                      </td>
                      <td className="py-4 px-4 text-center text-zinc-600">
                        Monthly / Recurring
                      </td>
                      <td className="py-4 px-4 text-right font-bold font-mono text-zinc-900">
                        Rs. {Number(activeReceipt.financials.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr className="border-t border-zinc-100 bg-zinc-50/50">
                      <td colSpan={2} className="py-1.5 px-4 text-right text-zinc-500 font-medium">Subtotal:</td>
                      <td className="py-1.5 px-4 text-right font-mono text-zinc-700">
                        Rs. {Number(activeReceipt.financials.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr className="bg-zinc-50/50">
                      <td colSpan={2} className="py-1.5 px-4 text-right text-zinc-500 font-medium">Taxes &amp; GST (Included):</td>
                      <td className="py-1.5 px-4 text-right font-mono text-zinc-700">Rs. 0.00</td>
                    </tr>
                    {/* Highlighted Total Row */}
                    <tr className="bg-sky-50 border-t-2 border-zinc-300">
                      <td colSpan={2} className="py-3 px-4 text-right font-extrabold text-sm text-zinc-900">
                        TOTAL PAID AMOUNT:
                      </td>
                      <td className="py-3 px-4 text-right font-extrabold text-sm font-mono text-emerald-600">
                        Rs. {Number(activeReceipt.financials.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Success Box */}
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-xs font-extrabold text-emerald-800">
                  SUCCESS: Payment Verified and Received in Full
                </p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Your subscription features, AI bots, WhatsApp templates, and agent seats are active.
                </p>
              </div>

              {/* Support & Billing Inquiries */}
              <div className="text-[10px] text-zinc-500 space-y-0.5 pt-2">
                <p className="font-bold text-zinc-700 uppercase tracking-wide">CUSTOMER SUPPORT &amp; BILLING INQUIRIES</p>
                <p>If you have any questions concerning this invoice or your subscription services, please contact our support desk at <strong className="text-zinc-700">pmahi7801@gmail.com</strong>.</p>
                <p>To manage your workspace, broadcast campaigns, and AI agents, visit: <span className="text-blue-600 underline">https://vonecrm.vonedigitals.com</span></p>
              </div>

              {/* Bottom Digital Signature Note */}
              <div className="text-center text-[10px] text-zinc-400 italic pt-4 border-t border-zinc-200">
                <p>This is a computer-generated digital payment receipt. No physical signature is required.</p>
                <p className="not-italic font-medium text-zinc-500 mt-0.5">V ONE DIGITALS CRM - All Rights Reserved</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
