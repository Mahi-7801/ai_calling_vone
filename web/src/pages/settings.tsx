import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Mail,
  Phone as PhoneIcon,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  User,
  Webhook as WebhookIcon,
  Zap,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  useCreateWebhook,
  useDeleteWebhook,
  useSettings,
  useTestWebhook,
  useUpdateSettings,
  useUpdateWebhook,
  useWebhooks,
} from '@/hooks/queries';
import { cn, formatDateTime } from '@/lib/utils';
import type { Webhook } from '@/types';

const SECTIONS: Array<{ key: string; label: string; icon: typeof User }> = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'ai_defaults', label: 'AI Defaults', icon: Zap },
  { key: 'calling', label: 'Calling', icon: PhoneIcon },
  { key: 'notifications', label: 'Notifications', icon: Mail },
  { key: 'webhooks', label: 'Webhooks', icon: WebhookIcon },
  { key: 'api_keys', label: 'API Keys', icon: KeyRound },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'billing', label: 'Billing', icon: SlidersHorizontal },
];

const WEBHOOK_EVENTS = [
  'call.started',
  'call.connected',
  'call.completed',
  'call.failed',
  'lead.created',
  'lead.updated',
  'campaign.completed',
];

const ADMIN_ONLY_KEYS = ['ai_defaults', 'webhooks', 'api_keys'];

export function SettingsPage() {
  const { section = 'profile' } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data, isLoading } = useSettings();

  // Hide AI Defaults, Webhooks, and API Keys on the user side (non-admin)
  const visibleSections = useMemo(() => {
    if (isAdmin) return SECTIONS;
    return SECTIONS.filter((s) => !ADMIN_ONLY_KEYS.includes(s.key));
  }, [isAdmin]);

  // Protect against direct URL navigation for non-admin users
  useEffect(() => {
    if (!isAdmin && ADMIN_ONLY_KEYS.includes(section)) {
      navigate('/settings/profile', { replace: true });
    }
  }, [isAdmin, section, navigate]);

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 lg:grid-cols-4">
        <Skeleton className="h-72" />
        <Skeleton className="h-96 lg:col-span-3" />
      </div>
    );
  }

  const active = visibleSections.find((s) => s.key === section) ?? visibleSections[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace, preferences and integrations.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <nav className="flex flex-col gap-1 lg:sticky lg:top-20 lg:self-start">
          {visibleSections.map((s) => {
            const isAdminSection = ADMIN_ONLY_KEYS.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => navigate(`/settings/${s.key}`)}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active.key === s.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <s.icon className="h-4 w-4" /> {s.label}
                </span>
                {isAdminSection ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                    Admin
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="lg:col-span-3">
          {section === 'profile' ? <ProfileSection /> : null}
          {section === 'company' ? <CompanySection /> : null}
          {section === 'calling' ? <DataSection section="calling" title="Calling" /> : null}
          {section === 'notifications' ? <DataSection section="notifications" title="Notifications" /> : null}
          {section === 'security' ? <SecuritySection /> : null}
          {section === 'billing' ? <DataSection section="billing" title="Billing preferences" /> : null}
          {isAdmin && section === 'ai_defaults' ? <DataSection section="ai_defaults" title="AI defaults" /> : null}
          {isAdmin && section === 'webhooks' ? <WebhooksSection /> : null}
          {isAdmin && section === 'api_keys' ? <ApiKeysSection /> : null}
        </div>
      </div>
    </div>
  );
}

function ProfileSection() {
  const { data, refetch } = useSettings();
  const update = useUpdateSettings('profile');
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', avatar_url: '' });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.profile.name ?? '',
        phone: data.profile.phone ?? '',
        avatar_url: data.profile.avatar_url ?? '',
      });
    }
  }, [data]);

  return (
    <SectionCard title="Profile" description="Your name and contact details.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      </div>
      <div className="space-y-1.5">
        <Label>Avatar URL</Label>
        <Input value={form.avatar_url} placeholder="https://…" onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
      </div>
      <SaveBtn
        pending={update.isPending}
        disabled={!form.name.trim()}
        onClick={async () => {
          try {
            await update.mutateAsync(form);
            toast.success('Profile saved');
            refetch();
          } catch (err) {
            toast.error('Save failed', err instanceof ApiClientError ? err.message : '');
          }
        }}
      />
    </SectionCard>
  );
}

