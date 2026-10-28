import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingBag,
  Search,
  RotateCw,
  Zap,
  Phone,
  ShieldCheck,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatCurrencyINR } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

// Mirrors VoBizProvider.getNumbersInventory(). The carrier has no prefix_area
// field; type and features are what it actually reports.
interface LiveInventoryItem {
  id: string;
  e164: string;
  type: 'local' | 'national' | 'mobile' | 'tollfree' | 'shared';
  country: string;
  region: string | null;
  features: string | null;
  series: string | null;
  monthly_fee: number | null;
  setup_fee: number | null;
  release_fee: number | null;
  currency: string;
}

interface InventoryResponse {
  success: boolean;
  carrier: string;
  authId: string;
  balance: number;
  currency: string;
  isTrial: boolean;
  cpsLimit: number;
  concurrentCallsLimit: number;
  total: number;
  page?: number;
  per_page?: number;
  numbers: LiveInventoryItem[];
}

interface Organization {
  id: number;
  name: string;
}

const REGIONS = [
  'Any',
  'Gujarat',
  'Karnataka',
  'Telangana',
  'Delhi NCR',
  'Maharashtra',
  'Tamil Nadu',
  'Andhra Pradesh',
];

export function AdminAvailableNumbersPage() {
  const toast = useToast();
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('Any');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Quick Allocate Modal state
  const [allocatingItem, setAllocatingItem] = useState<LiveInventoryItem | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [allocationReason, setAllocationReason] = useState<string>('');
  const [isAllocating, setIsAllocating] = useState(false);

  const fetchInventory = useCallback(async (page = currentPage, limit = pageSize, q = searchQuery, region = selectedRegion) => {
    setIsLoading(true);
    try {
      const regionParam = region === 'Any' ? '' : encodeURIComponent(region);
      const queryParam = encodeURIComponent(q.trim());
      const [invRes, orgRes] = await Promise.all([
        api.get<InventoryResponse>(
          `/admin/numbers/inventory?region=${regionParam}&q=${queryParam}&page=${page}&limit=${limit}`
        ),
        api.get<{ success: boolean; organizations: Organization[] }>('/admin/organizations'),
      ]);
      setData(invRes);
      setOrganizations(orgRes.organizations || []);
      if (orgRes.organizations?.length && !selectedOrgId) {
        setSelectedOrgId(String(orgRes.organizations[0].id));
      }
    } catch {
      toast.error('Failed to query live carrier inventory');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, selectedRegion, selectedOrgId, toast]);

  // Debounced search & fetch on filters or page change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInventory(currentPage, pageSize, searchQuery, selectedRegion);
    }, 250);
    return () => clearTimeout(timer);
  }, [currentPage, pageSize, searchQuery, selectedRegion]);

  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Generate pagination pages with ellipsis: e.g. [1, 2, 3, 4, '...', 1018]
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

  const filteredNumbers = useMemo(() => {
    return data?.numbers || [];
  }, [data]);

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingItem || !selectedOrgId) return;

    setIsAllocating(true);
    try {
      // Admin allocation is platform-funded, so it has its own audited endpoint.
      // It cannot go through /vobiz/buy, which requires a verified customer
      // payment and deliberately rejects anything else.
      await api.post('/phone-numbers/vobiz/allocate', {
        organization_id: selectedOrgId,
        e164: allocatingItem.e164,
        monthly_fee: allocatingItem.monthly_fee,
        setup_fee: allocatingItem.setup_fee,
        type: allocatingItem.type || 'local',
        country: allocatingItem.country || 'IN',
        region: allocatingItem.region,
        reason: allocationReason || undefined,
      });
      toast.success(
        'Number Allocated Successfully',
        `${allocatingItem.e164} has been purchased and assigned to tenant.`
      );
      setAllocatingItem(null);
      setAllocationReason('');
      fetchInventory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to allocate number');
    } finally {
      setIsAllocating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-lg font-bold tracking-tight text-foreground">Available Carrier Numbers</h1>
            <span className="flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
              Live VoBiz API
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Real-time DID and PSTN inventory queried live from carrier APIs — not stored in local database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchInventory()}
            disabled={isLoading}
            className="h-7 sm:h-8 px-2.5 sm:px-3 text-[11px] sm:text-xs gap-1.5 shrink-0"
          >
            <RotateCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh API
          </Button>
        </div>
      </div>

      {/* Carrier Diagnostics & Readiness Banner */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 via-card to-card p-2.5 sm:p-3.5">
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Carrier Balance</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base sm:text-xl font-bold text-foreground">
                ₹{Number(data.balance ?? 19.95).toFixed(2)}
              </span>
              <Badge variant="outline" className="text-[8px] sm:text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 py-0 px-1">
                {data.isTrial ? 'Trial' : 'Live'}
              </Badge>
            </div>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 font-mono truncate">Carrier: {data.carrier}</p>
          </Card>

          <Card className="p-2.5 sm:p-3.5">
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Auth ID</p>
            <p className="text-xs sm:text-sm font-mono font-bold text-foreground mt-0.5 truncate">{data.authId}</p>
            <p className="text-[9px] sm:text-[10px] text-emerald-600 mt-0.5 font-semibold flex items-center gap-1 truncate">
              <ShieldCheck className="h-3 w-3 shrink-0" /> Ready
            </p>
          </Card>

          <Card className="p-2.5 sm:p-3.5">
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Throughput</p>
            <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5 truncate">
              {data.cpsLimit || 1} CPS • {data.concurrentCallsLimit || 3} Calls
            </p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 truncate">Auto-scaling</p>
          </Card>

          <Card className="p-2.5 sm:p-3.5">
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Available Pool</p>
            <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5 truncate">{data.total || filteredNumbers.length} Numbers</p>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 truncate">Live API Pool</p>
          </Card>
        </div>
      )}

      {/* Inventory Filter & Table */}
      <Card className="shadow-xs border-border/60">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-purple-600" /> Live Inventory Catalog
              </CardTitle>
              <CardDescription className="text-xs">
                Numbers available for immediate activation across India and international regions.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search number, region..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 text-xs h-8"
                />
              </div>
              <select
                aria-label="Filter by region"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={selectedRegion}
                onChange={(e) => {
                  setSelectedRegion(e.target.value);
                  setCurrentPage(1);
                }}
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    Region: {r}
                  </option>
                ))}
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
          ) : filteredNumbers.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-xs space-y-2">
              <Phone className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p>No carrier inventory numbers found for the selected region.</p>
              <Button variant="outline" size="sm" onClick={() => { setSelectedRegion('Any'); setSearchQuery(''); setCurrentPage(1); }}>
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-3 px-4">Carrier Phone Number</th>
                    <th className="py-3 px-4">Region / State</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Setup Fee</th>
                    <th className="py-3 px-4">Monthly Rental</th>
                    <th className="py-3 px-4">Features</th>
                    <th className="py-3 px-4 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredNumbers.map((n) => (
                    <tr key={n.id || n.e164} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        {n.e164}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{n.region || 'India'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{n.series || '—'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px]">
                          {n.country || 'IN'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 capitalize">{n.type}</td>
                      <td className="py-3 px-4 font-medium text-muted-foreground">
                        {n.setup_fee === null || n.setup_fee === undefined ? '—' : formatCurrencyINR(n.setup_fee)}
                      </td>
                      <td className="py-3 px-4 font-bold text-foreground">
                        {n.monthly_fee === null || n.monthly_fee === undefined ? '—' : `${formatCurrencyINR(n.monthly_fee)}/mo`}
                      </td>
                      <td className="py-3 px-4">
                        {n.features ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
                            <Zap className="h-2.5 w-2.5" /> {n.features}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAllocatingItem(n)}
                          className="h-7 text-xs gap-1.5 border-purple-500/40 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
                        >
                          <Plus className="h-3 w-3" /> Quick Allocate
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer Controls */}
          {totalCount > 0 && (
            <div className="border-t border-border/60 bg-card px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              {/* Numbers Range Info */}
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 order-2 sm:order-1">
                <span>
                  Showing <strong className="text-foreground font-semibold font-mono">{((currentPage - 1) * pageSize) + 1}</strong> to{' '}
                  <strong className="text-foreground font-semibold font-mono">{Math.min(currentPage * pageSize, totalCount).toLocaleString()}</strong> of{' '}
                  <strong className="text-foreground font-semibold font-mono">{totalCount.toLocaleString()}</strong> numbers
                </span>
                {isLoading && (
                  <span className="flex items-center gap-1 text-[11px] text-purple-600 animate-pulse ml-2">
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
                  <select
                    aria-label="Items per page"
                    value={String(pageSize)}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-8 text-xs w-16 px-2 font-medium rounded-md border border-input bg-background cursor-pointer"
                  >
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>

                {/* Pagination Buttons */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || isLoading}
                    className="h-8 px-2.5 text-xs gap-1 font-medium rounded-md"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
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
                          disabled={isLoading}
                          className={`h-8 min-w-[32px] px-2 text-xs font-mono font-medium rounded-md ${
                            currentPage === pg
                              ? 'bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-xs border-purple-600'
                              : 'hover:bg-muted/70 text-foreground'
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
                    disabled={currentPage >= totalPages || isLoading}
                    className="h-8 px-2.5 text-xs gap-1 font-medium rounded-md"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Allocate Modal */}
      {allocatingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md shadow-2xl border-purple-500/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-purple-600" /> Allocate Carrier Number
              </CardTitle>
              <CardDescription>
                Purchase <span className="font-mono font-bold text-foreground">{allocatingItem.e164}</span> via live VoBiz API and assign directly to a tenant.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleAllocate}>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Selected Number:</span>
                    <span className="font-mono font-bold text-foreground">{allocatingItem.e164}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Region:</span>
                    <span className="font-semibold text-foreground">{allocatingItem.region}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Setup Fee:</span>
                    <span className="font-medium text-foreground">{formatCurrencyINR(allocatingItem.setup_fee || 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly Fee:</span>
                    <span className="font-bold text-foreground">{formatCurrencyINR(allocatingItem.monthly_fee || 500)}/mo</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Target Organization / Tenant</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    required
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} (ID #{org.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="alloc-reason">Allocation reason</label>
                  <input
                    id="alloc-reason"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    value={allocationReason}
                    onChange={(e) => setAllocationReason(e.target.value)}
                    placeholder="e.g. onboarding credit for Acme Ltd"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    This allocation is platform-funded, not billed to the tenant. The reason is stored in the audit log.
                  </p>
                </div>
              </CardContent>

              <div className="p-4 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAllocatingItem(null)}
                  disabled={isAllocating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isAllocating}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                >
                  {isAllocating ? 'Purchasing from Carrier...' : 'Confirm & Provision'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
