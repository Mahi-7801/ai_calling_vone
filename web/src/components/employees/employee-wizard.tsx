import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Mic, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useCreateEmployee, useUpdateEmployee, usePhoneNumbers, useAssignPhoneNumber } from '@/hooks/queries';
import type { AIEmployee } from '@/types';
import { VoiceSelector } from './voice-selector';

interface Draft {
  // Step 1
  name: string;
  role: string;
  description: string;
  department: string;
  persona: string;
  language: string;
  language_code: string;
  // Step 2
  personality: string;
  tone: string;
  speaking_style: string;
  formality: string;
  greeting: string;
  objective: string;
  never_say: string;
  instructions: string;
  // Step 3 — Knowledge & Script
  knowledgeText: string;
  faqs: Array<{ question: string; answer: string }>;
  callSteps: Array<{ title: string; goal: string; example: string }>;
  // Step 4
  voice_provider: string;
  voice: string;
  voice_speed: number;
  voice_pitch: number;
  voice_stability: number;
  voice_naturalness: number;
  // Step 5
  max_call_duration: number;
  retry_attempts: number;
  call_timeout: number;
  goodbye_message: string;
  working_hours: { start: string; end: string; days: string };
  record_calls: boolean;
  transcript_enabled: boolean;
  human_transfer: boolean;
  outcome_detection: boolean;
  // Step 6
  phone_number_id: string;
}

const DEFAULTS: Draft = {
  name: '',
  role: 'Sales Assistant',
  description: '',
  department: 'Sales',
  persona: '',
  language: 'Telugu',
  language_code: 'te-IN',
  personality: 'Friendly, professional and patient.',
  tone: 'Natural Telugu conversation.',
  speaking_style: '',
  formality: 'Polite',
  greeting: 'నమస్తే, నేను {name}. మీకు రెండు నిమిషాలు ఉన్నాయా?',
  objective: '',
  never_say: '',
  instructions:
    'Speak naturally like a real Telugu employee.\nAsk one question at a time.\nWait for the customer response.\nDo not speak long paragraphs.\nDo not repeat questions unnecessarily.',
  knowledgeText: '',
  faqs: [],
  callSteps: [
    { title: 'Opening & Recall', goal: 'Introduce yourself and mention their recent enquiry. Build instant rapport.', example: 'నేను {name} అండి. మీరు recent గా enquiry చేసారు కదా, అందుకే call చేస్తున్నాను.' },
    { title: 'Understand Need', goal: 'Ask what they are looking for. Listen actively.', example: 'మీకు ఏ రకమైన సేవ/product కావాలో కొంచెం చెప్తారా అండి?' },
    { title: 'Qualify Budget', goal: 'Ask for budget range. If too low, politely explain and close.', example: 'మీ budget range ఎంత ఉంటుందో చెప్తారా అండి?' },
    { title: 'Book Next Step', goal: 'Book a visit, demo, or call-back. Confirm date and time.', example: 'మీకు ఎప్పుడు convenient గా ఉంటుంది అండి? date confirm చేసేద్దాం.' },
    { title: 'Close & Thank', goal: 'Thank them warmly. Confirm next steps. Offer WhatsApp for details.', example: 'ధన్యవాదాలు అండి! మీ details WhatsApp లో పంపిస్తాను.' },
  ],
  voice_provider: 'cartesia',
  voice: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b',
  voice_speed: 1,
  voice_pitch: 1,
  voice_stability: 0.7,
  voice_naturalness: 0.8,
  max_call_duration: 300,
  retry_attempts: 2,
  call_timeout: 30,
  goodbye_message: 'ధన్యవాదాలు, మీ రోజు బాగుండాలి.',
  working_hours: { start: '09:00', end: '19:00', days: 'Mon-Sat' },
  record_calls: true,
  transcript_enabled: true,
  human_transfer: false,
  outcome_detection: true,
  phone_number_id: '',
};

const STEPS = ['Basic info', 'Personality', 'Knowledge', 'Voice', 'Call behavior', 'Phone number', 'Test'];

