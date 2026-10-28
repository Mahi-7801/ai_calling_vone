import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  MessageSquare,
  Play,
  Pause,
  ArrowLeft,
  Ban,
  Volume2,
  VolumeX,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Webhook,
  Copy,
  Plus,
  Mic,
  Trash2,
  Send,
  Loader2,
  UserCheck,
  Flame,
  FileText,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Target,
  ChevronDown,
  ChevronUp,
  Archive,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiClientError } from '@/lib/api';
import { fetchAudioObjectUrl } from '@/lib/audio';
import { formatTimeAgo, titleCase, formatDateTime } from '@/lib/utils';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { usePerformance, useVoices, useDeleteEmployee, usePhoneNumbers } from '@/hooks/queries';
import { useAuth } from '@/context/AuthContext';
import type { AIEmployee, VoiceOption as ApiVoice } from '@/types';
import { VoiceCloneModal } from './voice-clone-modal';
import { VoiceSelector, voiceLanguageName, LANGUAGE_CODES } from './voice-selector';

export interface VoiceOption {
  id: string;
  code: string;
  name: string;
  gender: 'Female' | 'Male';
  style: string;
  badge?: string;
  tier: 'premium' | 'standard' | 'value';
  provider?: 'sarvam' | 'cartesia';
}

/**
 * Which provider can actually serve a given voice id.
 *
 * A "provider:voice" id states its own provider. Cartesia ids are UUIDs,
 * while Sarvam speaker IDs are names or svc- identifiers.
 */
function voiceProviderFor(voice: string | null | undefined, _language?: string): string {
  const raw = String(voice || '').trim();
  if (raw.includes(':')) return raw.split(':')[0];
  if (/^svc-[a-z0-9-]+$/i.test(raw)) return 'sarvam';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw)) return 'cartesia';
  return 'sarvam';
}

export const DEFAULT_TEST_PHRASES: Record<string, string> = {
  Telugu: 'నమస్కారం అండి! మీరు చూస్తున్న ప్రాపర్టీ గురించి మాట్లాడటానికి కాల్ చేశాను.',
  Hindi: 'नमस्ते! मैं आपके प्रोजेक्ट के बारे में बात करने के लिए कॉल कर रहा हूँ।',
  Tamil: 'வணக்கம்! உங்கள் திட்டத்தைப் பற்றி பேச அழைக்கிறேன்.',
  Kannada: 'ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಯೋಜನೆಯ ಬಗ್ಗೆ ಮಾತನಾಡಲು ಕರೆ ಮಾಡುತ್ತಿದ್ದೇನೆ.',
  Malayalam: 'നമസ്കാരം! നിങ്ങളുടെ പ്രോജക്റ്റിനെക്കുറിച്ച് സംസാരിക്കാൻ വിളിക്കുകയാണ്.',
  Marathi: 'नमस्कार! मी तुमच्या प्रोजेक्टबद्दल बोलण्यासाठी कॉल केला आहे.',
  English: 'Hello! I am calling to discuss the property details with you.',
};

interface EmployeeWorkspaceProps {
  employee: AIEmployee;
  onUpdate: () => void;
}

type TabType =
  | 'overview'
  | 'leads'
  | 'script'
  | 'training'
  | 'actions'
  | 'outcomes'
  | 'voice'
  | 'voice-clone'
  | 'settings';

// Outcome colour per DB outcome slug, so a bar is always the same colour between
// renders and a glanceable positive/negative read.
const OUTCOME_TONES: Record<string, string> = {
  interested: '#22c55e',
  converted: '#16a34a',
  follow_up: '#f59e0b',
  callback: '#f97316',
  no_answer: '#94a3b8',
  busy: '#94a3b8',
  not_interested: '#ef4444',
  dnd: '#dc2626',
  wrong_number: '#dc2626',
  failed: '#ef4444',
};

