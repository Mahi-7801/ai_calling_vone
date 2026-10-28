import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenText,
  FileText,
  GraduationCap,
  HelpCircle,
  MessageSquareQuote,
  Plus,
  Rocket,
  ScrollText,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api';
import { useEmployee, useEmployees } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/hooks/queries';
import { formatDateTime } from '@/lib/utils';
import type { AIEmployee } from '@/types';

export function TrainingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: empData, isLoading: empLoading } = useEmployees();
  const employees = empData?.employees ?? [];

  const paramEmp = params.get('employee');
  const employee = paramEmp
    ? (employees.find((e) => String(e.id) === String(paramEmp)) ?? employees[0])
    : employees[0];
  const employeeId = employee ? employee.id : null;

  const { data: detailData, isLoading: detailLoading, refetch } = useEmployee(employeeId);
  const detail = detailData?.employee;

  const [tab, setTab] = useState('knowledge');

  if (empLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Training Center</h1>
          <p className="text-sm text-muted-foreground">Add knowledge, FAQs and scripts to teach your AI employee.</p>
        </div>
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="No employees to train"
          description="Create an AI employee first, then come back to build its knowledge base."
          actionLabel="Create employee"
          onAction={() => navigate('/employees/new')}
        />
      </div>
    );
  }

  if (detailLoading || !detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const onSelectEmployee = (empId: string) => {
    setParams({ employee: empId });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/employees')}
          className="gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Training Center</h1>
          <p className="text-sm text-muted-foreground">Teach your AI employee with knowledge, FAQs and conversation examples.</p>
        </div>
        <Button onClick={async () => {
          if (!employeeId) return;
          try {
            const res = await api.post<{ success: boolean; version: number }>(`/employees/${employeeId}/train/publish`);
            toast.success(`Training published as v${res.version}`);
            refetch();
          } catch (err) {
            toast.error('Publish failed', err instanceof ApiClientError ? err.message : '');
          }
        }}>
          <Rocket className="h-4 w-4" /> Publish Training
        </Button>
      </div>

      <Card className="border bg-card/60 shadow-xs">
        <CardContent className="p-3 sm:px-4 sm:py-2.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="h-4.5 w-4.5 shrink-0" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold text-foreground tracking-tight">{detail.name}</h2>
                  <StatusBadge status={detail.status} />
                  <span className="text-muted-foreground/40 text-xs hidden sm:inline">•</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {detail.role} · {detail.language}
                  </span>
                </div>
                <VersionInfo detail={detail} />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
              <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Training employee</Label>
              <div className="w-44 sm:w-52">
                <Select
                  className="w-full h-8 text-xs font-medium"
                  value={String(employeeId ?? '')}
                  onChange={(e) => onSelectEmployee(e.target.value)}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs>
        <TabsTrigger active={tab === 'knowledge'} onClick={() => setTab('knowledge')} count={detail.knowledge?.length}>
          <BookOpenText className="h-4 w-4" /> Knowledge
        </TabsTrigger>
        <TabsTrigger active={tab === 'faqs'} onClick={() => setTab('faqs')} count={detail.faqs?.length}>
          <HelpCircle className="h-4 w-4" /> FAQs
        </TabsTrigger>
        <TabsTrigger active={tab === 'scripts'} onClick={() => setTab('scripts')} count={detail.scripts?.length}>
          <ScrollText className="h-4 w-4" /> Scripts
        </TabsTrigger>
        <TabsTrigger active={tab === 'examples'} onClick={() => setTab('examples')} count={detail.examples?.length}>
          <MessageSquareQuote className="h-4 w-4" /> Examples
        </TabsTrigger>
        <TabsTrigger active={tab === 'instructions'} onClick={() => setTab('instructions')}>
          Instructions
        </TabsTrigger>
        <TabsTrigger active={tab === 'documents'} onClick={() => setTab('documents')} count={detail.docs?.length}>
          <FileText className="h-4 w-4" /> Documents
        </TabsTrigger>
      </Tabs>

      {tab === 'knowledge' ? <KnowledgeTab employee={detail} onChanged={refetch} /> : null}
      {tab === 'faqs' ? <FaqsTab employee={detail} onChanged={refetch} /> : null}
      {tab === 'scripts' ? <ScriptsTab employee={detail} onChanged={refetch} /> : null}
      {tab === 'examples' ? <ExamplesTab employee={detail} onChanged={refetch} /> : null}
      {tab === 'instructions' ? <InstructionsTab employee={detail} onChanged={refetch} /> : null}
      {tab === 'documents' ? <DocumentsTab employee={detail} onChanged={refetch} /> : null}
    </div>
  );
}

