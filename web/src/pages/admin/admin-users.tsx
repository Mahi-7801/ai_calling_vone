import { useState, useEffect } from 'react';
import {
  Users,
  Building2,
  ShieldCheck,
  Search,
  RotateCw,
  Mail,
  Bot,
  Coins,
  PlusCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatCurrencyINR } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

interface OrganizationRecord {
  id: number;
  name: string;
  status: 'active' | 'disabled' | 'suspended';
  created_at: string;
  users: number;
  employees: number;
  calls: number;
  revenue: number;
  wallet_balance?: number;
}

interface UserRecord {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled' | 'suspended';
  organization_id?: number;
  org_name?: string;
  created_at: string;
  last_login_at?: string;
  wallet_balance?: number;
  total_calls?: number;
}

export function AdminUsersPage() {
  const toast = useToast();
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'organizations' | 'users'>('organizations');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Grant Credits Quick Modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantOrgId, setGrantOrgId] = useState<string>('');
  const [grantOrgName, setGrantOrgName] = useState<string>('');
  const [grantAmount, setGrantAmount] = useState<string>('500');
  const [grantReason, setGrantReason] = useState<string>('Customer Support Credit Adjustment');
  const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);

  const fetchUsersAndOrgs = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const [orgRes, userRes] = await Promise.all([
        api.get<{ success: boolean; organizations: OrganizationRecord[] }>('/admin/organizations'),
        api.get<{ success: boolean; users: UserRecord[] }>('/admin/users'),
      ]);
      setOrganizations(orgRes.organizations || []);
      setUsers(userRes.users || []);
    } catch {
      if (!quiet) toast.error('Failed to load user and organization data');
    } finally {
      if (!quiet) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsersAndOrgs();
    // Auto-refresh every 8s for live real-time status
    const interval = setInterval(() => {
      fetchUsersAndOrgs(true);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const openGrantModalForOrg = (orgId: number, orgName: string) => {
    setGrantOrgId(String(orgId));
    setGrantOrgName(orgName);
    setGrantAmount('500');
    setShowGrantModal(true);
  };

  const handleGrantCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantOrgId) return;
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
      toast.success(`Successfully adjusted ₹${amt} credits for ${grantOrgName}! Generated PDF invoice.`);
      setShowGrantModal(false);
      fetchUsersAndOrgs(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to adjust credits');
    } finally {
      setIsSubmittingGrant(false);
    }
  };

  const handleToggleOrgStatus = async (org: OrganizationRecord) => {
    const nextStatus = org.status === 'active' ? 'disabled' : 'active';
    if (!confirm(`Are you sure you want to change status of "${org.name}" to ${nextStatus}?`)) return;

    setActionLoadingId(org.id);
    try {
      await api.put(`/admin/organizations/${org.id}`, { status: nextStatus });
      toast.success(`Organization ${org.name} set to ${nextStatus}`);
      fetchUsersAndOrgs(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update organization status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleUserRole = async (user: UserRecord) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Are you sure you want to change role of "${user.email}" to ${nextRole.toUpperCase()}?`)) return;

    setActionLoadingId(user.id);
    try {
      await api.put(`/admin/users/${user.id}`, { role: nextRole });
      toast.success(`User ${user.email} is now ${nextRole.toUpperCase()}`);
      fetchUsersAndOrgs(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user role');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleUserStatus = async (user: UserRecord) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    if (!confirm(`Are you sure you want to ${nextStatus === 'disabled' ? 'disable' : 'activate'} user "${user.email}"?`)) return;

    setActionLoadingId(user.id);
    try {
      await api.put(`/admin/users/${user.id}`, { status: nextStatus });
      toast.success(`User ${user.email} is now ${nextStatus}`);
      fetchUsersAndOrgs(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredOrgs = organizations.filter((o) =>
    o.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.org_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPlatformBalance = organizations.reduce((acc, o) => acc + Number(o.wallet_balance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">User &amp; Tenant Management</h1>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Real-Time (8s Sync)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Multi-tenant control, wallet balances, role escalation, and customer credit management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchUsersAndOrgs(false)}
            disabled={isRefreshing}
            className="gap-2 text-xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Registered Users</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-foreground">{users.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Platform user accounts</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active Organizations</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-foreground">
            {organizations.filter((o) => o.status === 'active').length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Out of {organizations.length} registered</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Total Customer Credits Held</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-600">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-blue-600">{formatCurrencyINR(totalPlatformBalance)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Live customer wallet balances</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Platform Admins</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-purple-600">
            {users.filter((u) => u.role === 'admin').length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Superuser privileges</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs className="mb-4">
        <TabsTrigger
          active={activeTab === 'organizations'}
          onClick={() => setActiveTab('organizations')}
          className="gap-2 text-xs"
        >
          <Building2 className="h-4 w-4" /> Organizations ({organizations.length})
        </TabsTrigger>
        <TabsTrigger
          active={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
          className="gap-2 text-xs"
        >
          <Users className="h-4 w-4" /> Users ({users.length})
        </TabsTrigger>
      </Tabs>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === 'organizations' ? 'Search organizations...' : 'Search name, email, org...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Organizations Tab Content */}
      {activeTab === 'organizations' && (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-3 px-4">Organization Name</th>
                      <th className="py-3 px-4">Users</th>
                      <th className="py-3 px-4">AI Employees</th>
                      <th className="py-3 px-4">Calls Made</th>
                      <th className="py-3 px-4">Live Wallet Balance</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredOrgs.map((org) => (
                      <tr key={org.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{org.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">{org.users}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1 text-foreground font-medium">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                            {org.employees}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium">
                          {org.calls}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                          {formatCurrencyINR(org.wallet_balance || 0)}
                        </td>
                        <td className="py-3 px-4">
                          {org.status === 'active' ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              {org.status}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openGrantModalForOrg(org.id, org.name)}
                              className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5"
                            >
                              <PlusCircle className="h-3 w-3" /> Grant Credits
                            </Button>
                            <Button
                              variant={org.status === 'active' ? 'outline' : 'default'}
                              size="sm"
                              onClick={() => handleToggleOrgStatus(org)}
                              disabled={actionLoadingId === org.id}
                              className="h-7 text-xs"
                            >
                              {org.status === 'active' ? 'Suspend' : 'Reactivate'}
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
      )}

      {/* Users Tab Content */}
      {activeTab === 'users' && (
        <Card>
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
                      <th className="py-3 px-4">Name / Email</th>
                      <th className="py-3 px-4">Organization</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Org Wallet Balance</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Last Login</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-foreground">{u.name || 'Unnamed'}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Mail className="h-3 w-3" /> {u.email}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {u.org_name || 'Individual'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {u.role === 'admin' ? (
                            <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 gap-1">
                              <ShieldCheck className="h-3 w-3" /> Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Tenant User
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-600">
                          {formatCurrencyINR(u.wallet_balance || 0)}
                        </td>
                        <td className="py-3 px-4">
                          {u.status === 'active' ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              {u.status}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.organization_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openGrantModalForOrg(u.organization_id!, u.org_name || 'User Org')}
                                className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5"
                                title="Grant credits to user organization"
                              >
                                <Coins className="h-3 w-3" />
                                Credits
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleUserRole(u)}
                              disabled={actionLoadingId === u.id}
                              className="h-7 text-xs"
                            >
                              {u.role === 'admin' ? 'Demote' : 'Promote Admin'}
                            </Button>
                            <Button
                              variant={u.status === 'active' ? 'ghost' : 'outline'}
                              size="sm"
                              onClick={() => handleToggleUserStatus(u)}
                              disabled={actionLoadingId === u.id}
                              className="h-7 text-xs text-destructive hover:text-destructive"
                            >
                              {u.status === 'active' ? 'Disable' : 'Enable'}
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
      )}

      {/* Grant Credits Quick Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md shadow-2xl border-primary/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" /> Grant Credits to {grantOrgName}
              </CardTitle>
              <CardDescription>
                Credit allocation will instantly generate an official invoice in the Payments section with downloadable PDF receipt.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleGrantCredits}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Credit Amount (₹)</label>
                  <Input
                    type="number"
                    step="1"
                    placeholder="e.g. 1000"
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Reason / Description</label>
                  <Input
                    placeholder="e.g. Special promotion, compensation"
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
                  {isSubmittingGrant ? 'Allocating...' : 'Confirm & Generate Invoice'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