function CompanySection() {
  const { data, refetch } = useSettings();
  const update = useUpdateSettings('company');
  const toast = useToast();
  const [form, setForm] = useState({ name: '', business_type: '', calling_purpose: '', preferred_language: '' });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.organization.name ?? '',
        business_type: data.organization.business_type ?? '',
        calling_purpose: data.organization.calling_purpose ?? '',
        preferred_language: data.organization.preferred_language ?? 'Telugu',
      });
    }
  }, [data]);

  return (
    <SectionCard title="Company" description="Your business profile used in AI conversations.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Business type" value={form.business_type} onChange={(v) => setForm({ ...form, business_type: v })} />
        <Field label="Calling purpose" value={form.calling_purpose} onChange={(v) => setForm({ ...form, calling_purpose: v })} />
        <div className="space-y-1.5">
          <Label>Preferred language</Label>
          <Select value={form.preferred_language} onChange={(e) => setForm({ ...form, preferred_language: e.target.value })}>
            <option>Telugu</option>
            <option>Hindi</option>
            <option>English</option>
            <option>Kannada</option>
            <option>Tamil</option>
          </Select>
        </div>
      </div>
      <SaveBtn
        pending={update.isPending}
        disabled={!form.name.trim()}
        onClick={async () => {
          try {
            await update.mutateAsync(form);
            toast.success('Company saved');
            refetch();
          } catch (err) {
            toast.error('Save failed', err instanceof ApiClientError ? err.message : '');
          }
        }}
      />
    </SectionCard>
  );
}