function VersionInfo({ detail }: { detail: AIEmployee }) {
  const v = detail.versions?.[0];
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
      <span className="inline-flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
        <span className="text-muted-foreground font-normal">Version</span> v{v?.version ?? 0}
        {v?.is_published ? <span className="text-emerald-600 dark:text-emerald-400 font-sans">· published</span> : ''}
      </span>
      <span className="text-muted-foreground/40 text-[11px]">•</span>
      <span className="text-[11px] text-muted-foreground">
        Last updated {formatDateTime(detail.training_updated_at ?? detail.updated_at)}
      </span>
    </div>
  );
}

interface TabProps {
  employee: AIEmployee;
  onChanged: () => void;
}

function useTrain() {
  const toast = useToast();
  const qc = useQueryClient();
  const run = async (employeeId: number, type: string, payload: Record<string, unknown>) => {
    try {
      await api.post(`/employees/${employeeId}/train`, { type, payload });
      qc.invalidateQueries({ queryKey: qk.employees });
      return true;
    } catch (err) {
      toast.error('Request failed', err instanceof ApiClientError ? err.message : '');
      return false;
    }
  };
  const remove = async (employeeId: number, kind: string, id: number) => {
    if (!confirm('Delete this training item?')) return;
    try {
      await api.post(`/employees/${employeeId}/train`, { type: 'delete', payload: { kind, id } });
      toast.success('Deleted');
    } catch (err) {
      toast.error('Delete failed', err instanceof ApiClientError ? err.message : '');
    }
  };
  return { run, remove };
}