const LANGUAGES = [
  { label: 'Telugu', code: 'te-IN' },
  { label: 'English', code: 'en-IN' },
  { label: 'Hindi', code: 'hi-IN' },
  { label: 'Tamil', code: 'ta-IN' },
  { label: 'Kannada', code: 'kn-IN' },
  { label: 'Malayalam', code: 'ml-IN' },
];

const ROLES = ['Sales Assistant', 'Lead Follow-up', 'Customer Support', 'Appointment Booker', 'Collections Agent', 'Survey Agent'];

function fromEmployee(e: AIEmployee): Draft {
  return {
    ...DEFAULTS,
    name: e.name ?? '',
    role: e.role ?? '',
    description: e.description ?? '',
    department: e.department ?? '',
    persona: e.persona ?? '',
    language: e.language ?? 'Telugu',
    language_code: e.language_code ?? 'te-IN',
    personality: e.personality ?? '',
    tone: e.tone ?? '',
    speaking_style: e.speaking_style ?? '',
    formality: e.formality ?? '',
    greeting: e.greeting ?? '',
    objective: e.objective ?? '',
    never_say: e.never_say ?? '',
    instructions: e.instructions ?? '',
    voice_provider: e.voice_provider ?? 'sarvam',
    voice: e.voice ?? '',
    voice_speed: Number(e.voice_speed ?? 1),
    voice_pitch: Number(e.voice_pitch ?? 1),
    voice_stability: Number(e.voice_stability ?? 0.7),
    voice_naturalness: Number(e.voice_naturalness ?? 0.8),
    max_call_duration: Number(e.max_call_duration ?? 300),
    retry_attempts: Number(e.retry_attempts ?? 2),
    call_timeout: Number(e.call_timeout ?? 30),
    goodbye_message: e.goodbye_message ?? '',
    record_calls: !!e.record_calls,
    transcript_enabled: !!e.transcript_enabled,
    human_transfer: !!e.human_transfer,
    outcome_detection: !!e.outcome_detection,
    phone_number_id: e.numbers?.[0]?.id ? String(e.numbers[0].id) : '',
  };
}