function DataSection({ section, title }: { section: string; title: string }) {
  const { data, refetch } = useSettings();
  const update = useUpdateSettings(section);
  const toast = useToast();
  const base = useMemo(() => (data?.settings[section] ?? {}) as Record<string, unknown>, [data, section]);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) next[k] = String(v ?? '');
    setForm(next);
  }, [base]);

  return (
    <SectionCard title={title} description="These defaults apply to your AI employees.">
      {Object.keys(form).length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No settings stored yet. Save your preferences below and they'll be applied automatically.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys(form).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label>{k.replace(/_/g, ' ')}</Label>
              <Textarea
                rows={2}
                value={form[k] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      <SaveBtn
        pending={update.isPending}
        onClick={async () => {
          try {
            await update.mutateAsync({ data: form });
            toast.success(`${title} saved`);
            refetch();
          } catch (err) {
            toast.error('Save failed', err instanceof ApiClientError ? err.message : '');
          }
        }}
      />
    </SectionCard>
  );
}

function WebhooksSection() {
  const { data, refetch } = useWebhooks();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const del = useDeleteWebhook();
  const test = useTestWebhook();
  const toast = useToast();
  const [webhookDraft, setWebhookDraft] = useState<{ mode: 'new' | 'edit'; webhook: Webhook | null } | null>(null);

  const [livekitWebhookUrl, setLivekitWebhookUrl] = useState('');

  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
    fetch(`${base}/api/webhooks/livekit`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.livekit?.webhook_url) setLivekitWebhookUrl(res.livekit.webhook_url);
      })
      .catch(() => {});
  }, []);

  return (
    <SectionCard
      title="Webhooks"
      description="Send real-time events to your own systems and configure incoming carrier webhooks."
      action={
        <Button onClick={() => setWebhookDraft({ mode: 'new', webhook: null })}>
          <Send className="h-4 w-4" /> New webhook
        </Button>
      }
    >
      {/* LiveKit Cloud Incoming Webhook Integration Card */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <WebhookIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                LiveKit Cloud Webhook (Incoming)
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Ready
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Receives room life-cycle events, participant join/leave, and egress recording updates from LiveKit Cloud.
              </p>
            </div>
          </div>
          <a
            href="https://cloud.livekit.io/projects/p_5gwfu1z660w/settings/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Open LiveKit Webhook Settings
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={livekitWebhookUrl || `${window.location.origin}/api/webhooks/livekit`}
            className="font-mono text-xs bg-background/80"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = livekitWebhookUrl || `${window.location.origin}/api/webhooks/livekit`;
              navigator.clipboard.writeText(url);
              toast.success('LiveKit Webhook URL copied to clipboard');
            }}
            className="shrink-0"
          >
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1 leading-relaxed">
          <p className="font-semibold text-foreground">How to add in LiveKit Cloud:</p>
          <p>1. Open <a href="https://cloud.livekit.io/projects/p_5gwfu1z660w/settings/webhooks" target="_blank" rel="noopener noreferrer" className="text-primary underline">LiveKit Project Settings &gt; Webhooks</a></p>
          <p>2. Click <strong>"Create new webhook"</strong> and paste the URL above.</p>
          <p>3. Select events: <strong>Room Started</strong>, <strong>Room Finished</strong>, <strong>Participant Joined</strong>, <strong>Participant Left</strong>.</p>
          <p>4. Save — LiveKit automatically signs webhook requests with your project secret.</p>
        </div>
      </div>

      <div className="mb-3">
        <h3 className="text-sm font-semibold">Outgoing Customer Webhooks</h3>
        <p className="text-xs text-muted-foreground">Notify your internal CRM or backend when calls complete or leads are captured.</p>
      </div>
      {!data ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : data.webhooks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No webhooks configured.</p>
      ) : (
        <div className="space-y-3">
          {data.webhooks.map((w) => (
            <div key={w.id} className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{w.url}</p>
                  <StatusBadge status={w.is_active ? 'active' : 'disabled'} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{w.events.join(', ')}</p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  loading={test.isPending}
                  onClick={async () => {
                    try {
                      const res = await test.mutateAsync(w.url);
                      toast[res.ok ? 'success' : 'error'](res.ok ? 'Webhook delivered' : 'Webhook failed', res.response);
                    } catch (err) {
                      toast.error('Test failed', err instanceof ApiClientError ? err.message : '');
                    }
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Test
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWebhookDraft({ mode: 'edit', webhook: w })}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!confirm('Delete this webhook?')) return;
                    try {
                      await del.mutateAsync(w.id);
                      toast.success('Webhook deleted');
                    } catch (err) {
                      toast.error('Delete failed', err instanceof ApiClientError ? err.message : '');
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.deliveries.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">Recent deliveries</p>
          <div className="space-y-2">
            {data.deliveries.slice(0, 5).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0 truncate">
                  <p className="truncate font-mono text-xs">{d.event}</p>
                  <p className="truncate text-xs text-muted-foreground">{d.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  {d.attempts ? <span className="text-xs text-muted-foreground">{d.attempts} attempt(s)</span> : null}
                  <StatusBadge status={d.status} />
                  <span className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {webhookDraft ? (
        <WebhookDialog
          webhook={webhookDraft.webhook}
          onOpenChange={() => setWebhookDraft(null)}
          onSaved={() => {
            setWebhookDraft(null);
            refetch();
          }}
          onCreate={async (payload) => create.mutateAsync(payload)}
          onUpdate={async (id, payload) => update.mutateAsync({ id, payload })}
        />
      ) : null}
    </SectionCard>
  );
}

function WebhookDialog({
  webhook,
  onOpenChange,
  onSaved,
  onCreate,
  onUpdate,
}: {
  webhook: Webhook | null;
  onOpenChange: () => void;
  onSaved: () => void;
  onCreate: (payload: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: number, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>(WEBHOOK_EVENTS);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUrl(webhook?.url ?? '');
    setSecret(webhook?.secret ?? '');
    setEvents(webhook?.events ?? WEBHOOK_EVENTS);
    setIsActive(!!webhook?.is_active);
  }, [webhook]);

  const isEdit = !!webhook;

  const toggleEvent = (ev: string) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit webhook' : 'New webhook'}</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Webhook URL *</Label>
          <Input placeholder="https://your-server.example.com/hooks" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Secret</Label>
          <Input placeholder="Auto-generated if left blank" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </div>
        <div>
          <Label>Events</Label>
          <div className="mt-2 grid gap-1.5">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  checked={events.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                />
                <span className="font-mono text-xs">{ev}</span>
                {events.includes(ev) ? <CheckCircle2 className="ml-auto h-4 w-4 text-primary" /> : null}
              </label>
            ))}
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button
          loading={saving}
          disabled={!url.trim() || events.length === 0}
          onClick={async () => {
            setSaving(true);
            try {
              const payload = { url: url.trim(), events, secret: secret.trim() || undefined, is_active: isActive ? 1 : 0 };
              if (isEdit) await onUpdate(webhook.id, payload);
              else await onCreate(payload);
              toast.success(isEdit ? 'Webhook updated' : 'Webhook created');
              onSaved();
            } catch (err) {
              toast.error('Save failed', err instanceof ApiClientError ? err.message : '');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create webhook'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function ApiKeysSection() {
  const { data, refetch } = useSettings();
  const update = useUpdateSettings('api_keys');
  const toast = useToast();
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);

  return (
    <SectionCard title="API Keys" description="Keys for programmatic access to the AI calling API.">
      {newKey ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Key created</p>
          <p className="mt-1 break-all font-mono text-xs">{newKey}</p>
          <p className="mt-2 text-xs text-muted-foreground">Copy this key now — you won't see it again.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setNewKey(null)}>Done</Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Key name</Label>
            <Input placeholder="e.g. Production server" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button
            disabled={!name.trim()}
            loading={update.isPending}
            onClick={async () => {
              try {
                const res = await update.mutateAsync({ action: 'create', name: name.trim() });
                const created = res.apiKey as { value?: string } | undefined;
                setNewKey(created?.value ?? null);
                setName('');
                refetch();
              } catch (err) {
                toast.error('Create failed', err instanceof ApiClientError ? err.message : '');
              }
            }}
          >
            <KeyRound className="h-4 w-4" /> Create
          </Button>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {(data?.apiKeys ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          data?.apiKeys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{k.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{k.key_prefix}… {k.last_used_at ? `· last used ${formatDateTime(k.last_used_at)}` : ''}</p>
              </div>
              <StatusBadge status={k.is_active ? 'active' : 'disabled'} />
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!confirm(`Revoke key "${k.name}"?`)) return;
                  try {
                    await update.mutateAsync({ action: 'revoke', id: k.id });
                    toast.success('Key revoked');
                    refetch();
                  } catch (err) {
                    toast.error('Revoke failed', err instanceof ApiClientError ? err.message : '');
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" /> Revoke
              </Button>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function SecuritySection() {
  const toast = useToast();
  const update = useUpdateSettings('security');
  const [form, setForm] = useState({ current_password: '', new_password: '' });

  return (
    <SectionCard title="Security" description="Change your account password.">
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Current password</Label>
          <Input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
        </div>
      </div>
      <SaveBtn
        pending={update.isPending}
        disabled={!form.current_password || form.new_password.length < 6}
        onClick={async () => {
          try {
            await update.mutateAsync({ current_password: form.current_password, new_password: form.new_password });
            toast.success('Password updated');
            setForm({ current_password: '', new_password: '' });
          } catch (err) {
            toast.error('Password update failed', err instanceof ApiClientError ? err.message : '');
          }
        }}
      />
    </SectionCard>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
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

function SaveBtn({ pending, disabled, onClick }: { pending: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button loading={pending} disabled={disabled} onClick={onClick}>
      <Save className="h-4 w-4" /> Save changes
    </Button>
  );
}