import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  ShoppingCart,
  Phone,
  CheckCircle2,
  X,
  Sparkles,
  Check,
  CreditCard,
  AlertCircle,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Plus,
  MessageSquare,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import {
  useVoBizInventory,
  useBuyVoBizNumber,
  useWallet,
  usePurchaseNumberWithWallet,
  type VoBizInventoryItem,
} from '@/hooks/queries';
import { formatCurrencyINR } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { DepositFundsModal } from '@/components/wallet/deposit-modal';

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

const TABS = [
  { key: 'local', label: 'Local' },
  { key: 'national', label: 'National' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'tollfree', label: 'Toll-free' },
  { key: 'shared', label: 'Shared Cost' },
];

const REGIONS = [
  'Any',
  'Gujarat',
  'Karnataka',
  '92 Series',
  'Delhi NCR',
  'Maharashtra',
  'Telangana',
  'Tamil Nadu',
  'Andhra Pradesh',
  'West Bengal',
];

// The carrier emits no prefix/area field, so the label is built from the two it
// does emit. Every read goes through optional chaining with an em dash fallback:
// a missing field must never throw inside render and take the whole modal down.
const areaLabel = (item: VoBizInventoryItem) => item?.region || item?.series || '—';
const featureLabels = (item: VoBizInventoryItem) => item?.features || '—';

// The carrier sends null when a fee does not apply. That is "unknown", not zero,
// so an unknown price is rendered as an em dash and blocks checkout rather than
// quoting the tenant an amount nobody agreed to.
const hasFees = (
  item: VoBizInventoryItem
): item is VoBizInventoryItem & { monthly_fee: number; setup_fee: number } =>
  typeof item?.monthly_fee === 'number' && typeof item?.setup_fee === 'number';
const totalFor = (item: VoBizInventoryItem) => (hasFees(item) ? item.monthly_fee + item.setup_fee : null);
const feeLabel = (value: number | null | undefined) => (typeof value === 'number' ? formatCurrencyINR(value) : '—');

