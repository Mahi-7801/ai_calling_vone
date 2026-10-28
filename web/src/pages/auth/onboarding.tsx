import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bot, Building2, Check, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { api, ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'company', label: 'Company' },
  { key: 'business', label: 'Business' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'language', label: 'Language' },
  { key: 'employee', label: 'AI Employee' },
  { key: 'done', label: 'Done' },
];

const BUSINESS_TYPES = ['Real Estate', 'Education', 'Finance & Insurance', 'Ecommerce', 'Healthcare', 'Travel & Hospitality', 'Services', 'Other'];
const PURPOSES = ['Sales calls', 'Lead follow-up', 'Customer support', 'Appointment booking', 'Debt collection', 'Surveys & feedback', 'Other'];
const LANGUAGES = ['Telugu', 'English', 'Hindi', 'Tamil', 'Kannada', 'Malayalam'];

export function OnboardingPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company: '',
    business: '',
    purpose: '',
    language: 'Telugu',
    employee: { name: 'Priya', role: '', description: '', personality: '', instructions: '' },
  });

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submitCurrent = async (data: Record<string, unknown>): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; employeeId?: number }>('/organizations/onboarding', {
        step: step + 1,
        data,
      });
      qc.invalidateQueries();
      if (step === 4) {
        toast.success('AI employee created!', `ID: ${res.employeeId}`);
      }
      return true;
    } catch (err) {
      toast.error('Could not save step', err instanceof ApiClientError ? err.message : 'Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    setLoading(true);
    try {
      await api.post('/organizations/onboarding', { step: 6, data: {} });
      await refresh();
      toast.success('Workspace ready! 🎉');
      navigate('/dashboard', { replace: true });
    } catch {
      toast.error('Could not finish onboarding');
      setLoading(false);
    }
  };

  const canNext =
    (step === 0 && !!form.company.trim()) ||
    (step === 1 && !!form.business) ||
    (step === 2 && !!form.purpose) ||
    (step === 3 && !!form.language) ||
    step === 4 ||
    step === 5;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Welcome, {user?.name?.split(' ')[0]} 🎉</h1>
          <p className="mt-1 text-sm text-muted-foreground">Let's set up your AI calling workspace in under 2 minutes.</p>
        </div>

        {/* Stepper */}
        <ol className="mb-8 flex items-center justify-between gap-2">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                  i < step
                    ? 'border-primary bg-primary text-primary-foreground'
                    : i === step
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground',
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('hidden text-xs sm:block', i === step ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {step === 0 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">What's your company called?</h2>
                <p className="mt-1 text-sm text-muted-foreground">This name appears across your workspace and in employee prompts.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Company name</Label>
                <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Kumar Enterprises" autoFocus />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">What type of business is this?</h2>
                <p className="mt-1 text-sm text-muted-foreground">We'll use this to shape how your AI employees talk.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BUSINESS_TYPES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, business: b }))}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      form.business === b ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">What will your AI employees help with most?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pick the main calling purpose for now — you can expand later.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PURPOSES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, purpose: p }))}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      form.purpose === p ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Preferred language for conversations</h2>
                <p className="mt-1 text-sm text-muted-foreground">Telugu is fully supported today. English and more Indian languages are ready.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, language: l }))}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      form.language === l ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Create your first AI employee</h2>
                <p className="mt-1 text-sm text-muted-foreground">Meet Priya — your first Telugu-speaking employee. Tweak the basics below.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Employee name</Label>
                  <Input value={form.employee.name} onChange={(e) => setForm((f) => ({ ...f, employee: { ...f.employee, name: e.target.value } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={form.employee.role} onChange={(e) => setForm((f) => ({ ...f, employee: { ...f.employee, role: e.target.value } }))}>
                    <option value="">Select role</option>
                    <option>Sales Assistant</option>
                    <option>Lead Follow-up</option>
                    <option>Customer Support</option>
                    <option>Appointment Booker</option>
                    <option>Collections Agent</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={form.employee.description} onChange={(e) => setForm((f) => ({ ...f, employee: { ...f.employee, description: e.target.value } }))} placeholder="Professional Telugu-speaking sales assistant." />
              </div>
              <div className="space-y-1.5">
                <Label>Personality</Label>
                <Input value={form.employee.personality} onChange={(e) => setForm((f) => ({ ...f, employee: { ...f.employee, personality: e.target.value } }))} placeholder="Friendly, professional and patient." />
              </div>
              <div className="space-y-1.5">
                <Label>Instructions</Label>
                <Textarea rows={3} value={form.employee.instructions} onChange={(e) => setForm((f) => ({ ...f, employee: { ...f.employee, instructions: e.target.value } }))} placeholder="Speak naturally like a real Telugu employee. Ask one question at a time…" />
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                <Check className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">You're all set!</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Your workspace is ready. Head to the dashboard to add phone numbers, import leads, and launch your first
                  AI calling campaign.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
                <Bot className="h-5 w-5 text-primary" />
                <span>
                  <span className="font-medium">{form.employee.name || 'Priya'}</span> will be ready to talk on request.
                </span>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between border-t pt-5">
            <Button variant="ghost" onClick={back} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 5 ? (
              <Button
                disabled={!canNext}
                loading={loading}
                onClick={async () => {
                  const payload: Record<string, unknown> =
                    step === 0
                      ? { name: form.company }
                      : step === 1
                        ? { business_type: form.business }
                        : step === 2
                          ? { calling_purpose: form.purpose }
                          : step === 3
                            ? { language: form.language }
                            : {
                                name: form.employee.name,
                                role: form.employee.role,
                                description: form.employee.description,
                                personality: form.employee.personality,
                                instructions: form.employee.instructions,
                                language: form.language,
                                language_code: form.language === 'Telugu' ? 'te-IN' : 'en-IN',
                              };
                  const ok = await submitCurrent(payload);
                  if (ok) next();
                }}
              >
                {step === 4 ? 'Create employee' : 'Continue'} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button loading={loading} onClick={finish}>
                <PhoneCall className="h-4 w-4" /> Go to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}