export function EmployeeWizard({ employee }: { employee?: AIEmployee }) {
  const isEdit = !!employee;
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(employee ? fromEmployee(employee) : DEFAULTS);
  const [createdId, setCreatedId] = useState<number | null>(employee?.id ?? null);
  const { data: numbersData } = usePhoneNumbers();
  const create = useCreateEmployee();
  const update = useUpdateEmployee(employee?.id ?? 0);
  const assign = useAssignPhoneNumber();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const canNext = () => {
    if (step === 0) return draft.name.trim().length > 0;
    return true;
  };

  const buildSystemPrompt = () => {
    const lines: string[] = [];
    lines.push(`You are ${draft.name}, a ${draft.role} at this company.`);
    if (draft.persona) lines.push(`Gender/persona: ${draft.persona}.`);
    if (draft.language) lines.push(`Primary language: ${draft.language}. Language code: ${draft.language_code}.`);
    if (draft.personality) lines.push(`Personality: ${draft.personality}`);
    if (draft.tone) lines.push(`Tone: ${draft.tone}`);
    if (draft.formality) lines.push(`Formality level: ${draft.formality}.`);
    if (draft.speaking_style) lines.push(`Speaking style: ${draft.speaking_style}`);
    if (draft.objective) lines.push(`\nObjective: ${draft.objective}`);
    if (draft.knowledgeText) lines.push(`\nCompany/Product Knowledge:\n${draft.knowledgeText}`);

    const activeSteps = draft.callSteps.filter((s) => s.goal.trim());
    if (activeSteps.length > 0) {
      lines.push(`\nCALL SCRIPT — follow these steps IN ORDER:`);
      activeSteps.forEach((s, i) => {
        lines.push(`Step ${i + 1} — ${s.title}: ${s.goal}`);
        if (s.example) lines.push(`  Example: "${s.example}"`);
      });
    }

    const activeFaqs = draft.faqs.filter((f) => f.question.trim());
    if (activeFaqs.length > 0) {
      lines.push(`\nFAQs — answer ONLY from this list; if not listed, say you'll follow up:`);
      activeFaqs.forEach((f) => lines.push(`Q: ${f.question}  A: ${f.answer}`));
    }

    if (draft.instructions) lines.push(`\nCustom instructions:\n${draft.instructions}`);
    if (draft.never_say) lines.push(`\nNEVER say:\n${draft.never_say}`);

    lines.push(`\nPHONE CALL RULES (always follow):
- Respond in ${draft.language} only. Match the customer's language if they switch.
- Keep each reply to 1-2 short sentences. NEVER end mid-sentence.
- Ask ONE question at a time. Wait for the customer's full response before moving on.
- Sound like a warm, friendly real human — not a robot.
- If customer is unclear, gently ask them to repeat once.`);

    return lines.join('\n');
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      name: draft.name,
      role: draft.role,
      description: draft.description,
      department: draft.department,
      persona: draft.persona,
      language: draft.language,
      language_code: draft.language_code,
      personality: draft.personality,
      tone: draft.tone,
      speaking_style: draft.speaking_style,
      formality: draft.formality,
      greeting: draft.greeting,
      objective: draft.objective,
      never_say: draft.never_say,
      instructions: draft.instructions,
      system_prompt: buildSystemPrompt(),
      max_call_duration: draft.max_call_duration,
      retry_attempts: draft.retry_attempts,
      call_timeout: draft.call_timeout,
      goodbye_message: draft.goodbye_message,
      working_hours: draft.working_hours,
      record_calls: draft.record_calls,
      transcript_enabled: draft.transcript_enabled,
      human_transfer: draft.human_transfer,
      outcome_detection: draft.outcome_detection,
      voice_provider: draft.voice_provider,
      voice: draft.voice,
      voice_speed: draft.voice_speed,
      voice_pitch: draft.voice_pitch,
      voice_stability: draft.voice_stability,
      voice_naturalness: draft.voice_naturalness,
    };
    if (!isEdit) {
      payload.knowledge = {
        text: draft.knowledgeText ? [{ title: 'Company knowledge', content: draft.knowledgeText }] : [],
        faqs: draft.faqs.filter((f) => f.question),
        scripts: [],
      };
    }
    return payload;
  };

  const save = async (): Promise<number | null> => {
    try {
      if (isEdit && employee) {
        await update.mutateAsync(buildPayload());
        toast.success('Employee updated');
        return employee.id;
      }
      const res = await create.mutateAsync(buildPayload());
      setCreatedId(res.employee.id);
      toast.success('Employee created');
      return res.employee.id;
    } catch (err) {
      toast.error('Save failed', err instanceof ApiClientError ? err.message : 'Please try again.');
      return null;
    }
  };

  const onNext = async () => {
    if (step === 2 && !createdId) {
      const id = await save();
      if (!id) return;
      setStep((s) => s + 1);
      return;
    }
    if (step === 3 && isEdit && createdId) {
      await save();
    }
    setStep((s) => s + 1);
  };

  const onFinish = async () => {
    let id = createdId;
    if (!id) id = await save();
    if (!id) return;
    if (draft.phone_number_id) {
      try {
        await assign.mutateAsync({ id: Number(draft.phone_number_id), employeeId: id });
      } catch {
        toast.error('Could not assign phone number');
      }
    }
    toast.success(isEdit ? 'Employee saved' : 'Employee created 🎉', 'You can now test and start calling.');
    navigate(`/employees/${id}/talk`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{isEdit ? `Edit ${employee?.name}` : 'Create a new AI employee'}</h1>
        <p className="text-sm text-muted-foreground">Define personality, voice, knowledge and call behavior.</p>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              i === step ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-xs', i === step ? 'bg-white/20' : 'bg-muted')}>
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{s}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Employee name *</Label>
                <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Priya" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={draft.role} onChange={(e) => set('role', e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={draft.department} onChange={(e) => set('department', e.target.value)} placeholder="Sales" />
              </div>
              <div className="space-y-1.5">
                <Label>Gender / persona</Label>
                <Select value={draft.persona} onChange={(e) => set('persona', e.target.value)}>
                  <option value="">Neutral</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select
                  value={draft.language}
                  onChange={(e) => {
                    const l = LANGUAGES.find((x) => x.label === e.target.value);
                    set('language', e.target.value);
                    if (l) set('language_code', l.code);
                  }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code}>{l.label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language code</Label>
                <Input readOnly value={draft.language_code} className="bg-muted" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Textarea rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Professional Telugu-speaking sales assistant." />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Personality</Label>
                <Input value={draft.personality} onChange={(e) => set('personality', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tone</Label>
                <Input value={draft.tone} onChange={(e) => set('tone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Speaking style</Label>
                <Input value={draft.speaking_style} onChange={(e) => set('speaking_style', e.target.value)} placeholder="Short, warm sentences" />
              </div>
              <div className="space-y-1.5">
                <Label>Formality</Label>
                <Select value={draft.formality} onChange={(e) => set('formality', e.target.value)}>
                  <option>Casual</option>
                  <option>Polite</option>
                  <option>Formal</option>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Greeting</Label>
                <Textarea rows={2} value={draft.greeting} onChange={(e) => set('greeting', e.target.value)} />
                <p className="text-xs text-muted-foreground">Use {'{name}'} to insert the employee name.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Objective</Label>
                <Input value={draft.objective} onChange={(e) => set('objective', e.target.value)} placeholder="Qualify the lead and book a demo." />
              </div>
              <div className="space-y-1.5">
                <Label>Things AI should never say</Label>
                <Textarea rows={2} value={draft.never_say} onChange={(e) => set('never_say', e.target.value)} placeholder="Do not promise discounts." />
              </div>
              <div className="space-y-1.5">
                <Label>Custom instructions</Label>
                <Textarea rows={2} value={draft.instructions} onChange={(e) => set('instructions', e.target.value)} />
              </div>
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground sm:col-span-2">
                Tip: keep instructions short and behavior-focused. The AI already speaks natural Telugu by default.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Text knowledge</Label>
                <Textarea rows={5} value={draft.knowledgeText} onChange={(e) => set('knowledgeText', e.target.value)} placeholder="Company info, product details, pricing, policies…" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>FAQs</Label>
                  <Button size="sm" variant="outline" onClick={() => set('faqs', [...draft.faqs, { question: '', answer: '' }])}>
                    <Plus className="h-3.5 w-3.5" /> Add FAQ
                  </Button>
                </div>
                {draft.faqs.map((f, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                    <Input
                      placeholder="Question"
                      value={f.question}
                      onChange={(e) => set('faqs', draft.faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Answer"
                        value={f.answer}
                        onChange={(e) => set('faqs', draft.faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                      />
                      <Button variant="ghost" size="icon" onClick={() => set('faqs', draft.faqs.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Call Script Steps */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Call Script Steps</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Define the conversation flow step-by-step. AI follows these in order.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => set('callSteps', [...draft.callSteps, { title: '', goal: '', example: '' }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add step
                  </Button>
                </div>
                {draft.callSteps.map((s, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{i + 1}</span>
                      <Input
                        placeholder="Step title (e.g. Ask Budget)"
                        value={s.title}
                        className="font-medium"
                        onChange={(e) => set('callSteps', draft.callSteps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      />
                      <Button variant="ghost" size="icon" onClick={() => set('callSteps', draft.callSteps.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="Goal / what AI should achieve in this step…"
                      value={s.goal}
                      onChange={(e) => set('callSteps', draft.callSteps.map((x, j) => (j === i ? { ...x, goal: e.target.value } : x)))}
                    />
                    <Input
                      placeholder='Example dialogue (optional) — e.g. "మీ budget ఎంత అండి?"'
                      value={s.example}
                      onChange={(e) => set('callSteps', draft.callSteps.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))}
                    />
                  </div>
                ))}
                {draft.callSteps.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No steps yet. Click "Add step" to build your call flow.
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                PDF & document uploads, plus website import, are managed from the <strong>Training</strong> center after
                the employee is created.
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Select Voice & Speech Persona</h3>
                  <p className="text-xs text-muted-foreground">
                    Choose from 11+ Pure Telugu voices, multilingual models, or your custom cloned voice.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 font-bold">
                    Pure Telugu Supported 🇮🇳
                  </Badge>
                </div>
              </div>

              {/* Dynamic Voice Selector with Search, Filters, and Audio Previews */}
              <VoiceSelector
                selectedVoiceId={draft.voice}
                selectedProvider={draft.voice_provider}
                onSelect={(v) => {
                  set('voice', v.id);
                  set('voice_provider', v.provider || 'cartesia');
                  if (v.language_name) set('language', v.language_name);
                  if (v.language) set('language_code', v.language);
                  toast.success(`Selected "${v.name}" (${v.badge || 'Neural Voice'})`);
                }}
              />

              <div className="grid gap-4 sm:grid-cols-2 pt-3 border-t">
                <SliderField label="Speaking speed" value={draft.voice_speed} min={0.5} max={1.5} step={0.05} onChange={(v) => set('voice_speed', v)} />
                <SliderField label="Pitch" value={draft.voice_pitch} min={0.5} max={1.5} step={0.05} onChange={(v) => set('voice_pitch', v)} />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Maximum call duration (seconds)</Label>
                <Input type="number" value={draft.max_call_duration} onChange={(e) => set('max_call_duration', Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Retry attempts</Label>
                <Input type="number" value={draft.retry_attempts} onChange={(e) => set('retry_attempts', Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Call timeout (seconds)</Label>
                <Input type="number" value={draft.call_timeout} onChange={(e) => set('call_timeout', Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Working hours</Label>
                <div className="flex items-center gap-2">
                  <Input type="time" value={draft.working_hours.start} onChange={(e) => set('working_hours', { ...draft.working_hours, start: e.target.value })} />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={draft.working_hours.end} onChange={(e) => set('working_hours', { ...draft.working_hours, end: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Goodbye message</Label>
                <Textarea rows={2} value={draft.goodbye_message} onChange={(e) => set('goodbye_message', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <Toggle label="Call recording" checked={draft.record_calls} onChange={(v) => set('record_calls', v)} />
                <Toggle label="Transcript" checked={draft.transcript_enabled} onChange={(v) => set('transcript_enabled', v)} />
                <Toggle label="Human transfer" checked={draft.human_transfer} onChange={(v) => set('human_transfer', v)} />
                <Toggle label="Call outcome detection" checked={draft.outcome_detection} onChange={(v) => set('outcome_detection', v)} />
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Assign an existing number</Label>
                <Select value={draft.phone_number_id} onChange={(e) => set('phone_number_id', e.target.value)}>
                  <option value="">No number for now</option>
                  {numbersData?.numbers.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.number} · {n.provider} · {n.status} {n.employee_id ? '(in use)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                You can buy and manage numbers from{' '}
                <button className="text-primary underline" onClick={() => navigate('/phone-numbers')}>
                  Phone Numbers
                </button>
                . Numbers are provided through VoBiz and future telephony providers.
              </p>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mic className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Talk to {draft.name || 'your employee'}</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Run a quick browser-based conversation to confirm the personality, language and voice before enabling
                  phone calling.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {createdId ? (
                  <Button variant="outline" onClick={() => navigate(`/employees/${createdId}/talk`)}>
                    <Mic className="h-4 w-4" /> Talk to Employee
                  </Button>
                ) : null}
                <Button onClick={onFinish} loading={create.isPending || update.isPending}>
                  <Check className="h-4 w-4" /> {isEdit ? 'Save Employee' : 'Create Employee'}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < 6 ? (
          <Button onClick={onNext} disabled={!canNext()} loading={create.isPending || update.isPending}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/30')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}