import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api';
import { useCampaigns, useCreateLead, useDeleteLead, useEmployees, useLeads, useUpdateLead } from '@/hooks/queries';
import { formatDate, formatDateTime, titleCase } from '@/lib/utils';
import { LEAD_STATUSES, CALL_OUTCOMES, type Lead } from '@/types';

const LIMIT = 25;

const LEAD_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone *' },
  { key: 'company', label: 'Company' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'location', label: 'Location' },
  { key: 'email', label: 'Email' },
  { key: 'custom_message', label: 'Custom message' },
];

const AUTO_MATCH: Record<string, string[]> = {
  name: ['name', 'full name', 'lead', 'customer', 'customer name'],
  phone: ['phone', 'mobile', 'number', 'phone number', 'contact', 'mobile number'],
  company: ['company', 'organisation', 'organization', 'business'],
  purpose: ['purpose', 'reason', 'interest', 'product'],
  location: ['location', 'city', 'area', 'region'],
  email: ['email', 'e-mail', 'email address'],
  custom_message: ['message', 'custom_message', 'notes', 'remark', 'remarks'],
};

export function LeadsPage() {
  const toast = useToast();
  const { data: empData } = useEmployees();
  const { data: campData } = useCampaigns();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useLeads({
    q: debounced,
    status,
    outcome,
    employee_id: employeeId,
    campaign_id: campaignId,
    limit: LIMIT,
    offset: (page - 1) * LIMIT,
  });

  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();
  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Leads & Results</h1>
          <p className="text-sm text-muted-foreground">{total} leads in your pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 w-full"
                placeholder="Search name, phone or company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select className="w-auto min-w-[130px]" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}>
                <option value="">All employees</option>
                {empData?.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
              <Select className="w-auto min-w-[130px]" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setPage(1); }}>
                <option value="">All campaigns</option>
                {campData?.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select className="w-auto min-w-[115px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">All statuses</option>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
              <Select className="w-auto min-w-[125px]" value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }}>
                <option value="">All outcomes</option>
                {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
              </Select>
              {(status || outcome || employeeId || campaignId || search) ? (
                <Button variant="ghost" size="sm" onClick={() => { setStatus(''); setOutcome(''); setEmployeeId(''); setCampaignId(''); setSearch(''); }}>
                  <Filter className="h-3.5 w-3.5" /> Clear
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-6 w-6" />}
          title="No leads found"
          description={total === 0 ? 'Import a CSV or add your first lead to get started.' : 'Try changing your filters.'}
          actionLabel={total === 0 ? 'Import CSV' : undefined}
          onAction={total === 0 ? () => setImportOpen(true) : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setSelected(l)}>
                    <TableCell className="font-medium">{l.name || '—'}</TableCell>
                    <TableCell className="text-sm">{l.phone}</TableCell>
                    <TableCell className="text-sm">{l.company || '—'}</TableCell>
                    <TableCell className="text-sm">{l.campaign_name || '—'}</TableCell>
                    <TableCell className="text-sm">{l.employee_name || '—'}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell className="text-sm">{l.outcome ? titleCase(l.outcome) : '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{l.total_calls ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.next_followup ? formatDate(l.next_followup) : '—'}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          if (!confirm(`Delete lead ${l.name || l.phone}?`)) return;
                          await deleteLead.mutateAsync(l.id);
                          toast.success('Lead deleted');
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-3">
              <Pagination page={page} limit={LIMIT} total={total} onPageChange={setPage} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lead detail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <>
            <DialogHeader>
              <DialogTitle>{selected.name || selected.phone}</DialogTitle>
            </DialogHeader>
            <DialogContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={selected.status ?? ''}
                    onChange={(e) => setSelected({ ...selected, status: e.target.value })}
                  >
                    {LEAD_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Outcome</Label>
                  <Select value={selected.outcome ?? ''} onChange={(e) => setSelected({ ...selected, outcome: e.target.value })}>
                    <option value="">—</option>
                    {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Interest</Label>
                  <Select value={selected.interest ?? ''} onChange={(e) => setSelected({ ...selected, interest: e.target.value })}>
                    <option value="">—</option>
                    <option>Hot</option>
                    <option>Warm</option>
                    <option>Cold</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Next follow-up</Label>
                  <Input
                    type="date"
                    value={selected.next_followup ? selected.next_followup.slice(0, 10) : ''}
                    onChange={(e) => setSelected({ ...selected, next_followup: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2 rounded-lg border p-3 text-sm">
                <Row label="Phone" value={selected.phone} />
                <Row label="Company" value={selected.company || '—'} />
                <Row label="Location" value={selected.location || '—'} />
                <Row label="Email" value={selected.email || '—'} />
                <Row label="Created" value={formatDateTime(selected.created_at)} />
                <Row label="Total calls" value={String(selected.total_calls ?? 0)} />
              </div>
            </DialogContent>
            <DialogFooter>
              <Button
                onClick={async () => {
                  try {
                    await updateLead.mutateAsync({
                      id: selected.id,
                      payload: {
                        status: selected.status,
                        outcome: selected.outcome,
                        interest: selected.interest,
                        next_followup: selected.next_followup,
                      },
                    });
                    toast.success('Lead updated');
                    setSelected(null);
                  } catch (err) {
                    toast.error('Update failed', err instanceof ApiClientError ? err.message : '');
                  }
                }}
              >
                Save changes
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>

      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} />
      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function AddLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const create = useCreateLead();
  const [form, setForm] = useState({ name: '', phone: '', company: '', purpose: '', location: '', email: '', custom_message: '' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Add a lead</DialogTitle>
      </DialogHeader>
      <DialogContent className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Phone *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
        <Field label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
        <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Purpose" value={form.purpose} onChange={(v) => setForm({ ...form, purpose: v })} />
      </DialogContent>
      <DialogFooter>
        <Button
          loading={create.isPending}
          disabled={!form.phone.trim()}
          onClick={async () => {
            try {
              const res = await create.mutateAsync(form);
              toast.success(res.updated ? 'Existing lead updated' : 'Lead added');
              setForm({ name: '', phone: '', company: '', purpose: '', location: '', email: '', custom_message: '' });
              onOpenChange(false);
            } catch (err) {
              toast.error('Could not add lead', err instanceof ApiClientError ? err.message : '');
            }
          }}
        >
          <Plus className="h-4 w-4" /> Add lead
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ImportLeadsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: empData } = useEmployees();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [employeeId, setEmployeeId] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setPreview([]);
    setMapping({});
    setEmployeeId('');
  };

  const onFile = (f: File) => {
    setFile(f);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const cols = res.meta.fields ?? [];
        setHeaders(cols);
        setPreview(res.data.slice(0, 5));
        const auto: Record<string, string> = {};
        for (const field of LEAD_FIELDS) {
          const match = cols.find((c) => AUTO_MATCH[field.key]?.includes(c.toLowerCase().trim()));
          if (match) auto[field.key] = match;
        }
        setMapping(auto);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Import leads from CSV</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Upload className="h-6 w-6" />
          {file ? file.name : 'Click to select a CSV file'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />

        {headers.length > 0 ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {LEAD_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="w-28 text-xs text-muted-foreground">{f.label}</span>
                  <Select value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                    <option value="">— skip —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Assign to employee (optional)</Label>
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Unassigned</option>
                {empData?.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>{headers.slice(0, 5).map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t">
                      {headers.slice(0, 5).map((h) => <td key={h} className="max-w-[140px] truncate px-2 py-1.5 text-muted-foreground">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </DialogContent>
      <DialogFooter>
        <Button
          loading={saving}
          disabled={!file || !mapping.phone}
          onClick={async () => {
            if (!file) return;
            setSaving(true);
            try {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('mapping', JSON.stringify(mapping));
              if (employeeId) fd.append('employee_id', employeeId);
              const res = await api.upload<{ success: boolean; imported: number; skipped: number; total: number }>('/leads/import', fd);
              toast.success(`${res.imported} leads imported`, res.skipped ? `${res.skipped} skipped` : undefined);
              reset();
              onOpenChange(false);
            } catch (err) {
              toast.error('Import failed', err instanceof ApiClientError ? err.message : '');
            } finally {
              setSaving(false);
            }
          }}
        >
          Import leads
        </Button>
      </DialogFooter>
    </Dialog>
  );
}