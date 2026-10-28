import { useNavigate, Link } from 'react-router-dom';
import {
  Ban,
  BarChart3,
  CheckCircle2,
  Copy,
  GraduationCap,
  LayoutGrid,
  MessageSquareText,
  Pause,
  PencilLine,
  Phone,
  Play,
  Plus,
  Radio,
  Table2,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatDuration, cn } from '@/lib/utils';
import {
  useDuplicateEmployee,
  useEmployeeStatus,
  useEmployees,
  usePhoneNumbers,
  useAssignPhoneNumber,
  useDeleteEmployee,
} from '@/hooks/queries';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { formatTimeAgo } from '@/lib/utils';
import { useState } from 'react';
import { usePresence } from '@/hooks/usePresence';
import { AiEmployeeBuilderHero } from '@/components/employees/ai-employee-builder-hero';

export function EmployeesPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useEmployees();
  const { data: numbersData } = usePhoneNumbers();
  const { users: onlineUsers } = usePresence();
  const duplicate = useDuplicateEmployee();
  const statusMut = useEmployeeStatus();
  const assign = useAssignPhoneNumber();
  const deleteEmployee = useDeleteEmployee();
  const toast = useToast();
  const [assignTarget, setAssignTarget] = useState<{ id: number | string; name: string; phoneId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number | string; name: string } | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // An employee can be created, retrained or have its status flipped by another
  // tab or by the campaign engine, so keep the roster in step with the server.
  useRealtimeEvent(
    ['employee.created', 'employee.updated', 'employee.status', 'employee.trained', 'employee.deleted'],
    () => { void refetch(); }
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteEmployee.mutateAsync(target.id);
      toast.success(`Employee "${target.name}" deleted successfully`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete employee');
    }
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end"><Plus className="h-4 w-4 opacity-0" /></div>
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  const employees = data.employees;
  const successRate = (e: { successful_calls: number; total_calls: number }) =>
    e.total_calls ? Math.round((e.successful_calls / e.total_calls) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top AI Employee Builder Hero */}
      <AiEmployeeBuilderHero onEmployeeCreated={() => {
        refetch();
      }} />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="text-lg font-bold">Your AI Calling Team</h2>
          <p className="text-sm text-muted-foreground">
            {employees.length} employee{employees.length === 1 ? '' : 's'} ready for calling
            {onlineUsers.length > 0 ? ` · ${onlineUsers.length === 1 ? `${onlineUsers[0].name.split(' ')[0]} is also viewing` : `${onlineUsers.length} others viewing`}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* The table view below used to hang off a useParams() id that the
              /employees route never supplies, so it was unreachable. Make it a
              real toggle instead of dead code. */}
          <div className="flex items-center rounded-lg border bg-card p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              title="Card view"
              aria-pressed={viewMode === 'cards'}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                viewMode === 'cards'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table view"
              aria-pressed={viewMode === 'table'}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button onClick={() => navigate('/employees/new')}>
            <Plus className="h-4 w-4" /> New Employee
          </Button>
        </div>
      </div>

      {employees.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Create your first AI employee"
          description="Priya can be your first Telugu-speaking sales assistant — build her personality, voice and knowledge in minutes."
          actionLabel="Create employee"
          onAction={() => navigate('/employees/new')}
        />
      ) : viewMode === 'table' ? (
        <Card>
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Language / Voice</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Avg duration</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} />
                        <div>
                          <p className="font-medium">{e.name}</p>
                          <p className="text-xs text-muted-foreground">{e.role} · created {formatTimeAgo(e.created_at)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{e.language}</p>
                      <p className="text-xs text-muted-foreground">{formatVoiceBadge(e.voice)}</p>
                      {e.cartesia_agent_id ? (
                        <span
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 dark:text-purple-400"
                          title="Voice engine synchronized and active"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Voice Synced
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{e.assigned_number ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={e.status} /></TableCell>
                    <TableCell className="text-sm">{e.total_calls}</TableCell>
                    <TableCell className="text-sm font-medium text-emerald-600">{successRate(e)}%</TableCell>
                    <TableCell className="text-sm">{formatDuration(e.avg_duration)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/employees/${e.id}/call`)}>
                          Call
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/employees/${e.id}/talk`)}>
                          Talk
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/employees/${e.id}`)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const next = e.status === 'disabled' ? 'active' : 'disabled';
                            await statusMut.mutateAsync({ id: e.id, status: next });
                            toast.success(`Employee ${next === 'active' ? 'enabled' : 'disabled'}`);
                          }}
                          className={e.status === 'disabled' ? 'text-emerald-600 border-emerald-500/30' : 'text-muted-foreground'}
                        >
                          {e.status === 'disabled' ? 'Enable' : 'Disable'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: e.id, name: e.name })}
                          className="text-destructive hover:bg-destructive/10 border-destructive/30"
                          title={`Delete ${e.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((e) => (
            <Card key={e.id} className="group overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-start justify-between gap-3 border-b p-5">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar name={e.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold">{e.name}</h3>
                        <StatusBadge status={e.status} />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{e.role}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">{e.language}</span>
                        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">{formatVoiceBadge(e.voice)}</span>
                        {e.assigned_number ? <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">{e.assigned_number}</span> : null}
                        {e.cartesia_agent_id ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 px-2.5 py-0.5 font-medium text-purple-600 dark:text-purple-400"
                            title="Voice engine synchronized and active"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Voice Synced
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ id: e.id, name: e.name })}
                    title={`Delete ${e.name}`}
                    className="rounded-lg p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-b px-5 py-4 text-center">
                  <div>
                    <p className="text-lg font-bold">{e.total_calls}</p>
                    <p className="text-xs text-muted-foreground">Calls</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{successRate(e)}%</p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{formatDuration(e.avg_duration)}</p>
                    <p className="text-xs text-muted-foreground">Avg call</p>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5 p-3">
                  <ActionButton icon={Radio} label="Call" onClick={() => navigate(`/employees/${e.id}/call`)} primary />
                  <ActionButton icon={MessageSquareText} label="Talk" onClick={() => navigate(`/employees/${e.id}/talk`)} />
                  <ActionButton icon={PencilLine} label="Edit" onClick={() => navigate(`/employees/${e.id}`)} />
                  <ActionButton icon={GraduationCap} label="Train" onClick={() => navigate(`/training?employee=${e.id}`)} />
                  <ActionButton icon={BarChart3} label="Perf" onClick={() => navigate(`/performance?employee=${e.id}`)} />
                  <ActionButton
                    icon={Copy}
                    label="Copy"
                    onClick={async () => {
                      try {
                        await duplicate.mutateAsync(e.id);
                        toast.success('Employee duplicated');
                      } catch {
                        toast.error('Could not duplicate');
                      }
                    }}
                  />
                  <ActionButton
                    icon={Phone}
                    label="Assign"
                    onClick={() => setAssignTarget({ id: e.id, name: e.name, phoneId: '' })}
                  />
                  <ActionButton
                    icon={e.status === 'paused' ? Play : Pause}
                    label={e.status === 'paused' ? 'Resume' : 'Pause'}
                    onClick={async () => {
                      const next = e.status === 'paused' ? 'active' : 'paused';
                      await statusMut.mutateAsync({ id: e.id, status: next });
                      toast.success(`Employee ${next === 'active' ? 'resumed' : 'paused'}`);
                    }}
                  />
                  <ActionButton
                    icon={e.status === 'disabled' ? CheckCircle2 : Ban}
                    label={e.status === 'disabled' ? 'Enable' : 'Disable'}
                    onClick={async () => {
                      const next = e.status === 'disabled' ? 'active' : 'disabled';
                      await statusMut.mutateAsync({ id: e.id, status: next });
                      toast.success(`Employee ${next === 'active' ? 'enabled' : 'disabled'}`);
                    }}
                  />
                  <ActionButton
                    icon={Trash2}
                    label="Delete"
                    destructive
                    onClick={() => setDeleteTarget({ id: e.id, name: e.name })}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleteEmployee.isPending && setDeleteTarget(null)}>
        {deleteTarget ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle>Delete AI Employee</DialogTitle>
                  <DialogDescription className="mt-1">
                    Are you sure you want to delete <span className="font-semibold text-foreground">{deleteTarget.name}</span>?
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogContent>
              <div className="space-y-3 pt-1">
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs leading-relaxed space-y-2">
                  <p className="font-semibold text-destructive">This action is permanent and cannot be undone:</p>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                    <li>Permanently removes this employee&apos;s persona, prompts, and system configuration</li>
                    <li>Deletes all associated FAQs, knowledge documents, scripts, and training records</li>
                    <li>Any phone numbers currently assigned to this employee will be unassigned</li>
                    <li>Past call logs and audio recordings will be kept safe for your reporting</li>
                  </ul>
                </div>
              </div>
            </DialogContent>
            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteEmployee.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                loading={deleteEmployee.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteEmployee.isPending ? 'Deleting...' : 'Delete Employee'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>

      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        {assignTarget ? (
          <>
            <DialogHeader>
              <DialogTitle>Assign a phone number to {assignTarget.name}</DialogTitle>
            </DialogHeader>
            <DialogContent>
              <div className="space-y-3">
                <Label>Phone number</Label>
                <Select
                  value={assignTarget.phoneId}
                  onChange={(e) => setAssignTarget((t) => t && { ...t, phoneId: e.target.value })}
                >
                  <option value="">Select a number</option>
                  {numbersData?.numbers
                    .filter((n) => n.status === 'active' && (!n.employee_id || String(n.employee_id) === String(assignTarget.id)))
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.number} {n.employee_id ? '(in use)' : '· ' + (n.provider || '')}
                      </option>
                    ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  {numbersData && !numbersData.numbers.some((n) => n.status === 'active')
                    ? 'No active numbers yet. '
                    : null}
                  Manage numbers in <Link className="text-primary underline" to="/phone-numbers">Phone Numbers</Link>.
                </p>
              </div>
            </DialogContent>
            <DialogFooter>
              <Button
                disabled={!assignTarget.phoneId}
                onClick={async () => {
                  try {
                    const parsedEmpId = typeof assignTarget.id === 'number' ? assignTarget.id : (parseInt(String(assignTarget.id), 10) || null);
                    await assign.mutateAsync({ id: Number(assignTarget.phoneId), employeeId: parsedEmpId });
                    toast.success('Number assigned');
                    setAssignTarget(null);
                  } catch {
                    toast.error('Assignment failed');
                  }
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}

function formatVoiceBadge(voice?: string | null) {
  if (!voice) return 'Default Voice';
  const clean = String(voice).split(':').pop() || '';
  if (clean.length > 20 || clean.includes('-')) {
    return 'Ultra-HD Clone ✨';
  }
  return clean;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  destructive,
}: {
  icon: typeof Phone;
  label: string;
  onClick: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-semibold transition-all shadow-xs cursor-pointer',
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25 shadow-md'
          : destructive
          ? 'bg-destructive/5 hover:bg-destructive/15 text-destructive border border-destructive/20 hover:border-destructive/40'
          : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}