export function NumbersInventoryModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('local');
  const [selectedRegion, setSelectedRegion] = useState('Any');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [confirmingItem, setConfirmingItem] = useState<VoBizInventoryItem | null>(null);
  const [userMessage, setUserMessage] = useState('');

  // Pagination state (default 20 numbers per page as requested by user)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search query so carrier API is queried cleanly without hitting rate limits
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset to first page whenever filters or search terms change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedRegion, debouncedSearch]);

  // Scroll table container back to top when switching pages
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  // Razorpay is the only integrated gateway, so it is the only checkout path.
  // The Stripe and wallet buttons minted a local transaction id and bought with
  // no order, no gateway payment id and no signature - the server skipped
  // verification for exactly those requests and provisioned a real carrier
  // number for free.
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Custom manual number entry state
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualNumber, setManualNumber] = useState('');

  const buyMutation = useBuyVoBizNumber();
  const { data: walletData, refetch: refetchWallet } = useWallet();
  const purchaseWithWallet = usePurchaseNumberWithWallet();
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositInitialAmount, setDepositInitialAmount] = useState(500);
  const [purchaseStep, setPurchaseStep] = useState<string | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<'wallet' | 'razorpay'>('wallet');

  const availableBalanceINR = walletData?.wallet?.available_inr ? parseFloat(walletData.wallet.available_inr) : 0;

  const handleWalletPurchase = async (item: VoBizInventoryItem) => {
    try {
      setPurchaseStep('1/3: Verifying account & reserving funds...');
      await new Promise((r) => setTimeout(r, 300));
      setPurchaseStep('2/3: Activating your phone number...');
      const res = await purchaseWithWallet.mutateAsync({
        e164: item.e164,
        user_message: userMessage.trim() || undefined,
      });
      setPurchaseStep('3/3: Number activated & ready to use!');
      await new Promise((r) => setTimeout(r, 300));
      toast.success(
        'Phone Number Activated!',
        `${item.e164} is now live on your account. Remaining wallet balance: ₹${res.balanceAfterInr}`
      );
      setConfirmingItem(null);
      setUserMessage('');
      refetchWallet();
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wallet purchase failed';
      toast.error('Purchase Notice', msg);
    } finally {
      setPurchaseStep(null);
    }
  };

  // Query live number inventory with page & limit
  const { data, isLoading, isFetching, refetch, error } = useVoBizInventory(
    {
      country: 'IN',
      region: selectedRegion === 'Any' ? '' : selectedRegion,
      type: activeTab,
      q: debouncedSearch,
      page: currentPage,
      limit: pageSize,
    },
    open
  );

  const numbers = data?.numbers ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const canPurchase = data?.can_purchase !== false;

  // Generate page numbers with ellipsis (e.g. 1, 2, 3, 4, '...', 306)
  const paginationPages = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, '...', totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  // The carrier API already performs the real-time search & region filtering directly on the carrier database
  const filteredNumbers = useMemo(() => {
    return numbers;
  }, [numbers]);

  const handleBuy = async (item: VoBizInventoryItem) => {
    if (!canPurchase) {
      toast.error(
        'Carrier Activation Paused',
        'Carrier number provisioning is temporarily paused for routine gateway reconciliation. Please try again shortly.'
      );
      return;
    }

    setIsProcessingPayment(true);
    try {
      if (!hasFees(item)) {
        throw new Error('The carrier did not return a price for this number, so it cannot be purchased right now.');
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error('Razorpay payment gateway failed to load. Please check your internet connection.');
      }

      // 1. Create order on Admin Razorpay Gateway
      const orderRes = await api.post<{
        success: boolean;
        order: { orderId: string; keyId: string; amount: number; currency: string };
      }>('/phone-numbers/create-order', {
        e164: item.e164,
        monthly_fee: item.monthly_fee,
        setup_fee: item.setup_fee,
        user_message: userMessage.trim() || undefined,
      });

      const order = orderRes.order;

      // 2. Open Admin Razorpay Checkout Modal
      await new Promise<void>((resolve, reject) => {
        const options = {
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency || 'INR',
          name: 'Telugu AI Calling Platform',
          description: `Activation fee for ${item.e164}`,
          order_id: order.orderId,
          prefill: {
            name: user?.name || '',
            email: user?.email || '',
            contact: user?.phone || '',
          },
          theme: {
            color: '#7c3aed',
          },
          modal: {
            ondismiss: () => {
              reject(new Error('Payment cancelled'));
            },
          },
          handler: async function (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) {
            try {
              // 3. Complete carrier activation & signature verification. The
              //    server recomputes this signature and provisions only if it
              //    matches, so the triple below is the only thing standing
              //    between the tenant and a free number.
              await buyMutation.mutateAsync({
                e164: item.e164,
                monthly_fee: item.monthly_fee,
                setup_fee: item.setup_fee,
                // The carrier's own number class, already normalised onto the
                // tab vocabulary. Guessing from a prefix string crashed here.
                type: item.type || activeTab,
                country: item.country || 'IN',
                region: item.region || null,
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                payment_method: 'razorpay',
              });

              toast.success('Payment Received & Number Activated!', `${item.e164} is now provisioned and active on your account.`);
              setConfirmingItem(null);
              if (onSuccess) onSuccess();
              onOpenChange(false);
              resolve();
            } catch (err: unknown) {
              reject(err);
            }
          },
        };

        const rzp = new (window as unknown as { Razorpay: new (opts: unknown) => { open: () => void } }).Razorpay(options);
        rzp.open();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Purchase failed';
      if (msg !== 'Payment cancelled') {
        toast.error('Payment / Provisioning Failed', msg);
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleManualBuy = async () => {
    if (!manualNumber.trim()) {
      toast.error('Please enter a phone number');
      return;
    }
    if (!canPurchase) {
      toast.error(
        'Carrier Activation Paused',
        'Carrier number provisioning is temporarily paused for routine gateway reconciliation. Please try again shortly.'
      );
      return;
    }

    setIsProcessingPayment(true);
    try {
      const cleanNum = manualNumber.trim();
      const formattedNum = cleanNum.startsWith('+') ? cleanNum : `+91${cleanNum}`;

      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error('Razorpay SDK failed to load');
      }

      const orderRes = await api.post<{
        success: boolean;
        order: { orderId: string; keyId: string; amount: number; currency: string };
      }>('/phone-numbers/create-order', {
        e164: formattedNum,
        monthly_fee: 500,
        setup_fee: 100,
      });

      const order = orderRes.order;

      await new Promise<void>((resolve, reject) => {
        const options = {
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency || 'INR',
          name: 'Telugu AI Calling Platform',
          description: `Activation fee for ${formattedNum}`,
          order_id: order.orderId,
          prefill: {
            name: user?.name || '',
            email: user?.email || '',
            contact: user?.phone || '',
          },
          theme: {
            color: '#7c3aed',
          },
          modal: {
            ondismiss: () => {
              reject(new Error('Payment cancelled'));
            },
          },
          handler: async function (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) {
            try {
              await buyMutation.mutateAsync({
                e164: formattedNum,
                monthly_fee: 500,
                setup_fee: 100,
                type: 'local',
                country: 'IN',
                region: null,
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                payment_method: 'razorpay',
              });
              toast.success('Payment Received & Number Activated', `${formattedNum} added to your account.`);
              setShowManualAdd(false);
              setManualNumber('');
              if (onSuccess) onSuccess();
              onOpenChange(false);
              resolve();
            } catch (err: unknown) {
              reject(err);
            }
          },
        };

        const rzp = new (window as unknown as { Razorpay: new (opts: unknown) => { open: () => void } }).Razorpay(options);
        rzp.open();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add number';
      if (msg !== 'Payment cancelled') {
        toast.error('Action Failed', msg);
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-5xl w-full max-h-[94vh] flex flex-col p-0 overflow-hidden shadow-2xl border rounded-2xl">
      {/* Header with Live Carrier API Verification */}
      <div className="border-b bg-card px-3.5 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base sm:text-xl text-foreground truncate">Numbers Inventory</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Carrier API Key
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {isLoading || isFetching
                ? 'Connecting to carrier API key & streaming live inventory...'
                : data?.total !== undefined
                ? `Browse ${data.total.toLocaleString()} real-time carrier numbers • Filtered live via API key`
                : 'Browse live carrier numbers fetched directly via API key'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Country indicator */}
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2 sm:px-3 py-1 text-xs font-medium shrink-0">
            <span className="text-sm sm:text-base">🇮🇳</span>
            <span className="text-muted-foreground hidden sm:inline">Country:</span>
            <span className="font-semibold text-foreground">India (IN)</span>
          </div>

          {/* Platform Wallet Balance Pill */}
          <div className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 sm:px-3 py-1 text-xs font-medium shrink-0">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground hidden sm:inline">Wallet:</span>
            <span className="font-bold font-mono text-foreground">₹{availableBalanceINR.toFixed(2)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDepositInitialAmount(500);
                setDepositModalOpen(true);
              }}
              className="h-5 px-1.5 text-[10px] text-primary hover:bg-primary/10 ml-0.5"
            >
              + Add
            </Button>
          </div>

          {/* Search bar with real-time API indicator */}
          <div className="relative flex-1 sm:w-64 min-w-[130px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search numbers..."
              className="h-8 sm:h-9 pl-8 pr-7 text-xs"
            />
            {isFetching && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <RotateCw className="w-3 h-3 text-primary animate-spin" />
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManualAdd(!showManualAdd)}
            className="h-8 text-xs shrink-0 px-2.5"
          >
            {showManualAdd ? 'Browse' : '+ Custom'}
          </Button>
        </div>
      </div>

      {/* Carrier API Error Banner */}
      {error && (
        <div className="mx-3.5 sm:mx-6 mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Telephony Carrier API Key Notice</p>
            <p className="text-[11px] opacity-90">{(error as Error).message || 'Failed to query live carrier numbers. Please try again shortly.'}</p>
          </div>
        </div>
      )}

      {/* Manual number entry accordion/bar */}
      {showManualAdd && (
        <div className="border-b bg-primary/5 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Label className="text-xs font-semibold shrink-0">Custom Number *</Label>
            <Input
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
              placeholder="+91XXXXXXXXXX"
              className="h-8 font-mono text-xs max-w-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowManualAdd(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleManualBuy} loading={buyMutation.isPending} className="h-8 text-xs">
              Add Number
            </Button>
          </div>
        </div>
      )}

      {/* Tabs & Filters */}
      <div className="border-b bg-muted/20 px-3.5 sm:px-6 py-2 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin py-0.5 max-w-full">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isLoading || isFetching ? '...' : (data?.total !== undefined ? data.total.toLocaleString() : '0')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Region & Feature Selectors */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium text-[11px] sm:text-xs">Region:</span>
          <Select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="h-7 sm:h-8 text-xs w-28 sm:w-32"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>

          <span className="text-muted-foreground font-medium text-[11px] sm:text-xs">Features:</span>
          <div className="rounded-md border bg-background px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-foreground">
            From carrier
          </div>
        </div>
      </div>

      {/* Table Container matching VoBiz console screenshot with Mobile Card View & Desktop Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-6 scrollbar-thin">
        {isLoading ? (
          <div className="space-y-3 py-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 w-full rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filteredNumbers.length === 0 ? (
          <div className="py-12 sm:py-16 text-center">
            <p className="font-semibold text-foreground">No numbers found matching your criteria</p>
            <p className="text-xs text-muted-foreground mt-1">Try changing the region or search term.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedRegion('Any');
                setSearchInput('');
                refetch();
              }}
              className="mt-4 text-xs"
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile Cards View (sm:hidden) */}
            <div className="space-y-3 sm:hidden">
              {filteredNumbers.map((item) => {
                const isPending = buyMutation.isPending && buyMutation.variables?.e164 === item.e164;
                return (
                  <div key={item.id} className="rounded-xl border bg-card p-3 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border shrink-0">
                          IN
                        </span>
                        <span className="font-bold text-xs text-foreground truncate">
                  {areaLabel(item)}
                </span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Check className="w-2.5 h-2.5" /> {featureLabels(item)}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between border-y border-border/40 py-2">
                      <div>
                        <p className="font-mono text-sm font-bold text-foreground">{item.e164}</p>
                        <p className="text-[10px] text-muted-foreground">{item.series || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-xs text-foreground">{feeLabel(item.monthly_fee)}/mo</p>
                        <p className="text-[9px] text-muted-foreground">+{feeLabel(item.setup_fee)} setup</p>
                      </div>
                    </div>

                    <div>
                      {item.is_owned ? (
                        <div className="w-full py-1.5 text-center text-xs font-semibold text-emerald-600 bg-emerald-500/10 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Owned
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setConfirmingItem(item)}
                          disabled={isPending || !hasFees(item)}
                          loading={isPending}
                          className="w-full h-8 gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-xs"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" /> Buy Number ({feeLabel(totalFor(item))})
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (hidden sm:block) */}
            <div className="hidden sm:block rounded-xl border overflow-x-auto bg-card">
              <table className="w-full text-xs text-left min-w-[620px]">
                <thead className="bg-muted/60 border-b text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Area / Series</th>
                    <th className="px-4 py-3">E.164</th>
                    <th className="px-4 py-3">Supported Features</th>
                    <th className="px-4 py-3">Monthly + Setup</th>
                    <th className="px-4 py-3 text-right">Cart</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredNumbers.map((item) => {
                    const isPending = buyMutation.isPending && buyMutation.variables?.e164 === item.e164;
                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        {/* Area / Series - the carrier sends a region and a
                            series, never a prefix string. */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                              {item.country || 'IN'}
                            </span>
                            <div>
                              <p className="font-bold text-foreground">
                                {item.region || item.series || '—'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{item.series || '—'}</p>
                            </div>
                          </div>
                        </td>

                        {/* E.164 Phone Number */}
                        <td className="px-4 py-3.5 font-mono text-sm font-semibold text-foreground">
                          {item.e164}
                        </td>

                        {/* Supported Features - only what the carrier reports */}
                        <td className="px-4 py-3.5">
                          {item.features ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <Check className="w-3 h-3" /> {item.features}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Monthly + Setup */}
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-foreground">
                            {feeLabel(item.monthly_fee)}/mo
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            +{feeLabel(item.setup_fee)} setup
                          </p>
                        </td>

                        {/* Cart / Action Button */}
                        <td className="px-4 py-3.5 text-right">
                          {item.is_owned ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Owned
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setConfirmingItem(item)}
                              disabled={isPending || !hasFees(item)}
                              loading={isPending}
                              className="h-8 gap-1.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-xs"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" /> Buy
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination Footer Controls */}
      {totalCount > 0 && (
        <div className="border-t bg-card px-3.5 sm:px-6 py-2.5 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Numbers Range Info */}
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 order-2 sm:order-1">
            <span>
              Showing <strong className="text-foreground font-mono">{((currentPage - 1) * pageSize) + 1}</strong> to{' '}
              <strong className="text-foreground font-mono">{Math.min(currentPage * pageSize, totalCount)}</strong> of{' '}
              <strong className="text-foreground font-mono">{totalCount.toLocaleString()}</strong> numbers
            </span>
            {isFetching && (
              <span className="flex items-center gap-1 text-[11px] text-primary animate-pulse ml-1">
                <RotateCw className="w-2.5 h-2.5 animate-spin" />
                <span>Loading page...</span>
              </span>
            )}
          </div>

          {/* Page Controls & Per-Page Selector */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 order-1 sm:order-2">
            {/* Items Per Page */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="hidden sm:inline">Per page:</span>
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-7 text-xs w-16 px-1.5 font-medium"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Select>
            </div>

            {/* Pagination Buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isFetching}
                className="h-7 px-2 sm:px-2.5 text-xs gap-1 font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Previous</span>
              </Button>

              {/* Dynamic Page Number Pills */}
              <div className="flex items-center gap-1">
                {paginationPages.map((pg, idx) =>
                  pg === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground select-none">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={`page-${pg}`}
                      variant={currentPage === pg ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(Number(pg))}
                      disabled={isFetching}
                      className={`h-7 min-w-[28px] px-2 text-xs font-mono font-medium ${
                        currentPage === pg
                          ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                          : 'hover:bg-muted/70'
                      }`}
                    >
                      {pg}
                    </Button>
                  )
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isFetching}
                className="h-7 px-2 sm:px-2.5 text-xs gap-1 font-medium"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment & Wallet Checkout Modal */}
      {confirmingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 animate-in zoom-in-95 max-h-[96vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 font-bold">
                  <Phone className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-foreground">Buy Phone Number</h3>
                  <p className="text-xs text-muted-foreground">Provision dedicated Indian PSTN carrier trunk</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmingItem(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selected Number Summary */}
            <div className="rounded-xl border bg-muted/40 p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Phone Number:</span>
                <span className="font-mono font-bold text-sm text-foreground">{confirmingItem.e164}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Region / PSTN:</span>
                <span className="font-medium text-foreground">
                  {areaLabel(confirmingItem)} · {confirmingItem.type || 'local'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Monthly Recurring Cost:</span>
                <span className="font-medium text-foreground">{feeLabel(confirmingItem.monthly_fee)}/month</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Carrier Setup Fee:</span>
                <span className="font-medium text-foreground">{feeLabel(confirmingItem.setup_fee || 100)}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="text-muted-foreground">Platform Activation Markup:</span>
                <span className="font-medium text-foreground">₹100.00</span>
              </div>
              <div className="flex justify-between items-center pt-1 text-sm font-bold text-foreground">
                <span>Total Due Now:</span>
                <span className="text-primary font-mono text-base font-extrabold">
                  ₹{((confirmingItem.setup_fee || 100) + 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Note / Message to Admin */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  Message / Note to Admin (Optional)
                </Label>
                <span className="text-[10px] text-muted-foreground font-normal">
                  Sent to Admin Panel if carrier requires top-up
                </span>
              </div>
              <Input
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder="e.g. Urgent number for upcoming sales campaign, please approve..."
                className="h-8 text-xs bg-background"
                maxLength={300}
                disabled={Boolean(purchaseStep) || isProcessingPayment}
              />
            </div>

            {/* Payment Method Switcher Tabs */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Payment Method</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCheckoutMode('wallet')}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs text-left transition-all ${
                    checkoutMode === 'wallet'
                      ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                      : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <Wallet className="w-4 h-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-bold leading-none">Platform Wallet</p>
                    <p className="text-[10px] opacity-80 mt-1">Available: ₹{availableBalanceINR.toFixed(2)}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCheckoutMode('razorpay')}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs text-left transition-all ${
                    checkoutMode === 'razorpay'
                      ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                      : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="font-bold leading-none">Direct Razorpay</p>
                    <p className="text-[10px] opacity-80 mt-1">UPI / Cards / NetBanking</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Wallet Balance & Provisioning Status */}
            {checkoutMode === 'wallet' && (
              <div className="space-y-3">
                {availableBalanceINR >= ((confirmingItem.setup_fee || 100) + 100) ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-emerald-700 dark:text-emerald-400">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Sufficient Wallet Balance
                      </span>
                      <span className="font-mono">₹{availableBalanceINR.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Deduction from Wallet:</span>
                      <span className="font-medium text-foreground font-mono">
                        - ₹{((confirmingItem.setup_fee || 100) + 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground border-t pt-1">
                      <span>Balance Remaining After Purchase:</span>
                      <span className="font-bold text-foreground font-mono">
                        ₹{(availableBalanceINR - ((confirmingItem.setup_fee || 100) + 100)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-destructive font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Insufficient Wallet Balance</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Your available balance is <strong className="text-foreground">₹{availableBalanceINR.toFixed(2)}</strong>.
                      You need <strong className="text-foreground">₹{(((confirmingItem.setup_fee || 100) + 100) - availableBalanceINR).toFixed(2)}</strong> more to purchase this number.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        const shortfall = Math.ceil(((confirmingItem.setup_fee || 100) + 100) - availableBalanceINR);
                        setDepositInitialAmount(Math.max(200, shortfall));
                        setDepositModalOpen(true);
                      }}
                      className="w-full h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground"
                    >
                      <Plus className="w-3.5 h-3.5" /> Deposit ₹{Math.max(200, Math.ceil(((confirmingItem.setup_fee || 100) + 100) - availableBalanceINR))} via Razorpay
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Purchase Step State Machine Indicator */}
            {purchaseStep && (
              <div className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary font-medium animate-pulse">
                <RotateCw className="w-4 h-4 animate-spin shrink-0" />
                <span>{purchaseStep}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingItem(null)}
                disabled={Boolean(purchaseStep) || isProcessingPayment}
              >
                Cancel
              </Button>

              {checkoutMode === 'wallet' ? (
                <Button
                  size="sm"
                  onClick={() => handleWalletPurchase(confirmingItem)}
                  disabled={
                    availableBalanceINR < ((confirmingItem.setup_fee || 100) + 100) ||
                    Boolean(purchaseStep) ||
                    purchaseWithWallet.isPending
                  }
                  loading={Boolean(purchaseStep) || purchaseWithWallet.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 px-5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Confirm &amp; Pay ₹{((confirmingItem.setup_fee || 100) + 100).toFixed(2)} from Wallet
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleBuy(confirmingItem)}
                  disabled={!canPurchase || isProcessingPayment}
                  loading={isProcessingPayment || buyMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs gap-1.5 px-5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Pay ₹{((confirmingItem.setup_fee || 100) + 100).toFixed(2)} with Razorpay
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Embedded Deposit Modal for Instant Top-up */}
      <DepositFundsModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
        initialAmount={depositInitialAmount}
        onSuccess={() => refetchWallet()}
      />
    </Dialog>
  );
}