function KnowledgeTab({ employee, onChanged }: TabProps) {
  const toast = useToast();
  const { run, remove } = useTrain();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const ok = await run(employee.id, 'knowledge', { title: title.trim() || 'Knowledge', content: content.trim() });
    if (ok) {
      toast.success('Knowledge added');
      setTitle('');
      setContent('');
      onChanged();
    }
    setSaving(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Add knowledge</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Company overview" />
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe product details, pricing, process…" />
          </div>
          <Button className="w-full" loading={saving} disabled={!content.trim()} onClick={save}>
            <Plus className="h-4 w-4" /> Add knowledge
          </Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Knowledge base</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!employee.knowledge || employee.knowledge.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No knowledge yet. The AI employee answers from its role and personality.</p>
          ) : (
            employee.knowledge.map((k) => (
              <div key={k.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-medium">{k.title}</p>
                  <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{k.content}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { void remove(employee.id, 'knowledge', k.id); onChanged(); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FaqsTab({ employee, onChanged }: TabProps) {
  const toast = useToast();
  const { run, remove } = useTrain();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const save = async () => {
    if (!question.trim()) return;
    const ok = await run(employee.id, 'faq', { question: question.trim(), answer: answer.trim() });
    if (ok) {
      toast.success('FAQ added');
      setQuestion('');
      setAnswer('');
      onChanged();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Add FAQ</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Question</Label>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What are your office hours?" />
          </div>
          <div className="space-y-1.5">
            <Label>Answer</Label>
            <Textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="The ideal answer the employee should give…" />
          </div>
          <Button className="w-full" disabled={!question.trim()} onClick={save}>
            <Plus className="h-4 w-4" /> Add FAQ
          </Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Frequently asked questions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!employee.faqs || employee.faqs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No FAQs yet. Add the questions your customers ask most.</p>
          ) : (
            employee.faqs.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{f.question}</p>
                  {f.answer ? <p className="mt-0.5 text-sm text-muted-foreground">{f.answer}</p> : null}
                </div>
                <Button variant="ghost" size="icon" onClick={() => { void remove(employee.id, 'faq', f.id); onChanged(); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScriptsTab({ employee, onChanged }: TabProps) {
  const toast = useToast();
  const { run, remove } = useTrain();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  const save = async () => {
    if (!content.trim()) return;
    const ok = await run(employee.id, 'script', { name: name.trim() || 'Script', content: content.trim() });
    if (ok) {
      toast.success('Script added');
      setName('');
      setContent('');
      onChanged();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Add script</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Script name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Opening pitch" />
          </div>
          <div className="space-y-1.5">
            <Label>Script content</Label>
            <Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the sales script the AI should follow…" />
          </div>
          <Button className="w-full" disabled={!content.trim()} onClick={save}>
            <Plus className="h-4 w-4" /> Add script
          </Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Sales scripts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!employee.scripts || employee.scripts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No scripts yet. Guide the AI with proven conversation flows.</p>
          ) : (
            employee.scripts.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="mt-0.5 line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">{s.content}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { void remove(employee.id, 'script', s.id); onChanged(); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExamplesTab({ employee, onChanged }: TabProps) {
  const toast = useToast();
  const { run, remove } = useTrain();
  const [customerText, setCustomerText] = useState('');
  const [idealResponse, setIdealResponse] = useState('');

  const save = async () => {
    if (!customerText.trim()) return;
    const ok = await run(employee.id, 'example', { customer_text: customerText.trim(), ideal_response: idealResponse.trim() });
    if (ok) {
      toast.success('Example added');
      setCustomerText('');
      setIdealResponse('');
      onChanged();
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Add example</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Customer says</Label>
            <Textarea rows={3} value={customerText} onChange={(e) => setCustomerText(e.target.value)} placeholder="e.g. నాకు ధర వివరాలు కావాలి" />
          </div>
          <div className="space-y-1.5">
            <Label>Ideal AI response</Label>
            <Textarea rows={4} value={idealResponse} onChange={(e) => setIdealResponse(e.target.value)} placeholder="The response you want in this situation…" />
          </div>
          <Button className="w-full" disabled={!customerText.trim()} onClick={save}>
            <Plus className="h-4 w-4" /> Add example
          </Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Conversation examples</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!employee.examples || employee.examples.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No training examples yet. Show the AI how to handle tough turns.</p>
          ) : (
            employee.examples.map((ex) => (
              <div key={ex.id} className="space-y-1.5 rounded-lg border p-3 text-sm">
                <p><span className="font-medium">Customer: </span>{ex.customer_text}</p>
                <p className="text-muted-foreground"><span className="font-medium">AI: </span>{ex.ideal_response}</p>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { void remove(employee.id, 'example', ex.id); onChanged(); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" /> Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InstructionsTab({ employee, onChanged }: TabProps) {
  const toast = useToast();
  const { run } = useTrain();
  const [instructions, setInstructions] = useState(employee.instructions ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await run(employee.id, 'instructions', { instructions });
    if (ok) {
      toast.success('Instructions saved');
      onChanged();
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle>Custom instructions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          These rules are injected into the employee's system prompt and applied on every call.
        </p>
        <Textarea
          rows={8}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Speak naturally like a real Telugu employee. Ask one question at a time. Wait for the customer response…"
        />
        <Button loading={saving} onClick={save} disabled={!instructions.trim()}>
          Save instructions
        </Button>
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ employee, onChanged }: TabProps) {
  const toast = useToast();
  const { remove } = useTrain();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const onFile = async (f: File) => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await api.upload<{ success: boolean; document: { id: number; name: string; status: string } }>(
        `/employees/${employee.id}/documents`,
        fd,
      );
      toast.success('Document uploaded', res.document.name);
      onChanged();
    } catch (err) {
      toast.error('Upload failed', err instanceof ApiClientError ? err.message : '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle>Upload document</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Upload className="h-6 w-6" />
            {saving ? 'Uploading…' : 'Choose a PDF or document'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.doc,.docx,.md" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <p className="text-xs text-muted-foreground">PDFs, text files and docs. Up to 10MB.</p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Knowledge sources ({employee.docs?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!employee.docs || employee.docs.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <FileText className="h-5 w-5" /> No documents uploaded yet.
            </div>
          ) : (
            employee.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.file_type ?? 'file'} · added {formatDateTime(d.created_at)}</p>
                </div>
                <StatusBadge status={d.status ?? 'ready'} />
                <Button variant="ghost" size="icon" onClick={() => { void remove(employee.id, 'doc', d.id); onChanged(); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}