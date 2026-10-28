import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Phone,
  Sparkles,
  Play,
  Pause,
  Loader2,
  Check,
  HelpCircle,
  Code,
  ShieldCheck,
  Headphones,
  ArrowLeft,
  ChevronDown,
  Globe,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { AIEmployee } from '@/types';
import { useNavigate } from 'react-router-dom';

interface CartesiaAgentStudioProps {
  initialEmployee?: AIEmployee | null;
  onSaved?: (emp: AIEmployee) => void;
  onCancel?: () => void;
}

interface CartesiaVoiceItem {
  id: string;
  name: string;
  description: string;
  language: string;
  languageName: string;
  flag: string;
  gender: 'male' | 'female';
  badge?: string;
}

const SUPPORTED_LANGUAGES: Array<{
  name: string;
  native: string;
  code: string;
  flag: string;
  defaultVoiceId: string;
}> = [
  { name: 'Telugu', native: 'తెలుగు', code: 'te-IN', flag: '🇮🇳', defaultVoiceId: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b' },
  { name: 'Hindi', native: 'हिंदी', code: 'hi-IN', flag: '🇮🇳', defaultVoiceId: 'cb9c954d-bcaa-43ed-82bf-aeb5e88a3cb5' },
  { name: 'English', native: 'English', code: 'en-IN', flag: '🇬🇧', defaultVoiceId: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b' },
  { name: 'Tamil', native: 'தமிழ்', code: 'ta-IN', flag: '🇮🇳', defaultVoiceId: '01d7796d-ac10-4ea3-8df0-3cc04f2d25ff' },
  { name: 'Kannada', native: 'ಕನ್ನಡ', code: 'kn-IN', flag: '🇮🇳', defaultVoiceId: '4c00ff98-199c-4967-99ae-7b69125edcff' },
  { name: 'Malayalam', native: 'മലയാളം', code: 'ml-IN', flag: '🇮🇳', defaultVoiceId: 'b426013c-002b-4e89-8874-8cd20b68373a' },
  { name: 'Marathi', native: 'मराठी', code: 'mr-IN', flag: '🇮🇳', defaultVoiceId: '5c32dce6-936a-4892-b131-bafe474afe5f' },
];

const DEFAULT_GREETINGS_BY_LANG: Record<string, string> = {
  Telugu: 'నమస్కారం అండి, నేను కస్టమర్ సర్వీస్ నుండి మాట్లాడుతున్నాను. మాట్లాడటానికి ఇది సరైన సమయమేనా?',
  Hindi: 'नमस्ते, मैं कस्टमर सर्विस से बात कर रहा हूँ। क्या आपसे बात करने का यह सही समय है?',
  English: 'Hello, I am calling from customer service regarding your recent inquiry. Is this a good time to speak?',
  Tamil: 'வணக்கம், நான் வாடிக்கையாளர் சேவையிலிருந்து பேசுகிறேன். உங்களிடம் பேச இது சரியான நேரமா?',
  Kannada: 'ನಮಸ್ಕಾರ, ನಾನು ಗ್ರಾಹಕ ಸೇವೆಯಿಂದ ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ. ಮಾತನಾಡಲು ಇದು ಸರಿಯಾದ ಸಮಯವೇ?',
  Malayalam: 'നമസ്കാരം, ഞാൻ കസ്റ്റമർ സർവീസിൽ നിന്നാണ് സംസാരിക്കുന്നത്. സംസാരിക്കാൻ ഇത് ശരിയായ സമയമാണോ?',
  Marathi: 'नमस्कार, मी कस्टमर सर्व्हिस मधून बोलत आहे. बोलण्यासाठी ही योग्य वेळ आहे का?',
};

export function CartesiaAgentStudio({ initialEmployee, onSaved, onCancel }: CartesiaAgentStudioProps) {
  const toast = useToast();
  const navigate = useNavigate();

  // Agent Core State
  const [name, setName] = useState(initialEmployee?.name || 'Venkatesh');
  const [role, setRole] = useState(initialEmployee?.role || 'Sales Representative');
  const [instruction, setInstruction] = useState(
    initialEmployee?.instructions ||
      `# Identity & Personality

You are Venkatesh, a professional customer sales advisor. You call customers who enquired about our services. Your goal is to understand their needs respectfully, answer questions politely in Telugu (అండి), and arrange the next step.

Warm, respectful of customer time, and allergic to robotic script-reading. You sound like an experienced human advisor who listens actively before speaking.

# Context

We help customers find the right vehicles and properties with flexible financing and doorstep demo bookings.

- Customer filled a form asking for details.
- Next step: Schedule a 15-minute consultation or doorstep test drive.
- Never force the customer. If they are busy, offer to call back at their convenience.`
  );

  const [welcomeMessage, setWelcomeMessage] = useState(
    initialEmployee?.greeting ||
      `నమస్కారం అండి, నేను కస్టమర్ సర్వీస్ నుండి వెంకటేష్ మాట్లాడుతున్నాను. మీరు మా సర్వీస్ కోసం ఎంక్వైరీ చేశారు కదా? మాట్లాడటానికి ఇది సరైన సమయమేనా?`
  );
  const [skipGreeting, setSkipGreeting] = useState(false);

  // Cartesia Voice & Telephony
  const [selectedVoiceId, setSelectedVoiceId] = useState(
    initialEmployee?.voice || '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b' // Charan
  );
  const [selectedLanguage, setSelectedLanguage] = useState(initialEmployee?.language || 'Telugu');
  const [llmModel, setLlmModel] = useState('Groq LPU (qwen3.8-27b - Instant 200ms)');
  const [backgroundSound, setBackgroundSound] = useState('none');
  const [selectedPhone, setSelectedPhone] = useState('+918065354620');
  const [phoneNumbers, setPhoneNumbers] = useState<Array<{ id: number; number: string; provider: string }>>([]);

  // Audio Preview State
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Voice Picker Modal & Filter States
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('');
  const [filterLanguage, setFilterLanguage] = useState<string>('All');
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all');
  const [clonedVoices, setClonedVoices] = useState<CartesiaVoiceItem[]>([]);
  const [liveVoices, setLiveVoices] = useState<CartesiaVoiceItem[]>([]);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load Phone Numbers from VoBiz & live voices
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ success: boolean; numbers: any[] }>('/phone-numbers');
        if (res.numbers && res.numbers.length > 0) {
          setPhoneNumbers(res.numbers);
          const vobizNum = res.numbers.find((n) => n.provider === 'vobiz') || res.numbers[0];
          if (vobizNum) setSelectedPhone(vobizNum.number);
        } else {
          setPhoneNumbers([{ id: 11, number: '+918065354620', provider: 'vobiz' }]);
        }
      } catch {
        setPhoneNumbers([{ id: 11, number: '+918065354620', provider: 'vobiz' }]);
      }

      // Fetch live voices from Cartesia API via server
      try {
        const vRes = await api.get<{ success: boolean; voices?: { cloned?: any[]; cartesia?: any[]; all?: any[] } }>('/employees/voices');
        
        if (vRes.voices?.cartesia && Array.isArray(vRes.voices.cartesia) && vRes.voices.cartesia.length > 0) {
          const LANG_FLAGS: Record<string, string> = {
            te: '🇮🇳', hi: '🇮🇳', ta: '🇮🇳', kn: '🇮🇳', ml: '🇮🇳', mr: '🇮🇳', bn: '🇮🇳', gu: '🇮🇳', pa: '🇮🇳',
            en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', ja: '🇯🇵', ar: '🇸🇦', pt: '🇵🇹', it: '🇮🇹', zh: '🇨🇳',
            ko: '🇰🇷', ru: '🇷🇺', nl: '🇳🇱', sv: '🇸🇪', tr: '🇹🇷', th: '🇹🇭', vi: '🇻🇳', id: '🇮🇩'
          };
          const mappedLive: CartesiaVoiceItem[] = vRes.voices.cartesia.map((cv: any) => {
            const code = String(cv.language_code || cv.language || 'en').toLowerCase().split('-')[0];
            return {
              id: cv.id,
              name: cv.name || 'Voice',
              description: cv.description || cv.tagline || 'Cartesia Sonic neural voice',
              language: code,
              languageName: cv.language_name || code.toUpperCase(),
              flag: LANG_FLAGS[code] || '🌐',
              gender: cv.gender === 'female' ? 'female' : 'male',
              badge: cv.badge || (code === 'te' ? 'Pure Telugu' : 'Sonic 3.6'),
            };
          });
          setLiveVoices(mappedLive);
        }

        if (vRes.voices?.cloned && Array.isArray(vRes.voices.cloned)) {
          const mapped: CartesiaVoiceItem[] = vRes.voices.cloned.map((cv: any) => ({
            id: cv.voice_id || cv.id,
            name: cv.name || 'Cloned Voice',
            description: cv.description || 'Custom cloned AI voice',
            language: cv.language || 'te',
            languageName: cv.language === 'hi' ? 'Hindi' : cv.language === 'en' ? 'English' : 'Telugu',
            flag: '🇮🇳',
            gender: cv.gender === 'male' ? 'male' : 'female',
            badge: 'Cloned',
          }));
          setClonedVoices(mapped);
        }
      } catch {
        // fallback to default catalog
      }
    })();
  }, []);

  // Combined Voices: cloned + live Cartesia voices fetched directly from API
  const allVoices = useMemo(() => {
    return [...clonedVoices, ...liveVoices];
  }, [clonedVoices, liveVoices]);

  const availableLanguages = useMemo(() => {
    const counts = new Map<string, { name: string; flag: string; count: number }>();
    for (const v of allVoices) {
      const existing = counts.get(v.languageName);
      if (existing) {
        existing.count++;
      } else {
        counts.set(v.languageName, { name: v.languageName, flag: v.flag, count: 1 });
      }
    }
    const list = Array.from(counts.values());
    const priority = ['Telugu', 'Hindi', 'English', 'Tamil', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi'];
    list.sort((a, b) => {
      const idxA = priority.indexOf(a.name);
      const idxB = priority.indexOf(b.name);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return b.count - a.count;
    });
    return list;
  }, [allVoices]);

  const selectedVoice = useMemo<CartesiaVoiceItem>(() => {
    if (allVoices.length === 0) {
      return {
        id: selectedVoiceId || '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b',
        name: 'Loading voice...',
        description: 'Fetching real voices from Cartesia API...',
        language: 'te',
        languageName: 'Telugu',
        flag: '🇮🇳',
        gender: 'male',
        badge: 'Sonic 3.6',
      };
    }
    return allVoices.find((v) => v.id === selectedVoiceId) || allVoices[0];
  }, [allVoices, selectedVoiceId]);

  // Filtered Voices for Modal
  const filteredVoices = useMemo(() => {
    return allVoices.filter((v) => {
      if (filterLanguage !== 'All' && v.languageName.toLowerCase() !== filterLanguage.toLowerCase()) {
        return false;
      }
      if (filterGender !== 'all' && v.gender !== filterGender) {
        return false;
      }
      if (voiceSearchQuery.trim()) {
        const q = voiceSearchQuery.toLowerCase();
        const matchesName = v.name.toLowerCase().includes(q);
        const matchesDesc = v.description.toLowerCase().includes(q);
        const matchesLang = v.languageName.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesLang) return false;
      }
      return true;
    });
  }, [allVoices, filterLanguage, filterGender, voiceSearchQuery]);

  // Language Change Handler
  const handleSelectLanguage = (langName: string, updateGreeting = false) => {
    setSelectedLanguage(langName);
    setHasChanges(true);

    // If current voice does not belong to the selected language, select default voice for this language
    const currentVoice = allVoices.find((v) => v.id === selectedVoiceId);
    if (!currentVoice || currentVoice.languageName.toLowerCase() !== langName.toLowerCase()) {
      const matchLang = SUPPORTED_LANGUAGES.find((l) => l.name.toLowerCase() === langName.toLowerCase());
      if (matchLang) {
        setSelectedVoiceId(matchLang.defaultVoiceId);
      } else {
        const firstVoiceForLang = allVoices.find((v) => v.languageName.toLowerCase() === langName.toLowerCase());
        if (firstVoiceForLang) setSelectedVoiceId(firstVoiceForLang.id);
      }
    }

    if (updateGreeting && DEFAULT_GREETINGS_BY_LANG[langName]) {
      setWelcomeMessage(DEFAULT_GREETINGS_BY_LANG[langName]);
    }
  };

  // Voice Select Handler
  const handleSelectVoice = (voice: CartesiaVoiceItem) => {
    setSelectedVoiceId(voice.id);
    setSelectedLanguage(voice.languageName);
    setHasChanges(true);
    setIsVoicePickerOpen(false);
  };

  // Voice Preview Handler
  const handlePlayVoice = async (voiceItem: CartesiaVoiceItem) => {
    if (playingVoiceId === voiceItem.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setLoadingAudio(true);
    setPlayingVoiceId(voiceItem.id);

    try {
      const sampleText =
        welcomeMessage && welcomeMessage.trim().length > 0
          ? welcomeMessage.slice(0, 100)
          : (DEFAULT_GREETINGS_BY_LANG[voiceItem.languageName] || 'నమస్కారం అండి! మాట్లాడటానికి ఇది సరైన సమయమేనా?');

      const res = await api.post<{ success: boolean; audioUrl: string }>('/employees/voice-sample', {
        voice: voiceItem.id,
        language: voiceItem.languageName,
        provider: 'cartesia',
        text: sampleText,
      });

      if (res.audioUrl) {
        const audio = new Audio(res.audioUrl);
        audioRef.current = audio;
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => setPlayingVoiceId(null);
        await audio.play();
      }
    } catch {
      toast.error(`Voice preview for ${voiceItem.name} could not be played. Check Cartesia API.`);
      setPlayingVoiceId(null);
    } finally {
      setLoadingAudio(false);
    }
  };

  // Enhance with AI
  const handleEnhanceWithAI = async () => {
    setIsEnhancing(true);
    try {
      const res = await api.post<{ success: boolean; reply?: string; text?: string }>('/employees/swara-chat', {
        messages: [
          {
            role: 'user',
            content: `Improve this AI sales agent instruction prompt for a phone caller in Telugu. Make it sound extremely natural, respectful, and human: \n\n${instruction}`,
          },
        ],
        language: selectedLanguage,
      });

      const enhanced = res.reply || res.text;
      if (enhanced) {
        setInstruction(enhanced);
        setHasChanges(true);
        toast.success('Prompt instructions enhanced with human sales behavior!');
      }
    } catch {
      toast.error('Could not enhance with AI right now.');
    } finally {
      setIsEnhancing(false);
    }
  };

  // Save / Publish Agent
  const handlePublish = async () => {
    setIsSaving(true);
    try {
      const payload: Partial<AIEmployee> & { phone_number?: string } = {
        name,
        role,
        language: selectedLanguage,
        language_code: selectedLanguage === 'Telugu' ? 'te-IN' : selectedLanguage === 'Hindi' ? 'hi-IN' : 'en-IN',
        voice: selectedVoiceId,
        voice_provider: 'cartesia',
        greeting: skipGreeting ? '' : welcomeMessage,
        instructions: instruction,
        record_calls: 1,
        ambient_sound: backgroundSound === 'none' ? null : backgroundSound,
        ambient_enabled: backgroundSound === 'none' ? 0 : 1,
        phone_number: selectedPhone,
        status: 'active',
      };

      let savedEmp: AIEmployee;
      if (initialEmployee?.id) {
        const res = await api.put<{ success: boolean; employee: AIEmployee }>(`/employees/${initialEmployee.id}`, payload);
        savedEmp = res.employee;
        toast.success(`Agent "${name}" updated and ready for calls!`);
      } else {
        const res = await api.post<{ success: boolean; employee: AIEmployee; cartesia_sync?: any }>('/employees', payload);
        savedEmp = res.employee;
        toast.success(`Agent "${name}" published and ready to make calls!`);
      }

      setHasChanges(false);
      if (onSaved) onSaved(savedEmp);
      else navigate(`/employees/${savedEmp.id}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save agent configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-zinc-100 rounded-2xl border border-white/10 shadow-2xl overflow-hidden min-h-[780px]">
      {/* Top Header Bar (Matching Cartesia UI) */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-[#111114]">
        <div className="flex items-center gap-3">
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-zinc-400 hover:text-white h-7 px-2"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Configuration</span>
          <span className="text-zinc-600">•</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setHasChanges(true);
              }}
              className="bg-transparent font-bold text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 rounded px-1.5 py-0.5"
              placeholder="Agent Name"
            />
            <input
              type="text"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setHasChanges(true);
              }}
              className="bg-transparent text-xs text-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded px-1.5 py-0.5"
              placeholder="Agent Role"
            />
            {initialEmployee?.cartesia_agent_id ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-200 text-[11px] font-mono shadow-sm"
                title="Voice engine synchronized and active"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Voice Synced</span>
              </span>
            ) : (
              <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-500/10 text-[10px] font-mono">
                AI Voice Agent
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* VoBiz Number Selector Badge */}
          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-zinc-300">
            <Phone className="h-3 w-3 text-emerald-400" />
            <select
              value={selectedPhone}
              onChange={(e) => {
                setSelectedPhone(e.target.value);
                setHasChanges(true);
              }}
              className="bg-transparent text-xs font-mono text-zinc-200 focus:outline-none cursor-pointer"
            >
              {phoneNumbers.map((p) => (
                <option key={p.id} value={p.number} className="bg-[#18181b] text-white">
                  {p.number} ({p.provider === 'vobiz' ? 'PSTN' : p.provider.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Vars Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVarsModal(true)}
            className="text-xs text-zinc-400 hover:text-white hover:bg-white/5 border border-white/5"
          >
            <Code className="h-3.5 w-3.5 mr-1 text-purple-400" />
            {`{ } Vars`}
          </Button>

          {/* Test Call Agent */}
          {initialEmployee?.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/employees/${initialEmployee.id}/call`)}
              className="text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
            >
              <Headphones className="h-3.5 w-3.5 mr-1" />
              Test Call Agent
            </Button>
          )}

          {/* Publish / Save Button */}
          <Button
            onClick={handlePublish}
            disabled={isSaving}
            className="bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-xs px-4 rounded-lg relative transition shadow"
          >
            {hasChanges && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-black" />}
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Publishing...
              </>
            ) : (
              'Publish'
            )}
          </Button>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-white/10">
        {/* Left Column: Instruction & Welcome Message (7 cols) */}
        <div className="lg:col-span-8 p-6 space-y-6 overflow-y-auto">
          {/* Instruction Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white">Instruction</span>
                <span title="The system prompt defining agent behavior, tone, and objection handling.">
                  <HelpCircle className="h-3.5 w-3.5 text-zinc-500 cursor-help" />
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleEnhanceWithAI}
                disabled={isEnhancing}
                className="text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/10 h-7"
              >
                {isEnhancing ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1 text-purple-400" />
                )}
                Write with AI
              </Button>
            </div>

            <div className="relative rounded-xl border border-white/10 bg-[#121215] focus-within:border-purple-500/70 transition">
              <textarea
                value={instruction}
                onChange={(e) => {
                  setInstruction(e.target.value);
                  setHasChanges(true);
                }}
                rows={16}
                className="w-full bg-transparent p-4 font-mono text-xs sm:text-sm text-zinc-200 focus:outline-none resize-none leading-relaxed"
                placeholder="# Identity & Personality&#10;You are Dana..."
              />
              <div className="px-4 py-2 text-[11px] text-zinc-500 border-t border-white/5 flex items-center justify-between">
                <span>Type <code className="text-purple-400">{'{{'}</code> to insert a dynamic variable.</span>
                <span>{instruction.length.toLocaleString()} characters</span>
              </div>
            </div>
          </div>

          {/* Welcome Message Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white">Welcome Message</span>
                <span title="The opening spoken sentence when the call connects.">
                  <HelpCircle className="h-3.5 w-3.5 text-zinc-500 cursor-help" />
                </span>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipGreeting}
                  onChange={(e) => {
                    setSkipGreeting(e.target.checked);
                    setHasChanges(true);
                  }}
                  className="rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-0"
                />
                <span>Skip</span>
              </label>
            </div>

            {!skipGreeting ? (
              <div className="relative rounded-xl border border-white/10 bg-[#121215] focus-within:border-purple-500/70 transition">
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => {
                    setWelcomeMessage(e.target.value);
                    setHasChanges(true);
                  }}
                  rows={3}
                  className="w-full bg-transparent p-4 text-xs sm:text-sm text-zinc-200 focus:outline-none resize-none leading-relaxed"
                  placeholder="Hi, it's Dana from customer support..."
                />
                <div className="px-4 py-2 text-[11px] text-zinc-500 border-t border-white/5 flex items-center justify-between">
                  <span>Type <code className="text-purple-400">{'{{'}</code> to insert a dynamic variable.</span>
                  <span>{welcomeMessage.length} / 1,000 characters</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-white/5 bg-[#121215]/50 text-xs text-zinc-500 italic">
                Welcome greeting is skipped. The agent will wait silently for the customer to speak first.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Voice, Language, LLM & Telephony (4 cols) */}
        <div className="lg:col-span-4 p-6 space-y-6 overflow-y-auto bg-[#0e0e11]">
          {/* Voice & Language (Exact Match to Cartesia UI) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-zinc-300">Voice & Language</label>
                <span title="Choose high-definition neural voice and language for the agent">
                  <HelpCircle className="h-3.5 w-3.5 text-zinc-500 cursor-help" />
                </span>
              </div>
              <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                Neural HD
              </span>
            </div>

            {/* Quick Language Selection Pills */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1 font-medium">
                  <Globe className="h-3 w-3 text-purple-400" />
                  Select Language
                </span>
                <span className="text-zinc-500 font-mono text-[10px]">
                  {SUPPORTED_LANGUAGES.find((l) => l.name === selectedLanguage)?.native || selectedLanguage}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguage.toLowerCase() === lang.name.toLowerCase();
                  return (
                    <button
                      key={lang.name}
                      type="button"
                      onClick={() => handleSelectLanguage(lang.name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400'
                          : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white border border-white/5'
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Voice Selector Button (Cartesia UI Style) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="font-medium">AI Voice</span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterLanguage(selectedLanguage);
                    setIsVoicePickerOpen(true);
                  }}
                  className="text-purple-400 hover:text-purple-300 hover:underline cursor-pointer"
                >
                  Browse all voices →
                </button>
              </div>

              {/* The Input-Button matching Cartesia screenshot */}
              <div
                onClick={() => {
                  setFilterLanguage(selectedLanguage);
                  setIsVoicePickerOpen(true);
                }}
                className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-[#141418] px-3.5 py-2.5 text-left hover:border-purple-500/50 hover:bg-[#18181f] transition group shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Cartesia 3-bar audio wave icon */}
                  <div className="flex items-end gap-[2px] h-3.5 w-3.5 text-purple-400 shrink-0">
                    <span className="w-[3px] h-2 bg-current rounded-full" />
                    <span className="w-[3px] h-3.5 bg-current rounded-full" />
                    <span className="w-[3px] h-2.5 bg-current rounded-full" />
                  </div>
                  <span className="font-semibold text-sm text-white truncate">
                    {selectedVoice.name}
                  </span>
                  {selectedVoice.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {selectedVoice.badge}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm">{selectedVoice.flag}</span>
                  <ChevronDown className="h-4 w-4 text-zinc-400 group-hover:text-white transition" />
                </div>
              </div>

              {/* Language indicator row from Cartesia screenshot */}
              <div className="flex items-center justify-between text-xs px-1 text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span>Language:</span>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => handleSelectLanguage(e.target.value)}
                    className="bg-transparent text-purple-300 font-semibold cursor-pointer focus:outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.name} value={l.name} className="bg-[#18181b] text-white">
                        {l.name} ({l.native})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Gender: <span className="capitalize text-zinc-400">{selectedVoice.gender}</span>
                </div>
              </div>
            </div>

            {/* Active Voice Info & Live Preview Card */}
            <div className="rounded-xl border border-white/10 bg-[#141418]/90 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <span className="truncate">{selectedVoice.name}</span>
                    <span className="text-zinc-500">•</span>
                    <span className="text-[11px] text-zinc-400 capitalize shrink-0">{selectedVoice.gender} Voice</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                    {selectedVoice.description}
                  </p>
                </div>

                {/* Play/Pause Live Preview Button */}
                <button
                  type="button"
                  onClick={() => handlePlayVoice(selectedVoice)}
                  disabled={loadingAudio}
                  className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 transition cursor-pointer ${
                    playingVoiceId === selectedVoice.id
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 ring-2 ring-purple-400 animate-pulse'
                      : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
                  }`}
                  title="Listen to voice sample"
                >
                  {loadingAudio && playingVoiceId === selectedVoice.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : playingVoiceId === selectedVoice.id ? (
                    <Pause className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  )}
                </button>
              </div>

              {/* Waveform indicator when playing */}
              {playingVoiceId === selectedVoice.id && (
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-purple-300">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Playing live neural voice sample...
                  </span>
                  <span className="font-mono">Neural Voice Engine</span>
                </div>
              )}
            </div>
          </div>

          {/* LLM Model */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <label className="text-xs font-bold text-zinc-300">LLM</label>
              <HelpCircle className="h-3 w-3 text-zinc-500" />
            </div>

            <select
              value={llmModel}
              onChange={(e) => {
                setLlmModel(e.target.value);
                setHasChanges(true);
              }}
              className="w-full rounded-xl border border-white/10 bg-[#141418] px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500/60"
            >
              <option value="Groq LPU (qwen3.8-27b - Instant 200ms)">Groq LPU (qwen3.8-27b - Instant 200ms)</option>
              <option value="Groq LPU (llama-3.3-70b-versatile)">Groq LPU (llama-3.3-70b-versatile)</option>
              <option value="OpenAI GPT-4o-mini">OpenAI GPT-4o-mini</option>
            </select>
          </div>

          {/* Background Sound */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <label className="text-xs font-bold text-zinc-300">Background Sound</label>
              <HelpCircle className="h-3 w-3 text-zinc-500" />
            </div>

            <select
              value={backgroundSound}
              onChange={(e) => {
                setBackgroundSound(e.target.value);
                setHasChanges(true);
              }}
              className="w-full rounded-xl border border-white/10 bg-[#141418] px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500/60"
            >
              <option value="none">No background sound (Clean)</option>
              <option value="office">Subtle Office Ambient Murmur</option>
              <option value="callcenter">Active Call Center Ambience</option>
            </select>
          </div>

          {/* Telecom PSTN Telephony & Recording Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300">Telecom PSTN Calling Connected</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Inbound and outbound PSTN calls stream with sub-second telephony audio. Dual-track recordings are automatically captured and stored in your dashboard.
            </p>
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-500/20 font-mono text-emerald-400">
              <span>Carrier: Cloud PSTN</span>
              <span>Recording: ON</span>
            </div>
          </div>
        </div>
      </div>

      {/* Voice & Language Picker Modal */}
      {isVoicePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#121216] p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-end gap-[2px] h-4 w-4 text-purple-400 shrink-0">
                  <span className="w-[3px] h-2 bg-current rounded-full" />
                  <span className="w-[3px] h-4 bg-current rounded-full" />
                  <span className="w-[3px] h-3 bg-current rounded-full" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Choose Voice & Language
                    <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-500/10 text-[10px] font-mono">
                      Neural HD
                    </Badge>
                  </h3>
                  <p className="text-[11px] text-zinc-400">Ultra-low latency conversational AI voice models</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVoicePickerOpen(false)}
                className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Language Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                type="button"
                onClick={() => setFilterLanguage('All')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition cursor-pointer ${
                  filterLanguage === 'All'
                    ? 'bg-purple-600 text-white shadow'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                }`}
              >
                All Languages ({allVoices.length})
              </button>
              {availableLanguages.map((lang) => (
                <button
                  key={lang.name}
                  type="button"
                  onClick={() => setFilterLanguage(lang.name)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition flex items-center gap-1.5 cursor-pointer ${
                    filterLanguage.toLowerCase() === lang.name.toLowerCase()
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                  <span className="text-[10px] opacity-70">({lang.count})</span>
                </button>
              ))}
            </div>

            {/* Search and Gender Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={voiceSearchQuery}
                  onChange={(e) => setVoiceSearchQuery(e.target.value)}
                  placeholder="Search voices by name or style (e.g. Charan, Ramya, sales)..."
                  className="w-full bg-[#18181f] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center bg-[#18181f] border border-white/10 rounded-xl p-1 gap-1 text-xs shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setFilterGender('all')}
                  className={`px-2.5 py-1 rounded-lg transition text-xs ${
                    filterGender === 'all' ? 'bg-purple-600 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterGender('male')}
                  className={`px-2.5 py-1 rounded-lg transition text-xs ${
                    filterGender === 'male' ? 'bg-purple-600 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  👨 Male
                </button>
                <button
                  type="button"
                  onClick={() => setFilterGender('female')}
                  className={`px-2.5 py-1 rounded-lg transition text-xs ${
                    filterGender === 'female' ? 'bg-purple-600 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  👩 Female
                </button>
              </div>
            </div>

            {/* Voice Cards Grid */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-h-[280px] max-h-[400px]">
              {filteredVoices.map((voice) => {
                const isSelected = voice.id === selectedVoiceId;
                const isPlaying = playingVoiceId === voice.id;
                return (
                  <div
                    key={voice.id}
                    onClick={() => handleSelectVoice(voice)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/15 shadow-md shadow-purple-950/50 ring-1 ring-purple-500'
                        : 'border-white/5 bg-[#17171d] hover:border-white/20 hover:bg-[#1c1c24]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                          <span>{voice.name}</span>
                          <span>{voice.flag}</span>
                          <span className="text-[10px] font-normal text-zinc-400">
                            {voice.gender === 'male' ? '👨' : '👩'}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-500/30">
                            <Check className="h-3 w-3" /> Selected
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-purple-300 font-medium">
                          {voice.languageName}
                        </span>
                        {voice.badge && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                            {voice.badge}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                        {voice.description}
                      </p>
                    </div>

                    {/* Card Footer: Preview Play Button */}
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVoice(voice);
                        }}
                        disabled={loadingAudio}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                          isPlaying
                            ? 'bg-purple-600 text-white shadow ring-1 ring-purple-400'
                            : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                        }`}
                      >
                        {loadingAudio && isPlaying ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isPlaying ? (
                          <>
                            <Pause className="h-3 w-3 fill-current" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>

                      <span className="text-[10px] text-zinc-500">
                        {isSelected ? 'Active' : 'Click to select'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredVoices.length === 0 && (
                <div className="col-span-2 py-12 text-center text-zinc-500 text-xs">
                  No voices found matching "{voiceSearchQuery}". Try changing search or filters.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <div className="text-xs text-zinc-400">
                Selected: <strong className="text-white">{selectedVoice.name}</strong> ({selectedVoice.languageName}, {selectedVoice.gender})
              </div>
              <Button
                onClick={() => setIsVoicePickerOpen(false)}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-4"
              >
                Confirm Voice
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Variables Modal */}
      {showVarsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141418] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Dynamic Variables</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVarsModal(false)}
                className="text-xs text-zinc-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Insert these variables in your <strong>Instruction</strong> or <strong>Welcome Message</strong> using <code className="text-purple-300">{'{{variable_name}}'}</code>:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {[
                { var: '{{customer_name}}', desc: 'Customer full name from lead or caller ID' },
                { var: '{{phone}}', desc: 'Customer phone number' },
                { var: '{{company}}', desc: 'Your company or business name' },
                { var: '{{product}}', desc: 'Vehicle or property enquired about' },
                { var: '{{budget}}', desc: 'Target budget or price range' },
              ].map((item) => (
                <div key={item.var} className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 text-xs">
                  <span className="font-mono text-purple-300 font-semibold">{item.var}</span>
                  <span className="text-[11px] text-zinc-400">{item.desc}</span>
                </div>
              ))}
            </div>

            <Button
              onClick={() => setShowVarsModal(false)}
              className="w-full bg-white text-black hover:bg-zinc-200 text-xs font-semibold"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