function MetricTile({
  label,
  value,
  textValue,
  icon: Icon,
  accent,
  chip,
  footer,
  delta,
  loading,
  onClick,
}: {
  label: string;
  value?: number;
  textValue?: string;
  icon: typeof Users;
  accent: string;
  chip: string;
  footer: string;
  delta?: { text: string; dir: 'up' | 'down' | 'flat' } | null;
  loading?: boolean;
  onClick?: () => void;
}) {
  const DeltaIcon = delta?.dir === 'up' ? TrendingUp : delta?.dir === 'down' ? TrendingDown : Minus;
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`rounded-2xl border border-border/60 bg-card p-4 transition ${
        onClick ? 'cursor-pointer hover:border-primary/40 hover:shadow-sm' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${chip}`}>
          <Icon className={`h-3.5 w-3.5 ${accent}`} />
        </span>
      </div>

      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="mt-2 text-2xl font-black tabular-nums tracking-tight text-foreground">
          {textValue ?? value ?? 0}
        </p>
      )}

      {delta ? (
        <p
          className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${
            delta.dir === 'up' ? 'text-emerald-600' : delta.dir === 'down' ? 'text-rose-500' : 'text-muted-foreground'
          }`}
        >
          <DeltaIcon className="h-3 w-3" /> {delta.text}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">&nbsp;</p>
      )}

      <p className="mt-1 truncate text-[11px] text-muted-foreground">{footer}</p>
    </div>
  );
}

export function EmployeeWorkspace({ employee, onUpdate }: EmployeeWorkspaceProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { organization } = useAuth();
  const { data: phoneNumbersData } = usePhoneNumbers();
  const assignedNumber = useMemo(() => {
    const list = phoneNumbersData?.numbers ?? [];
    return list.find((p) => String(p.employee_id) === String(employee.id)) ?? null;
  }, [phoneNumbersData, employee.id]);
  const businessName = organization?.name || 'bujji';

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [status, setStatus] = useState<string>(employee.status || 'active');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingCartesia, setIsSyncingCartesia] = useState(false);

  const syncWithCartesia = async () => {
    setIsSyncingCartesia(true);
    try {
      const res = await api.post<{ success: boolean; agentId?: string; agentUrl?: string; message?: string }>(
        `/employees/${employee.id}/cartesia-sync`
      );
      if (res.agentId) {
        toast.success(res.message || 'Voice agent successfully synchronized!');
        onUpdate();
      } else {
        toast.error('Voice sync did not return an agent ID.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to sync voice agent.');
    } finally {
      setIsSyncingCartesia(false);
    }
  };

  const { data: perfData, isLoading: perfLoading, isError: perfError, refetch: refetchPerf } = usePerformance(employee.id);
  const perf = perfData?.performance;

  const leadsToday = perf?.leads.leads_today ?? 0;
  const qualifiedToday = perf?.leads.qualified_today ?? 0;
  const hotLeads = perf?.leads.hot_leads ?? 0;
  const hasAnsweredCalls = Number(perf?.totals?.completed_calls ?? employee.successful_calls ?? 0) > 0;
  const rawSpeed = perf?.speedToLeadSeconds ?? perf?.speedToLeadFallbackSeconds ?? null;
  const speedSeconds = rawSpeed !== null && rawSpeed >= 0 && hasAnsweredCalls ? rawSpeed : null;
  const speedLabel =
    speedSeconds === null
      ? '--'
      : speedSeconds === 0
        ? '< 1s'
        : speedSeconds >= 60
          ? `${Math.floor(speedSeconds / 60)}m ${speedSeconds % 60}s`
          : `${speedSeconds}s`;

  // Last 7 days of the server's 14-day series, labelled by weekday. isToday drives
  // the highlight so the user can see at a glance which bar is the current day.
  const weekCalls = (perf?.perDay ?? []).slice(-7).map((d, i, arr) => {
    const date = new Date(`${d.rawDay}T00:00:00`);
    return {
      key: d.rawDay,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calls: Number(d.calls || 0),
      minutes: Number(d.minutes || 0),
      isToday: i === arr.length - 1,
    };
  });
  const weekMax = Math.max(1, ...weekCalls.map((d) => d.calls));
  const weekTotal = weekCalls.reduce((s, d) => s + d.calls, 0);
  const weekBest = weekCalls.reduce((best, d) => (d.calls > best.calls ? d : best), weekCalls[0]);

  // Always render 7 slots, even before the query resolves, so the chart does not
  // reflow when data lands.
  const weekBars = weekCalls.length
    ? weekCalls
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({
        key: `empty-${label}`,
        label,
        dateLabel: '',
        calls: 0,
        minutes: 0,
        isToday: i === 6,
      }));

  const outcomes = perf?.outcomeDistribution ?? [];
  const outcomeTotal = perf?.outcomeTotal ?? 0;
  const qualifiedRate = leadsToday ? Math.round((qualifiedToday / leadsToday) * 100) : null;
  const totalLeads = perf?.leads.leads_total ?? leadsToday;
  const totalQualified = perf?.leads.qualified_total ?? qualifiedToday;
  const overallQualifiedRate = totalLeads ? Math.round((totalQualified / totalLeads) * 100) : null;
  const hotLeadList = perf?.hotLeadList ?? [];
  const needsAttentionList = perf?.needsAttentionList ?? [];

  const [focusList, setFocusList] = useState<'hot' | 'attention' | null>(null);
  const focusRows = focusList === 'hot' ? hotLeadList : needsAttentionList;
  const focusTitle = focusList === 'hot' ? 'Hot leads · waiting on you' : 'Needs attention · not yet reached';
  const focusEmpty =
    focusList === 'hot'
      ? 'No leads are waiting on a follow-up right now.'
      : 'Every lead assigned here has been reached.';

  const deltaLabel = (today: number, yesterday: number) => {
    if (!yesterday) return null;
    const diff = today - yesterday;
    if (diff === 0) return { text: 'same as yesterday', dir: 'flat' as const };
    return {
      text: `${diff > 0 ? '+' : ''}${diff} vs yesterday`,
      dir: diff > 0 ? ('up' as const) : ('down' as const),
    };
  };

  const dirtyRef = useRef(false);
  const [remoteUpdateNotice, setRemoteUpdateNotice] = useState<string | null>(null);

  useEffect(() => {
    if (employee?.status) {
      setStatus(employee.status);
    }
  }, [employee?.status]);

  // Someone else training or editing this employee changes its prompt and
  // knowledge. Reload so what is on screen matches what the employee will say,
  // but not while there are unsaved edits here, which that would discard.
  useRealtimeEvent(['employee.trained', 'employee.updated'], (d) => {
    if (d.id !== employee.id) return;
    if (dirtyRef.current) {
      setRemoteUpdateNotice('This employee changed in another tab. Save your edits, then reload to pick up the latest.');
      return;
    }
    onUpdate();
  });

  // Test Call Modal State
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [isCallingPhone, setIsCallingPhone] = useState(false);

  // Chat Simulation Modal State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string }>>([
    { sender: 'ai', text: employee.greeting || 'నమస్తే అండి! నేను మీ AI అసిస్టెంట్‌ని. ఎలా సహాయపడగలను?' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  /**
   * Drive one turn of the preview conversation.
   *
   * This used to POST to /telephony/simulate-turn, an endpoint that does not
   * exist, and swallow the 404 - so the "Live script & knowledge simulator" chat
   * replied with one of two hardcoded strings on every input. It now streams
   * from the same endpoint the Talk tab uses, which is a real Groq completion
   * built from this employee's prompt and trained knowledge.
   */
  const sendChatMessage = async (raw: string) => {
    const userText = raw.trim();
    if (!userText || chatLoading) return;

    setChatInput('');
    setChatLoading(true);
    const history = chatMessages
      .filter((m) => m.text)
      .slice(-10)
      .map((m) => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));

    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }, { sender: 'ai', text: '' }]);

    let reply = '';
    const patchReply = (text: string) =>
      setChatMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, text } : m)));

    try {
      await api.stream(
        `/employees/${employee.id}/chat-stream`,
        { message: userText, history },
        {
          onEvent: (event, data) => {
            if (event === 'delta') {
              reply += String(data.text ?? '');
              patchReply(reply);
            } else if (event === 'error') {
              patchReply(`(error) ${String(data.message ?? 'Something went wrong.')}`);
            }
          },
        },
      );
      if (!reply) patchReply('(no reply)');
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Could not reach the AI.';
      patchReply(`(error) ${message}`);
    } finally {
      setChatLoading(false);
    }
  };

  // Script State
  const [openingLine, setOpeningLine] = useState(
    employee.greeting || 'హలో అండి, {Lead Name} తో మాట్లాడుతున్నానా?'
  );
  const [scriptSteps, setScriptSteps] = useState([
    {
      id: 1,
      title: 'Context & Recall Enquiry',
      badge: 'start',
      description:
        "Say who you are and that you're calling about their recent enquiry for a property. Mention you'll help with details and next steps. For example: 'నేను ఇమ్రాన్ అండి, మీరు just enquiry చేసారు కదా property గురించి, అందుకే call చేస్తున్నాను.'",
    },
    {
      id: 2,
      title: 'Ask Area of Interest',
      description:
        "Ask which area/location they're interested in. React to their answer before moving on. For example: 'ఏ ఏరియాలో property చూస్తున్నారు అండి?'",
    },
    {
      id: 3,
      title: 'Ask Purpose (Living/Investment)',
      description:
        "Ask if they're looking for living or investment. Wait for their answer, acknowledge, then continue. For example: 'మీకు living కోసం property కావాలా, లేక investment కోసం వెతుకుతున్నారా?'",
    },
    {
      id: 4,
      title: 'Ask Budget Range',
      description:
        "Ask their budget range. If their budget is far below what you offer, explain politely: 'మా properties కాస్త ఎక్కువ range లో ఉంటాయి అండి, మీ budget కి match అవ్వకపోవచ్చు.'",
    },
    {
      id: 5,
      title: 'Book Site Visit',
      description:
        "If they're interested and budget fits, ask when they can come for a site visit: 'మీకు site visit కి ఎప్పుడు రావడం కుదురుతుంది అండి? date & time confirm చేసేద్దాం.'",
    },
    {
      id: 6,
      title: 'Close & Next Steps',
      description:
        "Thank them warmly, confirm next steps on WhatsApp: 'ధన్యవాదాలు అండి! మీకు visit confirm అయ్యింది, ఏదైనా ఇంకో doubt ఉంటే అడగొచ్చు.'",
    },
  ]);
  const [hungUpRules, setHungUpRules] = useState(
    'If they clearly say their budget is too low and do not want to visit, thank them and end.\nIf they firmly decline a visit or further contact, close politely and end.'
  );
  const [strictness, setStrictness] = useState<number>(2);
  const [swaraPrompt, setSwaraPrompt] = useState('');
  const [isSwaraRewriting, setIsSwaraRewriting] = useState(false);

  // Calling Policy State
  const [callDelay, setCallDelay] = useState('10');
  const [callingWindowStart, setCallingWindowStart] = useState('09:00');
  const [callingWindowEnd, setCallingWindowEnd] = useState('20:00');
  const [outsideHoursPolicy, setOutsideHoursPolicy] = useState('next_open');
  const [respectDnc, setRespectDnc] = useState(true);
  const [duplicateWindow, setDuplicateWindow] = useState('5');
  const [callingDays, setCallingDays] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  // Training / Knowledge State
  const [teachInput, setTeachInput] = useState('');
  const [knowledgeList, setKnowledgeList] = useState<Array<{ id: number; question: string; answer: string }>>(
    (employee.faqs as any) || [
      { id: 1, question: 'ప్రాజెక్ట్ లొకేషన్ ఎక్కడ?', answer: '...' },
      { id: 2, question: 'ధర ఎంత నుంచి మొదలవుతుంది?', answer: '...' },
    ]
  );
  // Training now persists through the API, so re-sync this list whenever the
  // employee record is reloaded (initial mount and after a remote update).
  useEffect(() => {
    if (employee.faqs) setKnowledgeList(employee.faqs as Array<{ id: number; question: string; answer: string }>);
  }, [employee.faqs]);
  const [tryInput, setTryInput] = useState('');
  const [tryOutput, setTryOutput] = useState('');

  // Outcomes State
  const [capturedVariables, setCapturedVariables] = useState([
    { key: 'area', label: 'Area of Interest', type: 'Free text' },
    { key: 'purpose', label: 'Purpose (Living/Investment)', type: 'Free text' },
    { key: 'budget', label: 'Budget Range', type: 'Free text' },
    { key: 'visit_datetime', label: 'Site Visit Date & Time', type: 'Free text' },
    { key: 'interest_level', label: 'Interest Level', type: 'Free text' },
  ]);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Voice State
  const [primaryLang, setPrimaryLang] = useState(employee.language || 'Telugu');
  const [secondaryLangs, setSecondaryLangs] = useState(['English', 'Hindi']);
const [selectedVoice, setSelectedVoice] = useState(employee.voice || '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioLoadingVoice, setAudioLoadingVoice] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Real voice list from the provider, so the language cards can show how many
  // voices exist and a language switch can move the selection to a voice that
  // actually exists instead of a hardcoded catalog id.
  const { data: voicesData, isLoading: voicesLoading } = useVoices();
  const allVoices: ApiVoice[] = useMemo(() => {
    if (!voicesData?.voices) return [];
    const all = (voicesData.voices as { all?: ApiVoice[] }).all;
    if (Array.isArray(all) && all.length > 0) return all;
    return [...((voicesData.voices as { cloned?: ApiVoice[] }).cloned || []), ...((voicesData.voices as { cartesia?: ApiVoice[] }).cartesia || [])];
  }, [voicesData]);

  const voiceCountByLang = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of allVoices) {
      const code = String(v.language_code || v.language || '').toLowerCase().split('-')[0];
      if (code) counts[code] = (counts[code] ?? 0) + 1;
    }
    return counts;
  }, [allVoices]);

  // Keeps primary language and the selected voice in step, using only voices the
  // provider actually returned.
  // ever moves to a voice the provider returned, so we never save a dead id.
  const applyPrimaryLang = (lang: string) => {
    setPrimaryLang(lang);
    const code = LANGUAGE_CODES[lang];
    if (DEFAULT_TEST_PHRASES[lang]) setCloneTestPhrase(DEFAULT_TEST_PHRASES[lang]);

    if (!code || allVoices.length === 0) return;
    const current = allVoices.find((v) => v.id === selectedVoice);
    const currentCode = current ? String(current.language_code || current.language || '').toLowerCase().split('-')[0] : null;
    if (currentCode === code) return;

    const firstMatch = allVoices.find((v) => {
      const c = String(v.language_code || v.language || '').toLowerCase().split('-')[0];
      return c === code;
    });
    if (firstMatch) setSelectedVoice(firstMatch.id);
  };

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, []);

  // Delete Employee State
  const deleteEmployee = useDeleteEmployee();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleDeleteEmployee = async () => {
    try {
      await deleteEmployee.mutateAsync(employee.id);
      toast.success(`Employee "${employee.name}" deleted successfully`);
      setIsDeleteModalOpen(false);
      navigate('/employees');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete employee');
    }
  };

  // Cartesia Voice Cloning State
  const [voiceCloneModalOpen, setVoiceCloneModalOpen] = useState(false);
  const [clonedVoices, setClonedVoices] = useState<Array<{ id: number; name: string; voice_id: string; sample_url: string | null }>>([]);

  const fetchClonedVoices = () => {
    api.get<{ success: boolean; voices: any[] }>('/employees/cloned-voices')
      .then((res) => {
        if (res.voices && Array.isArray(res.voices)) setClonedVoices(res.voices);
      })
      .catch(() => {});
  };

  const [cloneTestPhrase, setCloneTestPhrase] = useState(
    'నమస్కారం అండి! మీరు చూస్తున్న ప్రాపర్టీ గురించి మాట్లాడటానికి కాల్ చేశాను.'
  );
  const [isCloneTestingAudio, setIsCloneTestingAudio] = useState(false);

  const handleCloneTestAudio = async (voiceIdToTest: string) => {
    if (!cloneTestPhrase.trim()) {
      toast.error('Please enter a phrase to speak');
      return;
    }
    setIsCloneTestingAudio(true);
    try {
      await playVoiceSample(voiceIdToTest || selectedVoice, cloneTestPhrase);
    } finally {
      setIsCloneTestingAudio(false);
    }
  };

  useEffect(() => {
    fetchClonedVoices();
  }, []);

  const handleVoiceCloned = (voiceId: string) => {
    setSelectedVoice(voiceId);
    fetchClonedVoices();
    onUpdate();
  };

  // Settings State
  const [empName, setEmpName] = useState(employee.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [empRole, setEmpRole] = useState(employee.role);
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [recordingNotice, setRecordingNotice] = useState(employee.record_calls !== 0);
  const [aiDisclosure, setAiDisclosure] = useState(true);
  const [maxCallDuration, setMaxCallDuration] = useState(employee.max_call_duration || 600);
  const [goodbyeMessage, setGoodbyeMessage] = useState(
    employee.goodbye_message || "I'm so sorry, something went wrong on my end — I'll call you right back."
  );
  const [teluguEnhance] = useState(true);
  const [sayThisAndEnd, setSayThisAndEnd] = useState(false);
  const [fixedMessage, setFixedMessage] = useState('');
  const [answerCallback, setAnswerCallback] = useState(true);
  const [callbackMissed, setCallbackMissed] = useState(true);
  const [openingHoursMode, setOpeningHoursMode] = useState<'24/7' | 'custom'>('24/7');
  const [openHoursStart, setOpenHoursStart] = useState('09:00');
  const [openHoursEnd, setOpenHoursEnd] = useState('18:00');
  const [transferNumber, setTransferNumber] = useState('98765 43210');
  const [transferWhen, setTransferWhen] = useState('the caller asks for a person');
  const [selectedCategory, setSelectedCategory] = useState<'instant' | 'campaigns' | 'inbound'>('instant');
  const [isAdvancedPromptOpen, setIsAdvancedPromptOpen] = useState(false);
  const [customPromptRules, setCustomPromptRules] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [isSyncingLivekit, setIsSyncingLivekit] = useState(false);
  const [livekitInfo, setLivekitInfo] = useState<{
    configured: boolean;
    url: string;
    project: string;
    webhook_url: string;
  } | null>(null);

  useEffect(() => {
    api.get<{ success: boolean; livekit: any }>('/webhooks/livekit')
      .then((res) => {
        if (res.livekit) setLivekitInfo(res.livekit);
      })
      .catch(() => {});
  }, []);

  const handleSyncLivekit = async () => {
    setIsSyncingLivekit(true);
    try {
      const res = await api.post<{ success: boolean; sync: any; message: string }>(
        `/employees/${employee.id}/livekit-sync`
      );
      toast.success(res.message || 'Synced with LiveKit Cloud Agent!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to sync with LiveKit Cloud');
    } finally {
      setIsSyncingLivekit(false);
    }
  };

  // Every editable field in this workspace is local component state, so any
  // change to them means a save is pending. Watching the values (rather than
  // patching every setter) keeps this correct as fields are added.
  const editableSnapshot = JSON.stringify([
    empName, empRole, primaryLang, selectedVoice, status, maxCallDuration, recordingNotice,
    openingLine, goodbyeMessage, scriptSteps, hungUpRules, strictness, knowledgeList, teluguEnhance,
    sayThisAndEnd, fixedMessage, answerCallback, callbackMissed, openingHoursMode, transferNumber,
  ]);
  // Assigning a ref during render is what makes the realtime handler below see
  // the current value; it is not used to render anything.
  const lastSavedSnapshot = useRef(editableSnapshot);
  dirtyRef.current = editableSnapshot !== lastSavedSnapshot.current;

  // Save changes handler
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Compile system_prompt from the call script steps so the AI follows them during calls
      const compiledStepsPrompt = scriptSteps
        .map((s, idx) => `Step ${idx + 1} — ${s.title}: ${s.description}`)
        .join('\n');

      const compiledSystemPrompt = `You are ${empName}, a ${empRole} at this company.
Primary language: ${primaryLang}.

CALL SCRIPT — follow these steps IN ORDER:
${compiledStepsPrompt}

${knowledgeList.length > 0 ? `FAQs — answer ONLY from this list:\n${knowledgeList.map((k) => `Q: ${k.question}  A: ${k.answer}`).join('\n')}` : ''}

${hungUpRules ? `End the call if:\n${hungUpRules}` : ''}

PHONE CALL RULES (always follow):
- Respond in ${primaryLang} only. Match customer language if they switch.
- Keep each reply to 1-2 short sentences. NEVER end mid-sentence.
- Ask ONE question at a time. Wait for the customer's full response before moving on.
- Sound like a warm, friendly real human — not a robot.
- If customer is unclear, gently ask them to repeat once.`;

      await api.put(`/employees/${employee.id}`, {
        name: empName,
        role: empRole,
        greeting: openingLine,
        goodbye_message: goodbyeMessage,
        language: primaryLang,
        voice: selectedVoice,
        // Hardcoding 'cartesia' here silently overwrote the employee's real
        // provider on every save, so a Sarvam (or cloned) voice was never
        // actually used. A "provider:voice" id names its provider; otherwise
        // infer it from the language's voice catalog.
        voice_provider: voiceProviderFor(selectedVoice, primaryLang),
        max_call_duration: maxCallDuration,
        record_calls: recordingNotice ? 1 : 0,
        instructions: scriptSteps.map((s, idx) => `${idx + 1}. ${s.title}: ${s.description}`).join('\n\n'),
        system_prompt: compiledSystemPrompt,
      });

      toast.success('Changes saved successfully!');
      setRemoteUpdateNotice(null);
      onUpdate();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
      // Re-baseline on the next render now the saved values are in place.
      lastSavedSnapshot.current = editableSnapshot;
    }
  };

  // Toggle Status
  const toggleStatus = async () => {
    const nextStatus = status === 'disabled' ? 'active' : status === 'active' ? 'paused' : 'active';
    setStatus(nextStatus);
    try {
      await api.post(`/employees/${employee.id}/status`, { status: nextStatus });
      toast.success(
        status === 'disabled'
          ? 'Employee enabled'
          : `Employee ${nextStatus === 'active' ? 'resumed' : 'paused'}`
      );
      onUpdate();
    } catch {
      setStatus(status);
      toast.error('Failed to change status');
    }
  };

  // Trigger test phone call
  const handleMakeTestCall = async () => {
    if (!testPhoneNumber.trim()) {
      toast.error('Please enter a valid phone number');
      return;
    }
    setIsCallingPhone(true);
    try {
      await api.post('/calls/instant', {
        employee_id: employee.id,
        phone: testPhoneNumber,
        phone_number: testPhoneNumber,
        customer_name: 'Test Caller',
        purpose: 'Test Call from Workspace',
        is_test: true,
      });
      toast.success(`Calling ${testPhoneNumber} now... Answer your phone!`);
      setIsTestCallOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to initiate test call');
    } finally {
      setIsCallingPhone(false);
    }
  };

  // Voice Preview Sample Player with Live TTS API
  const playVoiceSample = async (voiceId: string, sampleText?: string) => {
    if (playingVoice === voiceId) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      setPlayingVoice(null);
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    setAudioLoadingVoice(voiceId);
    try {
      const res = await api.post<{ success: boolean; audioUrl: string }>('/employees/voice-sample', {
        voice: voiceId,
        language: primaryLang,
        text: sampleText,
      });

      if (res.audioUrl) {
        const audio = new Audio(res.audioUrl);
        activeAudioRef.current = audio;
        setPlayingVoice(voiceId);
        audio.onended = () => {
          setPlayingVoice(null);
          activeAudioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingVoice(null);
          activeAudioRef.current = null;
          toast.error('Failed to play audio stream');
        };
        await audio.play();
      } else {
        toast.error('No audio returned from voice synthesizer');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Voice preview failed');
    } finally {
      setAudioLoadingVoice(null);
    }
  };

  /**
   * Plays a cloned voice's preview.
   *
   * Prefers the stored clip (free and instant), but falls back to synthesising it
   * live when that clip cannot be played. Clones saved before the sample store
   * stopped lying about the container were written as WAV bytes named .mp3 and
   * served as audio/mpeg, so the browser refused them outright. Without this
   * fallback those existing clones looked permanently broken, and regenerating
   * each one by hand would mean paying the clone fee again.
   */
  const playCloneVoice = async (v: { id: number; voice_id: string; sample_url: string | null }) => {
    if (playingVoice === v.voice_id) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      setPlayingVoice(null);
      return;
    }

    if (!v.sample_url) {
      await playVoiceSample(v.voice_id, cloneTestPhrase);
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    setAudioLoadingVoice(v.voice_id);
    try {
      const playable = await fetchAudioObjectUrl(v.sample_url);
      const audio = new Audio(playable);
      activeAudioRef.current = audio;
      audio.onended = () => {
        setPlayingVoice(null);
        activeAudioRef.current = null;
      };
      audio.onerror = () => {
        activeAudioRef.current = null;
        setPlayingVoice(null);
        setAudioLoadingVoice(null);
        // Stored clip is unusable - synthesise it live instead of failing silently.
        playVoiceSample(v.voice_id, cloneTestPhrase);
      };
      await audio.play();
      setPlayingVoice(v.voice_id);
    } catch {
      setAudioLoadingVoice(null);
      playVoiceSample(v.voice_id, cloneTestPhrase);
    }
  };

  // Re-renders a clone's stored preview. The clone itself is fine; this only
  // regenerates the sample, and is free because it is the generation the clone
  // already paid for. Useful when the provider's model was cold at clone time.
  const regenerateClonePreview = async (id: number, voiceId: string) => {
    setAudioLoadingVoice(voiceId);
    try {
      const res = await api.post<{ success: boolean; sample_url: string }>(`/employees/cloned-voices/${id}/preview`);
      setClonedVoices((prev) => prev.map((c) => (c.id === id ? { ...c, sample_url: res.sample_url } : c)));
      toast.success('Preview regenerated');
    } catch (err: any) {
      toast.error(err?.message || 'Could not regenerate the preview yet');
    } finally {
      setAudioLoadingVoice(null);
    }
  };

  // Swara Script Assistant
  const handleSwaraRewrite = async () => {
    if (!swaraPrompt.trim()) return;
    setIsSwaraRewriting(true);
    try {
      const res = await api.post<{ success: boolean; reply: string }>('/employees/swara-chat', {
        messages: [
          { role: 'user', content: `Modify this script according to requirement: "${swaraPrompt}". Current steps: ${JSON.stringify(scriptSteps)}` }
        ],
        language: primaryLang,
      });

      if (res.reply) {
        toast.success('Script updated with Swara suggestions!');
        setScriptSteps((prev) => [
          ...prev,
          {
            id: prev.length + 1,
            title: 'Special Incentive & Objection Handler',
            description: res.reply,
          }
        ]);
        setSwaraPrompt('');
      }
    } catch {
      toast.error('Could not connect to Swara. Please try again.');
    } finally {
      setIsSwaraRewriting(false);
    }
  };

  // Add Knowledge fact
  const handleTeach = async () => {
    if (!teachInput.trim()) return;
    const fact = teachInput.trim();
    const question = fact.includes('?') ? fact.split('?')[0] + '?' : fact;
    const answer = fact.includes('?') ? fact.split('?')[1].trim() : fact;
    setTeachInput('');
    try {
      // Persist through the real training endpoint. Previously this only edited
      // local state, so the fact was folded into system_prompt on save and lost
      // if the user navigated away before saving.
      await api.post(`/employees/${employee.id}/train`, {
        type: 'faq',
        payload: { question, answer },
      });
      toast.success('New fact saved to memory!');
    } catch {
      toast.error('Could not save that fact');
    }
  };

  // Try text question
  const handleTryQuestion = () => {
    if (!tryInput.trim()) return;
    const match = knowledgeList.find((k) =>
      k.question.toLowerCase().includes(tryInput.toLowerCase()) || tryInput.toLowerCase().includes(k.question.toLowerCase())
    );
    if (match) {
      setTryOutput(match.answer);
    } else {
      setTryOutput(
        primaryLang === 'Telugu'
          ? 'క్షమించండి, ఈ సమాచారం నాకు ఇంకా నేర్పించలేదు. నేను మా టీమ్‌ని అడిగి తెలుసుకుంటాను.'
          : "I haven't been taught this fact yet, but I'll check with our senior team."
      );
    }
  };

  return (
    <div className="space-y-6 pb-16 min-w-0 max-w-full overflow-x-hidden">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/employees')} className="gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleStatus}
            className={`text-xs h-8 font-medium transition-colors ${
              status === 'active'
                ? 'border-amber-500/30 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400'
                : status === 'paused'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 font-semibold'
                : 'border-border text-foreground hover:bg-muted'
            }`}
            title={
              status === 'active'
                ? 'Temporarily pause all automated outbound & instant lead calling for this employee'
                : status === 'paused'
                ? 'Resume outbound calling and instant lead followups'
                : 'Enable employee'
            }
          >
            {status === 'disabled' ? (
              <>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                Enable Employee
              </>
            ) : status === 'active' ? (
              <>
                <Pause className="mr-1.5 h-3.5 w-3.5 text-amber-500 fill-amber-500/20" />
                Pause Calling
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
                Resume Calling
              </>
            )}
          </Button>

          <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs font-semibold h-8">
            {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save Changes
          </Button>
        </div>
      </div>

      {remoteUpdateNotice ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{remoteUpdateNotice}</span>
        </div>
      ) : null}

      {/* Main Employee Header Card */}
      <div className="rounded-2xl sm:rounded-3xl border border-border/60 bg-card p-3.5 sm:p-6 shadow-sm min-w-0 max-w-full">
        <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between min-w-0">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="relative flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-xl sm:text-2xl font-black text-white shadow-md shadow-purple-900/20">
              {employee.name.charAt(0).toUpperCase()}
              <span
                className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full border-2 border-card ${
                  status === 'active' ? 'bg-emerald-500' : status === 'disabled' ? 'bg-rose-500' : 'bg-amber-500'
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-lg sm:text-2xl font-extrabold text-foreground truncate">{employee.name}</h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] sm:text-xs font-semibold ${
                    status === 'disabled'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : status === 'paused'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {status === 'disabled' ? (
                    <>
                      <Ban className="h-3 w-3" /> Disabled
                    </>
                  ) : status === 'paused' ? (
                    <>
                      <Pause className="h-3 w-3" /> Paused
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </>
                  )}
                </span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-primary">
                  Instant lead
                </span>
                <span className="text-[11px] sm:text-xs text-muted-foreground truncate">· {employee.role}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                <span>
                  Joined{' '}
                  {employee.created_at
                    ? new Date(employee.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    : 'Recently'}
                </span>
                <span>·</span>
                <span>
                  {Math.round(Number(perf?.totals?.credits_used ?? employee.total_calls ?? 0))} credits used
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => navigate('/billing')}
                  className="font-medium text-primary hover:underline"
                >
                  View billing & transactions
                </button>
                <span>—</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-semibold text-foreground">
                  {selectedVoice} · {employee.language_code || 'te-IN'}
                </span>
                {employee.cartesia_agent_id ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 font-mono text-[10px] sm:text-[11px] font-medium text-purple-600 dark:text-purple-400"
                    title="Voice engine synchronized and active"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Voice Synced</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={syncWithCartesia}
                    disabled={isSyncingCartesia}
                    className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/5 px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/15 transition disabled:opacity-50 cursor-pointer"
                    title="Synchronize voice engine"
                  >
                    <Sparkles className="h-2.5 w-2.5 text-purple-500" />
                    {isSyncingCartesia ? 'Syncing...' : 'Sync Voice Engine'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(String(employee.id));
                    toast.success('Employee ID copied');
                  }}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  title="Copy Employee ID"
                >
                  <Copy className="h-3 w-3" /> ID
                </button>
              </div>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/employees/${employee.id}/talk`)}
              className="border-purple-500/30 bg-purple-500/5 text-purple-600 hover:bg-purple-500/10 dark:text-purple-400 text-xs h-8"
            >
              <Phone className="mr-1.5 h-3.5 w-3.5" /> Talk in Browser
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsChatOpen(true)}
              className="text-xs h-8"
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Chat
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTestCallOpen(true)}
              className="border-emerald-500/30 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400 text-xs h-8"
            >
              <Phone className="mr-1.5 h-3.5 w-3.5" /> Test Call
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(true)}
              className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 text-xs h-8 cursor-pointer"
              title={`Delete ${employee.name}`}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>

        {/* Paused Calling Alert Banner */}
        {status === 'paused' && (
          <div className="mt-4 sm:mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 sm:p-4 min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Pause className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Live Calling is Paused for {employee.name}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Automated lead follow-ups and campaign dials are on hold. You can still test in browser or edit scripts. Click &quot;Resume Calling&quot; whenever you are ready.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={toggleStatus}
                className="shrink-0 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-8"
              >
                <Play className="mr-1.5 h-3.5 w-3.5 fill-white" /> Resume Calling
              </Button>
            </div>
          </div>
        )}

        {/* Warning / Call-to-action Banner */}
        <div className="mt-4 sm:mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 sm:p-4 min-w-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between min-w-0">
            <div className="space-y-1 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Listen to a call before you let this loose on customers
              </h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Reading the script tells you almost nothing about how it sounds. Call it yourself two or three times — interrupt it, go quiet, ask something it wasn&apos;t expecting, answer in the language your customers use. Every real call reaches a real person and can&apos;t be undone.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row shrink-0 items-stretch sm:items-center gap-2 pt-1 sm:pt-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsTestCallOpen(true)}
                className="w-full sm:w-auto text-xs border-amber-500/30 bg-card hover:bg-amber-500/10 h-8 font-medium"
              >
                Call my phone
              </Button>
              <Button
                size="sm"
                onClick={() => navigate(`/employees/${employee.id}/talk`)}
                className="w-full sm:w-auto text-xs bg-amber-600 hover:bg-amber-700 text-white h-8 font-medium"
              >
                Talk here in browser
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="flex border-b border-border/80 overflow-x-auto scrollbar-none min-w-0 max-w-full">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'leads', label: 'Instant leads' },
          { id: 'script', label: 'Call script' },
          { id: 'training', label: 'Training' },
          { id: 'actions', label: 'Actions' },
          { id: 'outcomes', label: 'Outcomes' },
          { id: 'voice', label: 'Voice ₹' },
          { id: 'settings', label: 'Settings' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`whitespace-nowrap px-4 py-3 text-xs font-semibold transition border-b-2 -mb-px ${
                isActive
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Subtitle Info Banner */}
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-purple-500/40 text-purple-600 dark:text-purple-400 text-[10px] font-bold">
          i
        </span>
        <span className="truncate">
          {activeTab === 'overview' && `Everything about ${employee.name} in one place.`}
          {activeTab === 'leads' && `Connect where your leads come from, so ${employee.name} calls each new one in seconds.`}
          {activeTab === 'script' && `What ${employee.name} says on a call... the opening line and the steps ${employee.name} follows.`}
          {activeTab === 'training' && `Teach ${employee.name} facts about your business so every answer is accurate.`}
          {activeTab === 'actions' && `Automations, webhooks and lead actions for ${employee.name}.`}
          {activeTab === 'outcomes' && `What happens after a call — the summary and the lead details ${employee.name} captured.`}
          {activeTab === 'voice' && `Voice, language and accent configuration for ${employee.name}.`}
          {activeTab === 'voice-clone' && `Clone your own real voice and let ${employee.name} speak like you.`}
          {activeTab === 'settings' && `Name, call limits and other options for ${employee.name}.`}
        </span>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Header strip: who this is, whether calling is on, and how fresh the numbers are */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-foreground">{employee.name}&apos;s day at a glance</h3>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : status === 'paused'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      status === 'active' ? 'animate-pulse bg-emerald-500' : status === 'paused' ? 'bg-amber-500' : 'bg-muted-foreground'
                    }`}
                  />
                  {status === 'active' ? 'Calling' : status === 'paused' ? 'Paused' : 'Off'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {leadsToday === 0
                  ? (perf?.leads?.leads_total ?? 0) > 0
                    ? `Ready for new leads · ${perf?.leads?.leads_total ?? 0} total leads (${weekTotal} calls in the last 7 days)`
                    : `Ready for calls · Automated dialer active`
                  : `${leadsToday} lead${leadsToday === 1 ? '' : 's'} today · ${weekTotal} call${weekTotal === 1 ? '' : 's'} in the last 7 days`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchPerf()}
              disabled={perfLoading}
              className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${perfLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {perfError || perf?.errors?.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {perfError
                  ? "Couldn't load these numbers. Showing nothing rather than guessing."
                  : `Partly unavailable: ${perf?.errors?.join(', ')}. Those panels may be empty rather than zero.`}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchPerf()} className="h-7 shrink-0 text-xs">
                Retry
              </Button>
            </div>
          ) : null}

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile
              loading={perfLoading}
              label={leadsToday > 0 ? 'Leads today' : 'Total leads'}
              value={leadsToday > 0 ? leadsToday : (perf?.leads.leads_total ?? 0)}
              icon={Users}
              accent="text-sky-500"
              chip="bg-sky-500/10"
              delta={
                leadsToday > 0
                  ? deltaLabel(leadsToday, perf?.leads.leads_yesterday ?? 0)
                  : perf?.leads.leads_yesterday
                  ? { text: `${perf.leads.leads_yesterday} yesterday`, dir: 'flat' }
                  : null
              }
              footer={leadsToday > 0 ? `${perf?.leads.leads_total ?? 0} all time` : `${perf?.leads.leads_total ?? 0} active contacts`}
            />
            <MetricTile
              loading={perfLoading}
              label={qualifiedToday > 0 ? 'Qualified today' : 'Qualified leads'}
              value={qualifiedToday > 0 ? qualifiedToday : (perf?.leads.qualified_total ?? qualifiedToday)}
              icon={UserCheck}
              accent="text-emerald-500"
              chip="bg-emerald-500/10"
              delta={qualifiedToday > 0 ? deltaLabel(qualifiedToday, perf?.leads.qualified_yesterday ?? 0) : null}
              footer={
                qualifiedToday > 0
                  ? `${qualifiedRate}% of today’s leads`
                  : overallQualifiedRate !== null
                  ? `${overallQualifiedRate}% qualification rate`
                  : 'from total contacts'
              }
            />
            <MetricTile
              loading={perfLoading}
              label="Avg speed"
              textValue={speedLabel}
              icon={Zap}
              accent="text-amber-500"
              chip="bg-amber-500/10"
              footer={speedSeconds === null ? 'instant response ready' : 'lead submitted → answered'}
            />
            <MetricTile
              loading={perfLoading}
              label="Hot leads"
              value={hotLeads}
              icon={Flame}
              accent="text-orange-500"
              chip="bg-orange-500/10"
              footer={hotLeads > 0 ? 'click to see who' : 'nothing waiting'}
              onClick={hotLeads > 0 ? () => setFocusList('hot') : undefined}
            />
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">Quick actions:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFocusList('hot')}
              disabled={hotLeads === 0}
              className={`h-7 rounded-full text-xs ${hotLeads > 0 ? 'border-orange-500/40 text-orange-600 hover:bg-orange-500/10' : ''}`}
            >
              <Flame className="mr-1.5 h-3 w-3 text-orange-500" /> Hot leads
              {hotLeads > 0 ? <span className="ml-1.5 rounded-full bg-orange-500/15 px-1.5 text-[10px] font-bold">{hotLeads}</span> : null}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFocusList('attention')}
              disabled={needsAttentionList.length === 0}
              className={`h-7 rounded-full text-xs ${needsAttentionList.length > 0 ? 'border-amber-500/40 text-amber-600 hover:bg-amber-500/10' : ''}`}
            >
              <AlertCircle className="mr-1.5 h-3 w-3 text-amber-500" /> Needs attention
              {needsAttentionList.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold">{needsAttentionList.length}</span>
              ) : null}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('leads')}
              className="h-7 rounded-full text-xs"
            >
              <Webhook className="mr-1.5 h-3 w-3" /> Lead webhook
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('script')}
              className="h-7 rounded-full text-xs"
            >
              <FileText className="mr-1.5 h-3 w-3" /> Call script
            </Button>
          </div>

          {/* Call Volume & Outcomes */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="rounded-2xl border border-border/60 bg-card p-5 lg:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> This week&apos;s calls
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {weekTotal > 0
                      ? `${weekTotal} outbound call${weekTotal === 1 ? '' : 's'} · busiest ${titleCase(weekBest?.label ?? '')}`
                      : 'Outbound calls made across the last 7 days'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  7 days
                </span>
              </div>

              {perfLoading ? (
                <Skeleton className="mt-5 h-40 w-full" />
              ) : (
                <>
                  <div className="mt-5 flex h-40 items-end gap-2">
                    {weekBars.map((d) => (
                      <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                        <span className="text-[11px] font-bold text-foreground opacity-0 transition group-hover:opacity-100">
                          {d.calls || ''}
                        </span>
                        <div
                          className={`w-full rounded-t-md transition-all ${
                            d.isToday ? 'bg-primary' : 'bg-primary/25 group-hover:bg-primary/50'
                          }`}
                          style={{ height: `${d.calls ? Math.max(8, Math.round((d.calls / weekMax) * 100)) : 3}%` }}
                          title={`${d.calls} call${d.calls === 1 ? '' : 's'}${d.dateLabel ? ` on ${d.dateLabel}` : ''}`}
                        />
                        <span
                          className={`text-[11px] ${d.isToday ? 'font-bold text-foreground' : 'text-muted-foreground'}`}
                        >
                          {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">{weekTotal}</span> calls this week
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">
                        {weekTotal ? (weekTotal / 7).toFixed(1) : '0'}
                      </span>{' '}
                      per day
                    </span>
                    <span>
                      <span className="font-semibold text-foreground">
                        {Math.round(weekCalls.reduce((s, d) => s + d.minutes, 0))}
                      </span>{' '}
                      min talk time
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-foreground">Outcome breakdown</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {outcomeTotal > 0 ? `How all ${outcomeTotal} scored calls ended` : 'How scored calls ended'}
              </p>

              {perfLoading ? (
                <div className="mt-5 space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              ) : outcomeTotal === 0 ? (
                <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-8 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Target className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-xs font-semibold text-foreground">No calls scored yet</p>
                  <p className="mt-1 max-w-[15rem] text-[11px] text-muted-foreground">
                    Once {employee.name} finishes a call, the result lands here automatically.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {outcomes.map((o) => (
                    <div key={o.outcome}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-foreground">{o.label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          <span className="font-bold text-foreground">{o.c}</span> · {o.percent}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(o.percent, 2)}%`,
                            background: OUTCOME_TONES[o.outcome] ?? '#8b5cf6',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Follow-up queue, driven by the two quick actions */}
          {focusList ? (
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground">{focusTitle}</h3>
                <Button variant="ghost" size="sm" onClick={() => setFocusList(null)} className="h-7 text-xs text-muted-foreground">
                  Close
                </Button>
              </div>

              {perfLoading ? (
                <div className="mt-4 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : focusRows.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                  {focusEmpty}
                </p>
              ) : (
                <div className="mt-4 divide-y divide-border/60">
                  {focusRows.map((row) => (
                    <div key={row.id} className="flex items-center gap-3 py-2.5">
                      <Avatar name={row.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{row.name || 'Unnamed lead'}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {row.phone}
                          {'company' in row && row.company ? ` · ${row.company}` : ''}
                          {'location' in row && row.location ? ` · ${row.location}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatTimeAgo(row.created_at)}</span>
                      {focusList === 'hot' ? (
                        <Badge
                          className={`shrink-0 text-[10px] ${
                            'outcome' in row && row.outcome === 'converted'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-orange-500/10 text-orange-600'
                          }`}
                        >
                          {titleCase(row.status)}
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 bg-amber-500/10 text-[10px] text-amber-600">
                          {'last_call_status' in row && row.last_call_status
                            ? titleCase(row.last_call_status)
                            : 'Never called'}
                        </Badge>
                      )}
                    </div>
                  ))}
                  <p className="pt-3 text-[11px] text-muted-foreground">
                    Showing {focusRows.length} of {focusList === 'hot' ? hotLeads : needsAttentionList.length}
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* Active Modes */}
          <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card p-5">
            <div>
              <h4 className="text-sm font-bold text-foreground">Active modes</h4>
              <p className="text-xs text-muted-foreground">Calls new leads instantly as soon as form submits</p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  status === 'active'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : status === 'paused'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground'
                }`}
              >
                {status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Disabled'}
              </span>
              <button
                type="button"
                onClick={toggleStatus}
                className={`h-6 w-11 rounded-full p-0.5 transition-colors ${
                  status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                }`}
                title={status === 'active' ? 'Click to Pause Calling' : 'Click to Resume Calling'}
              >
                <div
                  className={`h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    status === 'active' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INSTANT LEADS */}
      {activeTab === 'leads' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground">Connect where your leads come from</h3>
            <p className="text-xs text-muted-foreground">
              {employee.name} calls each new lead in seconds after they submit a Facebook, Google or website form.
            </p>
          </div>

          {/* Phone Number Callout */}
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-xs font-bold text-foreground">{employee.name} needs a phone number to call your leads</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Buy a number and assign it to {employee.name} to start making real calls. Everything here saves in the meantime.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate('/phone-numbers')} className="shrink-0 text-xs">
              Get a number
            </Button>
          </div>

          {/* Calling Policy Form */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-6">
            <h4 className="text-sm font-bold text-foreground">Calling policy</h4>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-foreground">Call delay</label>
                <p className="text-[11px] text-muted-foreground mb-1.5">Wait time after form submission before dialing</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={callDelay}
                    onChange={(e) => setCallDelay(e.target.value)}
                    className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold"
                  />
                  <span className="text-xs text-muted-foreground">seconds</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Calling window</label>
                <p className="text-[11px] text-muted-foreground mb-1.5">Daily time window for outbound lead calls</p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={callingWindowStart}
                    onChange={(e) => setCallingWindowStart(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <input
                    type="time"
                    value={callingWindowEnd}
                    onChange={(e) => setCallingWindowEnd(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Leads Outside Hours */}
            <div>
              <label className="text-xs font-semibold text-foreground">Leads outside calling hours</label>
              <p className="text-[11px] text-muted-foreground mb-2">What to do when a lead arrives late at night</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'next_open', label: 'Next open' },
                  { id: 'auto_send', label: 'Auto-send' },
                  { id: 'manual_release', label: 'Manual release' },
                  { id: 'skip', label: 'Skip' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOutsideHoursPolicy(opt.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                      outsideHoursPolicy === opt.id
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Calling Days */}
            <div>
              <label className="text-xs font-semibold text-foreground">Calling days</label>
              <p className="text-[11px] text-muted-foreground mb-2">Days {employee.name} is active to place calls</p>
              <div className="flex flex-wrap gap-1.5">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                  const isSelected = callingDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setCallingDays((prev) =>
                          isSelected ? prev.filter((d) => d !== day) : [...prev, day]
                        );
                      }}
                      className={`h-8 w-11 rounded-lg text-xs font-bold transition border ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* DNC and Duplicates */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-border/60">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={respectDnc}
                  onChange={(e) => setRespectDnc(e.target.checked)}
                  className="rounded border-border text-primary"
                />
                <span>Respect Do-Not-Call (DNC) list</span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Duplicate lead window:</span>
                <input
                  type="number"
                  value={duplicateWindow}
                  onChange={(e) => setDuplicateWindow(e.target.value)}
                  className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>

            <Button size="sm" onClick={() => toast.success('Calling policy saved!')} className="text-xs">
              Save calling policy
            </Button>
          </div>
        </div>
      )}

      {/* TAB 3: CALL SCRIPT */}
      {activeTab === 'script' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">{employee.name}’s call script</h3>
              <p className="text-xs text-muted-foreground">
                Spoken word-for-word opening line and sequential conversation milestones.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(
                  openingLine + '\n\n' + scriptSteps.map((s) => s.title + ': ' + s.description).join('\n')
                );
                toast.success('Script copied to clipboard');
              }}
              className="text-xs"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Script
            </Button>
          </div>

          {/* Opens With */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                Opens with
              </label>
              <span className="text-[11px] text-muted-foreground">
                Spoken word-for-word the moment the call connects
              </span>
            </div>

            <textarea
              value={openingLine}
              onChange={(e) => setOpeningLine(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* Variable pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground mr-1">Insert Variable:</span>
              {['{Lead Name}', '{Phone number}', '{Project/Property Name}'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setOpeningLine((prev) => `${prev} ${v}`)}
                  className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-mono text-foreground hover:bg-muted"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Script Steps */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Conversational Steps ({scriptSteps.length} milestones)
            </h4>

            {scriptSteps.map((step, idx) => (
              <div
                key={step.id}
                className="rounded-2xl border border-border/60 bg-card p-4 transition hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    <h5 className="text-xs font-bold text-foreground">{step.title}</h5>
                    {step.badge ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-600">
                        {step.badge}
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setScriptSteps((prev) => prev.filter((s) => s.id !== step.id))}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove step"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newId = scriptSteps.length + 1;
                setScriptSteps((prev) => [
                  ...prev,
                  {
                    id: newId,
                    title: `Step ${newId}: Custom Milestone`,
                    description: 'Ask relevant questions, qualify customer intent, and confirm next action.',
                  },
                ]);
              }}
              className="w-full text-xs border-dashed"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a step
            </Button>
          </div>

          {/* When the call ends rules */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              When the call ends
            </h4>
            <p className="text-xs text-muted-foreground">
              {employee.name} decides when to hang up from these rules — not from reaching any one section.
            </p>

            <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs">
              <span className="font-bold text-foreground">Built-in — always on: </span>
              <span className="text-muted-foreground">
                Ends the call when the purpose is done and the caller has nothing more.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">
                Your extra rules (one per line)
              </label>
              <textarea
                value={hungUpRules}
                onChange={(e) => setHungUpRules(e.target.value)}
                rows={3}
                placeholder="If they clearly say their budget is too low..."
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed"
              />
            </div>
          </div>

          {/* Swara AI Script Rewriter */}
          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
              <Sparkles className="h-4 w-4 fill-current" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Swara AI Script Assistant</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Say what you want changed and Swara rewrites or injects steps automatically.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={swaraPrompt}
                onChange={(e) => setSwaraPrompt(e.target.value)}
                placeholder="e.g. Add an urgency step offering 10% discount if they visit this Saturday"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
              <Button
                size="sm"
                onClick={handleSwaraRewrite}
                disabled={isSwaraRewriting || !swaraPrompt.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs shrink-0"
              >
                {isSwaraRewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Update script'}
              </Button>
            </div>

            {/* Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span>Try:</span>
              <button
                type="button"
                onClick={() => setSwaraPrompt('Make the conversation friendlier and more polite')}
                className="underline hover:text-foreground"
              >
                make call friendlier
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setSwaraPrompt('Add a handling step for high price objections')}
                className="underline hover:text-foreground"
              >
                handle price objection
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setSwaraPrompt('Add urgency before closing')}
                className="underline hover:text-foreground"
              >
                add urgency before closing
              </button>
            </div>
          </div>

          {/* Strictness Slider */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-foreground">How strictly {employee.name} follows it</h4>
                <p className="text-xs text-muted-foreground">
                  {strictness <= 2
                    ? 'Flexible: Treats your steps as a loose guide — follows caller lead and improvises (never invents facts).'
                    : 'Strict: Sticks rigidly to the scripted questions in order.'}
                </p>
              </div>
              <span className="text-sm font-black text-primary">{strictness} / 5</span>
            </div>

            <input
              type="range"
              min={1}
              max={5}
              value={strictness}
              onChange={(e) => setStrictness(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* TAB 4: TRAINING */}
      {activeTab === 'training' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground">Teach {employee.name} facts about your business</h3>
            <p className="text-xs text-muted-foreground">
              {knowledgeList.length} things taught · 0 open struggles from real calls
            </p>
          </div>

          {/* Practice with employee */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Practice with {employee.name}</h4>
            <p className="text-xs text-muted-foreground">
              Tell {employee.name} something — a price, a place, a rule to follow… Figures out fact vs rule before saving.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={teachInput}
                onChange={(e) => setTeachInput(e.target.value)}
                placeholder="e.g. Project has 100% power backup and club house open until 10pm"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
              <Button size="sm" onClick={handleTeach} className="text-xs shrink-0">
                Teach Fact
              </Button>
            </div>
          </div>

          {/* What employee knows */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <h4 className="text-xs font-bold text-foreground">What {employee.name} knows</h4>

            <div className="space-y-2">
              {knowledgeList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between rounded-xl border border-border/40 bg-muted/20 p-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-foreground">{item.question}</p>
                    <p className="mt-1 text-muted-foreground">{item.answer}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setKnowledgeList((prev) => prev.filter((k) => k.id !== item.id));
                      try {
                        await api.post(`/employees/${employee.id}/train`, {
                          type: 'delete',
                          payload: { kind: 'faq', id: item.id },
                        });
                      } catch {
                        toast.error('Could not remove that fact');
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive ml-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Try it (text) sandbox */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground">Try it (text sandbox)</h4>
              <span className="text-[11px] text-muted-foreground">Test knowledge recall without a phone call</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={tryInput}
                onChange={(e) => setTryInput(e.target.value)}
                placeholder="Ask a question to test recall..."
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
              <Button size="sm" variant="outline" onClick={handleTryQuestion} className="text-xs">
                Ask
              </Button>
            </div>

            {tryOutput ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                <span className="font-bold text-primary mr-1.5">{employee.name}:</span>
                {tryOutput}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB 5: OUTCOMES */}
      {activeTab === 'outcomes' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground">What {employee.name} captures on every call</h3>
            <p className="text-xs text-muted-foreground">
              Add details the agent should extract from the conversation to store with the lead.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            {capturedVariables.map((v) => (
              <div
                key={v.key}
                className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-2.5 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-primary mr-2">{v.key}</span>
                  <span className="text-foreground">{v.label}</span>
                </div>
                <span className="text-muted-foreground text-[11px]">{v.type}</span>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const key = prompt('Enter variable key (e.g. alternate_phone):');
                if (key) {
                  setCapturedVariables((prev) => [...prev, { key, label: key, type: 'Free text' }]);
                }
              }}
              className="text-xs border-dashed w-full"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add variable
            </Button>
          </div>

          {/* Post-call Webhooks */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Post-Call Webhooks</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                The instant a call ends, POST its recording URL, full transcript, duration, and outcome to your CRM.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-crm.com/api/webhooks/calls"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
              />
              <Button size="sm" onClick={() => toast.success('Webhook saved!')} className="text-xs shrink-0">
                Save Webhook
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: VOICE */}
      {activeTab === 'voice' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground">How {employee.name} sounds</h3>
            <p className="text-xs text-muted-foreground">Voice selection and speaking style.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Pick a language and we&apos;ll show you the voices that speak it natively.
            </p>
          </div>

          {/* Primary Language */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-foreground">Primary language</label>
              <span className="text-[11px] font-medium text-primary">Selected: {primaryLang}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {[
                { label: 'అ', name: 'Telugu', desc: 'Opens in Telugu' },
                { label: 'अ', name: 'Hindi', desc: 'Opens in Hindi' },
                { label: 'அ', name: 'Tamil', desc: 'Opens in Tamil' },
                { label: 'ಅ', name: 'Kannada', desc: 'Opens in Kannada' },
                { label: 'അ', name: 'Malayalam', desc: 'Opens in Malayalam' },
                { label: 'अ', name: 'Marathi', desc: 'Opens in Marathi' },
                { label: 'A', name: 'English', desc: 'Opens in English' },
              ].map((lang) => {
                const isSelected = primaryLang === lang.name;
                const code = LANGUAGE_CODES[lang.name];
                const count = voiceCountByLang[code] ?? 0;
                const hasNone = !voicesLoading && count === 0;
                return (
                  <button
                    key={lang.name}
                    type="button"
                    onClick={() => applyPrimaryLang(lang.name)}
                    className={`flex flex-col items-center justify-center rounded-2xl border p-3.5 text-center transition ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/50'
                        : 'border-border bg-card hover:bg-muted/40'
                    } ${hasNone && !isSelected ? 'opacity-60' : ''}`}
                  >
                    <span className="text-xl font-bold text-primary">{lang.label}</span>
                    <span className="mt-1 text-xs font-bold text-foreground">{lang.name}</span>
                    <span className="text-[10px] text-muted-foreground">{lang.desc}</span>
                    {!voicesLoading ? (
                      <span
                        className={`mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          count > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {count > 0 ? `${count} voice${count === 1 ? '' : 's'}` : 'No voices yet'}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {!voicesLoading && Object.values(voiceCountByLang).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No voices are available yet. Add a voice provider key or clone your own voice to get started.
              </p>
            ) : null}
          </div>

          {/* Also Speaks */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-foreground">Also speaks</label>
            <p className="text-xs text-muted-foreground">English is always on. Add secondary languages callers use.</p>
            <div className="flex flex-wrap gap-1.5">
              {['English', 'Hindi', 'Tamil', 'Kannada', 'Malayalam', 'Marathi'].map((lang) => {
                const isSelected = secondaryLangs.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setSecondaryLangs((prev) =>
                        isSelected ? prev.filter((l) => l !== lang) : [...prev, lang]
                      );
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cartesia Voice Cloning Banner */}
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-foreground">Clone Your Own Voice</h4>
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Ultra-HD Voice AI
                  </span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/30">
                    ₹10 / Clone
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record 10–30 seconds of your voice for just ₹10. Our neural engine clones your exact vocal timbre and native accent so {employee.name} speaks with your personal voice on real calls (₹10.0/min).
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setVoiceCloneModalOpen(true)}
              className="gap-2 text-xs font-semibold shrink-0 shadow-sm"
            >
              <Mic className="h-3.5 w-3.5" /> Clone Voice Now · ₹10
            </Button>
          </div>

          {/* Cloned Voices Section (If Any Exist) */}
          {clonedVoices.length > 0 && (
            <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> My Custom Cloned Voices ({clonedVoices.length})
                </span>
                <span className="font-mono text-muted-foreground font-semibold">₹10.0/min</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {clonedVoices.map((v) => {
                  const isSelected = selectedVoice === v.voice_id;
                  const isPlaying = playingVoice === v.voice_id;
                  const isLoading = audioLoadingVoice === v.voice_id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVoice(v.voice_id)}
                      className={`flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                          : 'border-border bg-card hover:border-border/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            playCloneVoice(v);
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                            isPlaying
                              ? 'bg-primary text-primary-foreground shadow-sm animate-pulse'
                              : 'bg-primary/20 text-primary hover:bg-primary/30'
                          }`}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isPlaying ? (
                            <VolumeX className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-foreground">{v.name}</span>
                            <span className="rounded bg-primary/20 px-1 py-0.2 text-[9px] font-bold text-primary">
                              Cloned
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[140px]">
                            {v.voice_id}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-primary' : 'border-muted'
                        }`}
                      >
                        {isSelected ? <div className="h-2 w-2 rounded-full bg-primary" /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Voice Library */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-foreground">Voice library</h4>
                <p className="text-xs text-muted-foreground">
                  Voices that speak {primaryLang} natively. Tap the speaker to hear one before you pick it.
                </p>
              </div>
            </div>

            <VoiceSelector
              selectedVoiceId={selectedVoice}
              language={primaryLang}
              onSelect={(voice) => {
                setSelectedVoice(voice.id);
                // Only follow the voice's language when it actually has one, so a
                // multilingual voice does not silently rewrite the primary setting.
                const name = voiceLanguageName(voice);
                if (name && name !== 'Multilingual') setPrimaryLang(name);
                toast.success(`Selected "${voice.name}"`);
              }}
              onPreviewError={(msg) => toast.error(msg)}
            />
          </div>

        </div>
      )}

      {/* TAB: VOICE CLONE STUDIO */}
      {activeTab === 'voice-clone' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/15 via-indigo-500/10 to-transparent p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-md">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-foreground">Voice Clone Studio</h3>
                  <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30 text-[10px] font-bold">
                    Ultra-HD Voice AI
                  </Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                    ₹10 / Clone · ₹10.0/min
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Clone your voice in 30 seconds for ₹10 so <span className="font-semibold text-foreground">{employee.name}</span> speaks with your exact vocal tone and native accent on live customer calls (₹10.0/min).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/voice-clones')}
                className="text-xs gap-1.5"
              >
                All Voice Clones
              </Button>
              <Button
                size="sm"
                onClick={() => setVoiceCloneModalOpen(true)}
                className="gap-2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm"
              >
                <Mic className="h-3.5 w-3.5" /> Clone Voice Now · ₹10
              </Button>
            </div>
          </div>

          {/* Current Voice Status Card */}
          <div className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-5 space-y-3 min-w-0 max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
                Currently Assigned Voice for {employee.name}
              </span>
              <span className="font-mono text-[10px] sm:text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded truncate self-start sm:self-auto">
                Voice ID: {selectedVoice}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Volume2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-foreground truncate">
                    {clonedVoices.find((c) => c.voice_id === selectedVoice)?.name || (
                      selectedVoice.startsWith('custom_') ? 'Custom Cloned Voice' : `Voice: ${selectedVoice}`
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate">
                    {clonedVoices.some((c) => c.voice_id === selectedVoice)
                      ? '✓ Custom Personal Voice is ACTIVE for this AI Employee'
                      : 'Standard synthetic voice is currently active'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => playVoiceSample(selectedVoice, 'నమస్కారం! నేను మీ AI అసిస్టెంట్‌ని మాట్లాడుతున్నాను.')}
                  className="text-xs gap-1.5 w-full sm:w-auto h-8 font-medium"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Listen Current Voice
                </Button>
              </div>
            </div>
          </div>

          {/* Cloned Voices Library for this Employee */}
          <div className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-5 space-y-4 min-w-0 max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600 shrink-0" /> My Custom Cloned Voices ({clonedVoices.length})
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select which cloned voice you want {employee.name} to speak with.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchClonedVoices}
                className="text-xs gap-1.5 w-full sm:w-auto h-8 shrink-0"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
            </div>

            {clonedVoices.length === 0 ? (
              <div className="p-4 sm:p-8 text-center rounded-xl border border-dashed border-border/80 bg-muted/20">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 mb-2">
                  <Mic className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-foreground">No Cloned Voices Created Yet</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-sm mx-auto">
                  Click the button below to record your voice. In 30 seconds, our AI will train a digital replica of your voice.
                </p>
                <Button
                  size="sm"
                  onClick={() => setVoiceCloneModalOpen(true)}
                  className="mt-3 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5 w-full sm:w-auto h-8"
                >
                  <Mic className="h-3.5 w-3.5" /> Start 30s Recording
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {clonedVoices.map((v) => {
                  const isSelected = selectedVoice === v.voice_id;
                  const isPlaying = playingVoice === v.voice_id;
                  const isLoading = audioLoadingVoice === v.voice_id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        setSelectedVoice(v.voice_id);
                        toast.success(`Voice set to "${v.name}"! Click "Save Changes" at top to apply.`);
                      }}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 sm:p-4 cursor-pointer transition ${
                        isSelected
                          ? 'border-purple-600 bg-purple-500/10 shadow-sm ring-1 ring-purple-500/30'
                          : 'border-border bg-card hover:border-border/80'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-foreground truncate">{v.name}</span>
                              <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30 text-[9px] py-0 shrink-0">
                                Cloned
                              </Badge>
                            </div>
                            <span className="font-mono text-[10px] text-muted-foreground truncate block max-w-[150px]">
                              {v.voice_id}
                            </span>
                          </div>

                          <div
                            className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-purple-600 bg-purple-600' : 'border-muted'
                            }`}
                          >
                            {isSelected ? <div className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="text-[11px] font-semibold text-purple-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Selected for {employee.name}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playCloneVoice(v);
                          }}
                        >
                          {isPlaying ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                          {isPlaying ? 'Playing...' : 'Play Sample'}
                        </button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-muted-foreground"
                          title="Re-render this voice's preview clip"
                          onClick={(e) => {
                            e.stopPropagation();
                            regenerateClonePreview(v.id, v.voice_id);
                          }}
                        >
                          <RefreshCw className={`mr-1 h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} /> Re-render
                        </Button>

                        <Button
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-[11px] px-2.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVoice(v.voice_id);
                            toast.success(`Voice set to "${v.name}"! Click "Save Changes" at top to apply.`);
                          }}
                        >
                          {isSelected ? 'Active' : 'Select'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Real-Time Interactive Voice Synthesizer */}
          <div className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-5 space-y-3 min-w-0 max-w-full">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary shrink-0" /> Test Voice with Custom Phrase
            </h4>
            <p className="text-xs text-muted-foreground">
              Type any sentence in Telugu or English to immediately hear how the active cloned voice sounds.
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setCloneTestPhrase('నమస్కారం అండి! మీరు చూస్తున్న ప్రాపర్టీ గురించి మాట్లాడటానికి కాల్ చేశాను.')}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] sm:text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground truncate max-w-full"
              >
                Telugu Real Estate
              </button>
              <button
                type="button"
                onClick={() => setCloneTestPhrase('హలో! మా ఆఫర్స్ గురించి తెలుసుకోవడానికి మీకు 2 నిమిషాలు సమయం ఉంటుందా?')}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] sm:text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground truncate max-w-full"
              >
                Telugu Sales Pitch
              </button>
              <button
                type="button"
                onClick={() => setCloneTestPhrase('Hello! Thank you for reaching out to us today. How may I assist you?')}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] sm:text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground truncate max-w-full"
              >
                English Greeting
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 min-w-0 max-w-full">
              <input
                type="text"
                value={cloneTestPhrase}
                onChange={(e) => setCloneTestPhrase(e.target.value)}
                placeholder="Type any test sentence..."
                className="w-full sm:flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs h-9 min-w-0"
              />
              <Button
                size="sm"
                onClick={() => handleCloneTestAudio(selectedVoice)}
                disabled={isCloneTestingAudio}
                className="w-full sm:w-auto gap-2 text-xs font-semibold shrink-0 h-9 px-4"
              >
                <Volume2 className={`h-3.5 w-3.5 ${isCloneTestingAudio ? 'animate-pulse' : ''}`} />
                {isCloneTestingAudio ? 'Synthesizing...' : 'Speak Phrase'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ACTIONS */}
      {activeTab === 'actions' && (
        <div className="space-y-6 max-w-4xl">
          <div>
            <h3 className="text-sm font-bold text-foreground">Automations & Integrations</h3>
            <p className="text-xs text-muted-foreground">Automated actions triggered during and after calls.</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 space-y-4 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Connected Actions</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-bold text-foreground">Lead Ingestion Webhook</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Automatically dials new leads within seconds of submission from your landing page or ads.
                </p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveTab('leads')}>
                  Configure Webhook
                </Button>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-bold text-foreground">Hot Lead Alerts</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Sends instant WhatsApp and email notifications to your sales team when high purchase intent is detected.
                </p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveTab('outcomes')}>
                  Configure Alerts
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Name, call limits and other options for {empName}.
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure carrier routing, compliance notices, duration caps and behavior.
              </p>
            </div>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="h-8 text-xs font-semibold shrink-0"
            >
              {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save Settings
            </Button>
          </div>

          {/* SECTION: GENERAL */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 space-y-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">General</h4>

            {/* Phone number */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-foreground">
                Phone number · calls from / receives on
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/80 bg-muted/20">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground font-mono">
                    {assignedNumber?.number || '— No number (uses shared line) —'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {assignedNumber?.number
                      ? 'Active dedicated carrier line assigned to this employee.'
                      : 'No active numbers yet — buy one on the Phone Numbers page.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/phone-numbers')}
                  className="h-8 text-xs shrink-0 font-medium"
                >
                  <Phone className="h-3.5 w-3.5 mr-1.5 text-primary" />
                  {assignedNumber?.number ? 'Change Number' : 'Buy a Number'}
                </Button>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5 pt-4 border-t border-border/60">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-semibold text-foreground">Name</label>
                  {isEditingName ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        type="text"
                        value={empName}
                        onChange={(e) => setEmpName(e.target.value)}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium w-full max-w-xs"
                        autoFocus
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsEditingName(false)}>
                        Done
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-foreground mt-0.5">{empName}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Used in the greeting &amp; script — applies when you next go live.
                  </p>
                </div>
                {!isEditingName && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingName(true)}
                    className="h-7 text-xs text-primary hover:text-primary font-medium"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Role */}
            <div className="space-y-1.5 pt-4 border-t border-border/60">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-xs font-semibold text-foreground">Role</label>
                  {isEditingRole ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        type="text"
                        value={empRole}
                        onChange={(e) => setEmpRole(e.target.value)}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium w-full max-w-xs"
                        autoFocus
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsEditingRole(false)}>
                        Done
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-foreground mt-0.5">{empRole}</p>
                  )}
                </div>
                {!isEditingRole && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingRole(true)}
                    className="h-7 text-xs text-primary hover:text-primary font-medium"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Employee ID */}
            <div className="space-y-1.5 pt-4 border-t border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-foreground">Employee ID</label>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5 select-all">
                    {employee.id}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(String(employee.id));
                    toast.success('Employee ID copied to clipboard');
                  }}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              </div>
            </div>
          </div>

          {/* SECTION: ON EVERY CALL */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 space-y-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">On every call</h4>

            {/* Recording notice */}
            <div className="flex items-start justify-between gap-4 pt-1">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">Recording notice</span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Recommended
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  When on, {empName} says “This call is being recorded.” at the start of every call, before the greeting. Calls are recorded either way and kept for 90 days — this just tells the caller. Many businesses are required to say it; you decide what applies to yours.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={recordingNotice}
                  onChange={(e) => setRecordingNotice(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* AI disclosure */}
            <div className="flex items-start justify-between gap-4 pt-4 border-t border-border/60">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">AI disclosure</span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Recommended
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  When on, {empName} softly presents as an AI — a light &quot;AI&quot; on its name, and if a caller gets confused or irritated it once warmly says it&apos;s an AI and asks them to speak a little slower. Off: it never mentions being an AI. Callers trust a call more when it&apos;s upfront, and disclosure is expected in most business calling — you decide what your business needs.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={aiDisclosure}
                  onChange={(e) => setAiDisclosure(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Call time limit */}
            <div className="space-y-3 pt-4 border-t border-border/60">
              <div>
                <label className="text-xs font-bold text-foreground">Call time limit</label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Every call ends automatically at this length — a hard cap to control cost and runaway calls.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={30}
                    max={3600}
                    value={maxCallDuration}
                    onChange={(e) => setMaxCallDuration(Number(e.target.value))}
                    className="w-20 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground font-mono"
                  />
                  <span className="text-xs text-muted-foreground font-medium">seconds</span>
                </div>
                <span className="text-xs text-muted-foreground font-medium">
                  = {Math.round(maxCallDuration / 60)}m · the call ends automatically at this point
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: '1m', sec: 60 },
                  { label: '2m', sec: 120 },
                  { label: '5m', sec: 300 },
                  { label: '10m', sec: 600 },
                  { label: '15m', sec: 900 },
                ].map(({ label, sec }) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setMaxCallDuration(sec)}
                    className={`rounded-lg px-3 py-1 text-xs border transition ${
                      maxCallDuration === sec
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-2xs'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* What to say before hanging up */}
            <div className="space-y-2 pt-4 border-t border-border/60">
              <label className="text-xs font-bold text-foreground">
                What {empName} says before hanging up
              </label>
              <p className="text-xs text-muted-foreground">
                Spoken as the limit is reached, so the call ends on a sentence instead of cutting off. Leave blank to use the default line in {empName}&apos;s language.
              </p>
              <input
                type="text"
                value={goodbyeMessage}
                onChange={(e) => setGoodbyeMessage(e.target.value)}
                placeholder="I'm so sorry, something went wrong on my end — I'll call you right back."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            {/* Say this and end */}
            <div className="space-y-3 pt-4 border-t border-border/60">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <span className="text-xs font-bold text-foreground">Say this and end</span>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {empName} plays one fixed message, waits until it has finished, then hangs up. No conversation and no questions back — the call script isn’t used at all while this is on. The message is recorded once and reused, so a big list costs the same as one call.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={sayThisAndEnd}
                    onChange={(e) => setSayThisAndEnd(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {sayThisAndEnd && (
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-medium text-foreground">
                    Type the exact words to be spoken. They are read out as written.
                  </label>
                  <textarea
                    rows={3}
                    maxLength={800}
                    value={fixedMessage}
                    onChange={(e) => setFixedMessage(e.target.value)}
                    placeholder="Enter fixed message..."
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed"
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Spoken exactly as written — no AI rewriting.</span>
                    <span>{fixedMessage.length} / 800</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION: INCOMING CALLS */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 space-y-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Incoming calls</h4>

            {/* Answer when leads call back */}
            <div className="flex items-start justify-between gap-4 pt-1">
              <div className="space-y-1 max-w-xl">
                <span className="text-xs font-bold text-foreground">Answer when leads call back</span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  When someone {empName} called rings this number back, {empName} answers and picks up where the call left off. Off: a lead {empName} called in the last two weeks gets an automatic call-back instead, and other callers are not answered.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={answerCallback}
                  onChange={(e) => setAnswerCallback(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Call back missed callers */}
            <div className="flex items-start justify-between gap-4 pt-4 border-t border-border/60">
              <div className="space-y-1 max-w-xl">
                <span className="text-xs font-bold text-foreground">Call back missed callers</span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  If a caller hangs up before saying anything, or can&apos;t get through because of a problem on our side, {empName} calls them back once — inside calling hours, never someone on your do-not-call list. The call-back uses credits like any call.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={callbackMissed}
                  onChange={(e) => setCallbackMissed(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Opening hours */}
            <div className="space-y-3 pt-4 border-t border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 max-w-xl">
                  <span className="text-xs font-bold text-foreground">Opening hours</span>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {empName} answers 24/7. Set your hours if callers should hear that you&apos;re closed outside them.
                  </p>
                </div>
                <div className="flex rounded-lg border border-border p-0.5 bg-muted/40 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setOpeningHoursMode('24/7')}
                    className={`px-3 py-1 text-xs rounded-md font-semibold transition ${
                      openingHoursMode === '24/7' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Open 24/7
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpeningHoursMode('custom')}
                    className={`px-3 py-1 text-xs rounded-md font-semibold transition ${
                      openingHoursMode === 'custom' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Set hours
                  </button>
                </div>
              </div>

              {openingHoursMode === 'custom' && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">From:</span>
                    <input
                      type="time"
                      value={openHoursStart}
                      onChange={(e) => setOpenHoursStart(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">To:</span>
                    <input
                      type="time"
                      value={openHoursEnd}
                      onChange={(e) => setOpenHoursEnd(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Hand callers to a person */}
            <div className="space-y-3 pt-4 border-t border-border/60">
              <div>
                <label className="text-xs font-bold text-foreground">Hand callers to a person</label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {empName} says it&apos;s connecting them, and the call moves to this number. Leave it empty and {empName} takes a message instead. The whole call uses credits at the normal rate.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Number</label>
                  <input
                    type="tel"
                    value={transferNumber}
                    onChange={(e) => setTransferNumber(e.target.value)}
                    placeholder="98765 43210"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">When</label>
                  <input
                    type="text"
                    value={transferWhen}
                    onChange={(e) => setTransferWhen(e.target.value)}
                    placeholder="the caller asks for a person"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Callers hear */}
            <div className="space-y-3 pt-4 border-t border-border/60">
              <label className="text-xs font-bold text-foreground">Callers hear</label>

              <div className="space-y-3">
                <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">A new caller</span>
                  <p className="text-xs leading-relaxed text-muted-foreground italic">
                    “నమస్తే అండి, {businessName} కి కాల్ చేసినందుకు ధన్యవాదాలు, నేను {empName}. చెప్పండి, ఎలా help చేయగలను?”
                  </p>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">A lead calling back</span>
                  <p className="text-xs leading-relaxed text-muted-foreground italic">
                    “నమస్తే అండి, నేను {businessName} నుంచి {empName} మాట్లాడుతున్నాను. మేము ఇంతకుముందు మీకు కాల్ చేశాము — చెప్పండి, ఎలా help చేయగలను?”
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Every caller first hears that the call is recorded. The business name comes from your account settings.
              </p>
            </div>
          </div>

          {/* SECTION: CATEGORY */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 space-y-4 shadow-xs">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Switching clears call history and saves a version you can restore.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'instant', label: 'Instant lead', desc: 'Auto-calls leads the second they submit a form' },
                { id: 'campaigns', label: 'Campaigns', desc: 'Outbound bulk campaign calling from CSV lists' },
                { id: 'inbound', label: 'Inbound', desc: 'Answers incoming customer inquiries 24/7' },
              ].map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id as any)}
                    className={`rounded-xl border p-4 cursor-pointer transition ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
                        : 'border-border/80 bg-muted/10 hover:border-border hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {cat.label}
                      </span>
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                      }`}>
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {cat.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION: ADVANCED PROMPTING */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs">
            <button
              type="button"
              onClick={() => setIsAdvancedPromptOpen(!isAdvancedPromptOpen)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advanced prompting</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  LLM temperature, sensitivity, and system-level injection rules.
                </p>
              </div>
              <div className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground">
                {isAdvancedPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {isAdvancedPromptOpen && (
              <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Custom System Rules</label>
                  <textarea
                    rows={3}
                    value={customPromptRules}
                    onChange={(e) => setCustomPromptRules(e.target.value)}
                    placeholder="e.g. Always speak politely using 'అండి' after every statement. Never make commitments on discounts."
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Creativity / Temperature</label>
                    <span className="text-xs font-mono font-bold text-primary">{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Strict (0.1)</span>
                    <span>Balanced (0.7)</span>
                    <span>Creative (1.0)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION: LIVEKIT CLOUD & WEBHOOK INTEGRATION */}
          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-card to-background p-5 sm:p-6 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Webhook className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      LiveKit Cloud &amp; Webhook Integration
                    </h4>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LiveKit Connected
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time WebRTC audio pipeline, agent dispatch, and server webhook synchronization.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncLivekit}
                  disabled={isSyncingLivekit}
                  className="h-8 text-xs font-medium border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                >
                  {isSyncingLivekit ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Sync with LiveKit
                </Button>
                <a
                  href="https://cloud.livekit.io/projects/p_5gwfu1z660w/agents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-8 px-3 rounded-lg border border-border text-xs font-medium bg-background hover:bg-muted/50 transition"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  Open LiveKit Cloud
                </a>
              </div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="p-3 rounded-xl border border-border/80 bg-background/60">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Project</p>
                <p className="text-xs font-mono font-bold text-foreground mt-0.5 truncate">
                  p_5gwfu1z660w
                </p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">aicalling-72j0sh1j.livekit.cloud</p>
              </div>

              <div className="p-3 rounded-xl border border-border/80 bg-background/60">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">LiveKit Agent Name</p>
                <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                  {`employee_${empName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${employee.id}`}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Explicit dispatch enabled</p>
              </div>

              <div className="p-3 rounded-xl border border-border/80 bg-background/60">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Pipeline Mode</p>
                <p className="text-xs font-semibold text-foreground mt-0.5 truncate">
                  STT-LLM-TTS pipeline
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Neural STT + Conversational AI</p>
              </div>

              <div className="p-3 rounded-xl border border-border/80 bg-background/60">
                <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Voice Engine</p>
                <p className="text-xs font-semibold text-foreground mt-0.5 truncate">
                  {primaryLang} · Neural HD Voice
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Low-latency streaming audio</p>
              </div>
            </div>

            {/* Webhook Configuration Card */}
            <div className="p-4 rounded-xl border border-border/80 bg-background/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Webhook className="h-3.5 w-3.5 text-primary" />
                    LiveKit Room &amp; Call Webhook URL
                  </h5>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    LiveKit notifies your server when rooms start, participants join/leave, or calls finish.
                  </p>
                </div>
                <a
                  href="https://cloud.livekit.io/projects/p_5gwfu1z660w/settings/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 shrink-0"
                >
                  Open LiveKit Webhook Settings
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={livekitInfo?.webhook_url || `${window.location.origin}/api/webhooks/livekit`}
                  className="w-full text-xs font-mono bg-muted/40 border border-border rounded-lg px-3 py-2 text-foreground select-all"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = livekitInfo?.webhook_url || `${window.location.origin}/api/webhooks/livekit`;
                    navigator.clipboard.writeText(url);
                    toast.success('LiveKit Webhook URL copied to clipboard!');
                  }}
                  className="h-8 px-3 shrink-0 text-xs font-medium"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy URL
                </Button>
              </div>

              {/* Step-by-step Setup instructions */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <p className="text-[11px] font-bold text-foreground">How to add this Webhook in LiveKit Cloud:</p>
                <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>
                    Go to your <a href="https://cloud.livekit.io/projects/p_5gwfu1z660w/settings/webhooks" target="_blank" rel="noopener noreferrer" className="text-primary underline">LiveKit Project Settings &gt; Webhooks</a>.
                  </li>
                  <li>
                    Click <strong className="text-foreground font-semibold">"Create new webhook"</strong>.
                  </li>
                  <li>
                    Paste the Webhook URL copied above into the <strong className="text-foreground font-semibold">Webhook URL</strong> field.
                  </li>
                  <li>
                    Select the events: <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">Room Started</span>, <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">Room Finished</span>, <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">Participant Joined</span>, <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">Participant Left</span>.
                  </li>
                  <li>
                    Click <strong className="text-foreground font-semibold">Create</strong>. LiveKit will automatically sign events with your API Secret, and VoBiz will cryptographically verify and log every call room event!
                  </li>
                </ol>
              </div>
            </div>
          </div>

          {/* SECTION: VERSION HISTORY */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 space-y-4 shadow-xs">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Version history</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track published model prompts and restore past working configurations.
              </p>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/80 bg-muted/20">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold text-foreground">Published version</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  live
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground font-medium">
                  {formatDateTime(employee.training_updated_at ?? employee.updated_at)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info('Current live version is active.')}
                className="h-7 text-xs"
              >
                Active
              </Button>
            </div>
          </div>

          {/* SECTION: DANGER ZONE */}
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6 space-y-5 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-destructive">Danger zone</h4>

            {/* Start from scratch */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground">Start from scratch</p>
                <p className="text-xs text-muted-foreground">
                  Wipes the script, training &amp; all call history and starts this employee over. Their number stays.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to rebuild this employee? All script and training data will be reset.')) {
                    toast.success('Rebuild initialized');
                  }
                }}
                className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0 font-medium"
              >
                Rebuild
              </Button>
            </div>

            {/* Archive */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-destructive/20">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground">Archive {empName}</p>
                <p className="text-xs text-muted-foreground">
                  Removes them from your active team. Their phone number is freed up. Call logs and recordings stay.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(`Archive ${empName}? This will pause calls and release assigned numbers.`)) {
                    toggleStatus();
                    toast.success(`${empName} archived`);
                  }
                }}
                className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0 font-medium"
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive {empName}
              </Button>
            </div>

            {/* Delete Employee */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-destructive/20">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-destructive">Delete {empName}</p>
                <p className="text-xs text-muted-foreground">
                  Permanently deletes {empName}, all knowledge docs, prompt versions, and releases phone numbers.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteModalOpen(true)}
                className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 shrink-0 font-medium cursor-pointer"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete {empName}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Test Call Modal */}
      <Dialog open={isTestCallOpen} onOpenChange={setIsTestCallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Call Your Real Phone with {employee.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Enter your mobile phone number. Our telephony server will dial your device immediately so you can test {employee.name}&apos;s live voice.
            </p>

            <div>
              <label className="text-xs font-semibold">Your Mobile Number (with country code)</label>
              <input
                type="tel"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
                placeholder="+919876543210"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsTestCallOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleMakeTestCall}
              disabled={isCallingPhone}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              {isCallingPhone ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Phone className="mr-1.5 h-3.5 w-3.5" />}
              Call My Phone Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat Simulation Modal */}
      <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Avatar name={employee.name} size="sm" />
              <div>
                <DialogTitle className="text-sm font-bold">Chat with {employee.name}</DialogTitle>
                <p className="text-[11px] text-muted-foreground">Live script & knowledge simulator</p>
              </div>
            </div>
          </DialogHeader>

          <div className="h-64 space-y-2 overflow-y-auto pr-1 text-xs scrollbar-thin">
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.sender === 'ai' ? 'items-start' : 'items-end'}`}
              >
                <div
                  className={`rounded-2xl px-3.5 py-2 max-w-[85%] leading-relaxed ${
                    m.sender === 'ai'
                      ? 'bg-muted text-foreground'
                      : 'bg-primary text-primary-foreground font-medium'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {chatLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{employee.name} is typing...</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border/60">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && chatInput.trim()) {
                  e.preventDefault();
                  void sendChatMessage(chatInput);
                }
              }}
              placeholder="Type message as customer..."
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs"
            />
            <Button
              size="sm"
              onClick={() => void sendChatMessage(chatInput)}
              disabled={!chatInput.trim()}
              className="h-8 w-8 p-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice Clone Modal */}
      <VoiceCloneModal
        open={voiceCloneModalOpen}
        onOpenChange={setVoiceCloneModalOpen}
        employeeId={employee.id}
        onVoiceCloned={handleVoiceCloned}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={(o) => !o && !deleteEmployee.isPending && setIsDeleteModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Delete AI Employee</DialogTitle>
                <DialogDescription className="mt-1">
                  Are you sure you want to delete <span className="font-semibold text-foreground">{employee.name}</span>?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs leading-relaxed space-y-2">
              <p className="font-semibold text-destructive">This action is permanent and cannot be undone:</p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>Permanently removes this employee&apos;s persona, system prompt, and configuration</li>
                <li>Deletes all associated FAQs, knowledge docs, scripts, and training history</li>
                <li>Any phone numbers currently assigned to this employee will be released</li>
                <li>Past call logs and audio recordings will remain intact for your billing and records</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={deleteEmployee.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteEmployee}
              loading={deleteEmployee.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEmployee.isPending ? 'Deleting...' : 'Delete Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
