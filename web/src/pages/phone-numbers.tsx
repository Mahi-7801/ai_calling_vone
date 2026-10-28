import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  PhoneOff,
  Plus,
  Settings2,
  Trash2,
  UserCheck,
  UserMinus,
  RefreshCw,
  Wallet,
  Shield,
  PhoneCall,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  useAssignPhoneNumber,
  useDeletePhoneNumber,
  useEmployees,
  usePhoneNumbers,
  useUpdatePhoneNumber,
  useWallet,
  useNumberOrders,
} from '@/hooks/queries';
import { formatCurrencyINR, formatDateTime } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { NumbersInventoryModal } from '@/components/phone-numbers/numbers-inventory-modal';
import { DepositFundsModal } from '@/components/wallet/deposit-modal';
import type { PhoneNumber } from '@/types';

export function PhoneNumbersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { wallet } = useAuth();
  const { data, isLoading, refetch } = usePhoneNumbers();
  const { data: empData } = useEmployees();
  const { data: walletData, refetch: refetchWallet } = useWallet();
  const { data: ordersData, refetch: refetchOrders } = useNumberOrders();

  const [activeTab, setActiveTab] = useState<'numbers' | 'orders'>('numbers');
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [configure, setConfigure] = useState<PhoneNumber | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ id: number; number: string } | null>(null);

  const assign = useAssignPhoneNumber();
  const del = useDeletePhoneNumber();
  const numbers = data?.numbers ?? [];
  const employees = empData?.employees ?? [];
  const orders = ordersData?.orders ?? [];

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Top Banner from Outpero screenshot */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 text-sm dark:border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Finish setting up your AI employee</p>
            <p className="text-xs text-muted-foreground">About three minutes, and free to build and test.</p>
          </div>
        </div>
        <Button
          size="sm"
          className="bg-amber-600 font-medium text-white hover:bg-amber-700 dark:bg-amber-500"
          onClick={() => navigate('/employees/new')}
        >
          Continue
        </Button>
      </div>

      {/* Header section */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-primary">Phone Numbers</p>
          <h1 className="text-sm sm:text-lg font-bold tracking-tight text-foreground">Phone Numbers</h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Buy numbers, verify, and attach them to employees</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Refresh / Sync button */}
          <button
            onClick={() => {
              refetch();
              refetchWallet();
              refetchOrders();
            }}
            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Refresh phone numbers & wallet"
          >
            <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </button>

          {/* Platform Wallet Balance Pill with Add Money */}
          <div className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-foreground shadow-2xs h-7 sm:h-8">
            <Wallet className="h-3 w-3 sm:w-3.5 sm:h-3.5 text-primary" />
            <span className="text-muted-foreground hidden sm:inline">Wallet:</span>
            <span className="font-bold font-mono text-foreground">
              ₹{walletData?.wallet?.available_inr ?? '0.00'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDepositModalOpen(true)}
              className="h-5 px-1.5 text-[10px] text-primary border-primary/30 hover:bg-primary/10 ml-1 font-bold"
            >
              + Add Money
            </Button>
          </div>

          {/* Credits pill */}
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-foreground shadow-2xs h-7 sm:h-8">
            <Coins className="h-3 w-3 sm:w-3.5 sm:h-3.5 text-amber-500" />
            {wallet?.balance === null || wallet?.balance === undefined ? (
              <span className="text-muted-foreground">...</span>
            ) : (
              <span title={`${wallet.balance} credits available`}>
                {Number(wallet.balance).toLocaleString('en-IN')} credits
              </span>
            )}
          </div>

          {/* Buy a new number button */}
          <Button
            onClick={() => setInventoryOpen(true)}
            className="gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-[11px] sm:text-xs h-7 sm:h-8 px-2.5 sm:px-3.5 shadow-sm"
          >
            <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Buy Phone Number
          </Button>
        </div>
      </div>

      {/* Tabs Switcher: Numbers vs Order History */}
      <div className="flex items-center gap-2 border-b pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('numbers')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'numbers'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Active Numbers</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
            activeTab === 'numbers' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
          }`}>
            {numbers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'orders'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Purchase Orders &amp; Ledger</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
            activeTab === 'orders' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
          }`}>
            {orders.length}
          </span>
        </button>
      </div>

      {activeTab === 'orders' ? (
        <Card className="rounded-2xl overflow-hidden border shadow-xs">
          <CardContent className="p-2 sm:p-4">
            {orders.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground space-y-2">
                <History className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No Purchase Orders Yet</p>
                <p>When you purchase phone numbers through your platform wallet, audit logs and invoices appear here.</p>
                <Button size="sm" onClick={() => setInventoryOpen(true)} className="mt-2 text-xs">
                  Browse Numbers
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Ref</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Total Paid (Wallet)</TableHead>
                    <TableHead>Wholesale Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Carrier Order ID</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} className="hover:bg-muted/30 text-xs">
                      <TableCell className="font-mono font-semibold text-foreground">{o.order_ref || o.order_id}</TableCell>
                      <TableCell>
                        <div className="font-mono font-bold text-foreground">{o.phone_number}</div>
                        {o.status === 'PENDING_ADMIN_TOPUP' && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            Automated top-up request dispatched to Admin
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {formatCurrencyINR(Number(o.total_charged_inr || (o.total_charged_paise ?? o.amount_charged_paise ?? 0) / 100))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCurrencyINR(Number(o.provider_cost_inr || (o.provider_cost_paise ?? 0) / 100))}
                      </TableCell>
                      <TableCell>
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
                          {o.status === 'PENDING_ADMIN_TOPUP' ? 'Pending Admin Top-up' : o.status}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {o.provider_order_id || '—'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDateTime(o.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : numbers.length === 0 ? (
        /* Empty / Hero State from Outpero screenshot */
        <div className="w-full rounded-2xl border bg-card/80 p-6 sm:p-12 text-center shadow-xs backdrop-blur space-y-6 sm:space-y-8">
          {/* Centered Phone Icon */}
          <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Phone className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>

          {/* Titles */}
          <div className="mx-auto max-w-2xl space-y-1.5">
            <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground">
              Give your employee a phone number
            </h2>
            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
              A number is how your employee makes and takes real calls — it&apos;s the number your customers see when they
              ring, or get a call from. You need one to go live.
            </p>
          </div>

          {/* Pricing Highlight Box */}
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border/80 bg-muted/30 p-4 sm:p-6 text-center space-y-1.5">
            <p className="text-lg sm:text-xl font-bold text-foreground">₹649 a month</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Taken from your credit balance, renewing every month. It handles one call at a time — you can add more lines
              when you buy it, if you need to talk to several people at once.
            </p>
          </div>

          {/* 3 Feature Boxes */}
          <div className="grid gap-4 sm:grid-cols-3 text-left w-full max-w-4xl mx-auto">
            <div className="rounded-2xl border bg-card p-5 space-y-1.5 shadow-2xs">
              <p className="font-bold text-sm sm:text-base text-foreground">Call your leads</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Ring every new lead automatically in seconds</p>
            </div>
            <div className="rounded-2xl border bg-card p-5 space-y-1.5 shadow-2xs">
              <p className="font-bold text-sm sm:text-base text-foreground">Answer customers</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Pick up every incoming call, 24/7 round the clock</p>
            </div>
            <div className="rounded-2xl border bg-card p-5 space-y-1.5 shadow-2xs">
              <p className="font-bold text-sm sm:text-base text-foreground">Your business ID</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Customers recognize this as your verified official number</p>
            </div>
          </div>

          {/* Browse numbers CTA */}
          <div className="pt-2">
            <Button
              size="lg"
              onClick={() => setInventoryOpen(true)}
              className="h-11 rounded-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm px-8 shadow-md shadow-purple-600/20"
            >
              Browse numbers
            </Button>
          </div>

          {/* Sub-footer caption */}
          <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center justify-center gap-1.5 pt-1">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" /> Before you start calling
          </p>
        </div>
      ) : (
        /* Configured Numbers Table */
        <Card className="rounded-2xl overflow-hidden border shadow-xs">
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Country / Type</TableHead>
                  <TableHead>Assigned Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Monthly cost</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((n) => (
                  <TableRow key={n.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono font-bold text-foreground text-sm">{n.number}</TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium text-foreground">
                        {n.provider === 'vobiz' ? 'India PSTN' : (n.provider === 'twilio' ? 'Global PSTN' : (n.provider ?? 'Cloud PSTN'))}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {n.country ?? '—'} · {n.region ?? n.type ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {n.employee_name ? (
                        <span className="font-semibold text-primary">{n.employee_name}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={n.status} />
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {n.monthly_cost === null || n.monthly_cost === undefined
                        ? <span className="text-muted-foreground">—</span>
                        : formatCurrencyINR(n.monthly_cost)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {n.employee_id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await assign.mutateAsync({ id: n.id, employeeId: null });
                                toast.success('Number unassigned');
                              } catch (err) {
                                toast.error('Failed', err instanceof ApiClientError ? err.message : '');
                              }
                            }}
                            className="h-8 text-xs gap-1"
                          >
                            <UserMinus className="h-3.5 w-3.5" /> Unassign
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAssignTarget({ id: n.id, number: n.number })}
                            className="h-8 text-xs gap-1"
                          >
                            <UserCheck className="h-3.5 w-3.5" /> Assign
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Configure"
                          onClick={() => setConfigure(n)}
                          className="h-8 w-8"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          onClick={async () => {
                            if (!confirm(`Delete number ${n.number}?`)) return;
                            try {
                              await del.mutateAsync(n.id);
                              toast.success('Number deleted');
                            } catch (err) {
                              toast.error('Delete failed', err instanceof ApiClientError ? err.message : '');
                            }
                          }}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Numbers Inventory Modal (Browse numbers & buy flow from VoBiz) */}
      <NumbersInventoryModal
        open={inventoryOpen}
        onOpenChange={setInventoryOpen}
        onSuccess={() => {
          refetch();
          refetchWallet();
          refetchOrders();
        }}
      />

      {/* Deposit Funds Modal */}
      <DepositFundsModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
        onSuccess={() => {
          refetchWallet();
          refetchOrders();
        }}
      />

      {/* Assign Employee Dialog */}
      {assignTarget ? (
        <Dialog open onOpenChange={() => setAssignTarget(null)}>
          <DialogHeader>
            <DialogTitle>Assign {assignTarget.number}</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <AssignForm
              numberId={assignTarget.id}
              employees={employees}
              onDone={() => {
                setAssignTarget(null);
                refetch();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Configure Dialog */}
      {configure ? (
        <Dialog open onOpenChange={() => setConfigure(null)}>
          <DialogHeader>
            <DialogTitle>Configure {configure.number}</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <ConfigureForm
              number={configure}
              onDone={() => {
                setConfigure(null);
                refetch();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function AssignForm({
  numberId,
  employees,
  onDone,
}: {
  numberId: number;
  employees: { id: number; name: string }[];
  onDone: () => void;
}) {
  const toast = useToast();
  const assign = useAssignPhoneNumber();
  const [employeeId, setEmployeeId] = useState('');

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-1.5">
        <Label className="text-xs">Select AI employee to connect</Label>
        <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-9">
          <option value="">Select an AI employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      <DialogFooter>
        <Button
          disabled={!employeeId}
          loading={assign.isPending}
          onClick={async () => {
            try {
              await assign.mutateAsync({ id: numberId, employeeId: Number(employeeId) });
              toast.success('Number assigned to employee');
              onDone();
            } catch (err) {
              toast.error('Assignment failed', err instanceof ApiClientError ? err.message : '');
            }
          }}
          className="text-xs"
        >
          <UserCheck className="h-4 w-4 mr-1.5" /> Assign Number
        </Button>
      </DialogFooter>
    </div>
  );
}

function ConfigureForm({ number, onDone }: { number: PhoneNumber; onDone: () => void }) {
  const toast = useToast();
  const update = useUpdatePhoneNumber();
  const [form, setForm] = useState({
    status: number.status,
    country: number.country ?? 'IN',
    type: number.type ?? 'local',
    monthly_cost: String(number.monthly_cost ?? 649),
  });

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PhoneOff className="h-4 w-4" /> Changes apply immediately to all calls on this number.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-8">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="h-8">
            <option value="local">Local</option>
            <option value="tollfree">Toll-free</option>
            <option value="national">National</option>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Monthly cost (₹)</Label>
          <Input
            inputMode="numeric"
            value={form.monthly_cost}
            onChange={(e) => setForm({ ...form, monthly_cost: e.target.value })}
            className="h-8 text-xs font-mono"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={async () => {
            try {
              await update.mutateAsync({
                id: number.id,
                payload: { ...form, monthly_cost: Number(form.monthly_cost) || 0 },
              });
              toast.success('Number updated');
              onDone();
            } catch (err) {
              toast.error('Update failed', err instanceof ApiClientError ? err.message : '');
            }
          }}
          className="text-xs"
        >
          <Settings2 className="h-4 w-4 mr-1.5" /> Save changes
        </Button>
      </DialogFooter>
    </div>
  );
}