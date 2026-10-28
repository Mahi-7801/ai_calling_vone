import { useState, useEffect } from 'react';
import {
  Phone,
  Building2,
  Bot,
  Search,
  RotateCw,
  Edit3,
  Tag,
  Radio,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

interface PhoneNumberRecord {
  id: number;
  phone_number?: string;
  number?: string;
  provider: 'vobiz' | 'twilio';
  country: string;
  organization_id: number;
  employee_id: number | null;
  monthly_cost: number;
  status: string;
  created_at: string;
  org_name?: string;
  employee_name?: string;
  total_calls?: number;
  active_calls?: number;
}

interface Organization {
  id: number;
  name: string;
}

interface Employee {
  id: number;
  name: string;
  organization_id: number;
}

export function AdminNumbersPage() {
  const toast = useToast();
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  // Assign Modal
  const [selectedNumber, setSelectedNumber] = useState<PhoneNumberRecord | null>(null);
  const [assignOrgId, setAssignOrgId] = useState<string>('');
  const [assignEmpId, setAssignEmpId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  const fetchNumbers = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const [numRes, orgRes, empRes] = await Promise.all([
        api.get<{ success: boolean; numbers: PhoneNumberRecord[] }>('/admin/phone-numbers'),
        api.get<{ success: boolean; organizations: Organization[] }>('/admin/organizations'),
        api.get<{ success: boolean; employees: Employee[] }>('/admin/employees'),
      ]);
      setNumbers(numRes.numbers || []);
      setOrganizations(orgRes.organizations || []);
      setEmployees(empRes.employees || []);
    } catch {
      if (!quiet) toast.error('Failed to load phone numbers');
    } finally {
      if (!quiet) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNumbers();
    // Auto-refresh every 8s for live real-time carrier status
    const interval = setInterval(() => {
      fetchNumbers(true);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const openAssignModal = (num: PhoneNumberRecord) => {
    setSelectedNumber(num);
    setAssignOrgId(String(num.organization_id));
    setAssignEmpId(num.employee_id ? String(num.employee_id) : '');
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNumber) return;

    setIsAssigning(true);
    try {
      await api.put(`/admin/phone-numbers/${selectedNumber.id}/assign`, {
        organizationId: assignOrgId ? parseInt(assignOrgId, 10) : null,
        employeeId: assignEmpId ? parseInt(assignEmpId, 10) : null,
      });
      toast.success('Number assignment updated successfully!');
      setSelectedNumber(null);
      fetchNumbers(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign number');
    } finally {
      setIsAssigning(false);
    }
  };

  const filteredNumbers = numbers.filter((n) => {
    const rawNum = n.phone_number || n.number || '';
    const matchesSearch =
      rawNum.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.org_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.employee_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProvider = providerFilter === 'all' || n.provider === providerFilter;
    return matchesSearch && matchesProvider;
  });

  const vobizCount = numbers.filter((n) => n.provider === 'vobiz').length;
  const twilioCount = numbers.filter((n) => n.provider === 'twilio').length;
  const totalActiveCalls = numbers.reduce((acc, n) => acc + (n.active_calls || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Phone Numbers Management</h1>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Real-Time Inventory (8s Sync)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active carrier DIDs across Twilio (US) and VoBiz (India PSTN) with live traffic telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNumbers(false)}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
          >
            <RotateCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3.5 border-primary/30 bg-gradient-to-br from-primary/10 to-card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">Total Active Numbers</p>
            <Phone className="h-4 w-4 text-primary shrink-0" />
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{numbers.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Provisioned carrier lines</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">VoBiz India PSTN</p>
            <span className="font-mono text-xs text-emerald-600 font-bold shrink-0">IN (+91)</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{vobizCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">+91 806 535 4620</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">Twilio PSTN (US)</p>
            <span className="font-mono text-xs text-blue-600 font-bold shrink-0">US (+1)</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{twilioCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">+1 737 250 8034</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">Live Active Calls</p>
            <Radio className="h-4 w-4 text-emerald-500 animate-pulse shrink-0" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{totalActiveCalls}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Across all phone lines</p>
        </Card>
      </div>

      {/* Main Numbers Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Allocated Carrier Numbers</CardTitle>
              <CardDescription className="text-xs">
                Assign or reassign phone numbers between tenant accounts and their AI employees.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search number, tenant, employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8 w-full"
                />
              </div>
              <select
                aria-label="Filter carrier provider"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs w-full sm:w-auto"
                value={providerFilter}
                onChange={(e: any) => setProviderFilter(e.target.value)}
              >
                <option value="all">All Carriers</option>
                <option value="vobiz">VoBiz India (+91)</option>
                <option value="twilio">Twilio US (+1)</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto w-full max-w-full">
          {isLoading ? (
            <div className="p-4 sm:p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredNumbers.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-muted-foreground text-xs">
              No phone numbers found matching your filters.
            </div>
          ) : (
            <div className="min-w-[640px] w-full overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Carrier</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">Assigned Tenant</th>
                    <th className="py-3 px-4">Assigned AI Employee</th>
                    <th className="py-3 px-4">Traffic Activity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredNumbers.map((n) => (
                    <tr key={n.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">
                        {n.phone_number || n.number}
                      </td>
                      <td className="py-3 px-4">
                        {n.provider === 'vobiz' ? (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 font-mono text-[10px]">
                            VoBiz India
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 font-mono text-[10px]">
                            Twilio US
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 capitalize">
                        {n.country || (n.provider === 'twilio' ? 'US' : 'IN')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {n.org_name || `Org #${n.organization_id}`}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {n.employee_name ? (
                          <div className="flex items-center gap-1.5 text-foreground font-medium">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                            {n.employee_name}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Unassigned (Pool)</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground font-medium">{n.total_calls ?? 0} calls</span>
                          {(n.active_calls ?? 0) > 0 && (
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[9px] gap-1 px-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                          {n.status || 'Active'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignModal(n)}
                          className="h-7 text-xs gap-1.5"
                        >
                          <Edit3 className="h-3 w-3" /> Assign
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Modal */}
      {selectedNumber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md shadow-2xl border-primary/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" /> Assign Phone Number
              </CardTitle>
              <CardDescription>
                Assign <span className="font-mono font-semibold text-foreground">{selectedNumber.phone_number || selectedNumber.number}</span> to a tenant organization and employee.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleAssignSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Target Organization</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    value={assignOrgId}
                    onChange={(e) => {
                      setAssignOrgId(e.target.value);
                      setAssignEmpId('');
                    }}
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
                  <label className="text-xs font-semibold text-foreground">Assign to AI Employee (Optional)</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                    value={assignEmpId}
                    onChange={(e) => setAssignEmpId(e.target.value)}
                  >
                    <option value="">Leave in Shared Org Pool</option>
                    {employees
                      .filter((e) => String(e.organization_id) === assignOrgId)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} (ID #{emp.id})
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    When assigned to an employee, inbound calls to this DID will directly engage this AI agent.
                  </p>
                </div>
              </CardContent>

              <div className="p-4 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedNumber(null)}
                  disabled={isAssigning}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isAssigning}>
                  {isAssigning ? 'Saving...' : 'Save Assignment'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
