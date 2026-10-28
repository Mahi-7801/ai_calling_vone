import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Zap,
  Megaphone,
  Mic,
  LayoutGrid,
  Loader2,
  Volume2,
  Bot,
  Send,
  ChevronRight,
  Phone,
  Radio,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AIEmployee } from '@/types';

interface CartesiaVoice {
  id: string;
  name: string;
  language_code: string;
  language_name: string;
  gender: string;
  badge?: string;
  is_cloned?: boolean;
  description?: string;
  provider?: string;
}

interface AiEmployeeBuilderHeroProps {
  onEmployeeCreated?: (employee: AIEmployee) => void;
}

/**
 * Which provider owns a voice id.
 *
 * The /employees/voices list carries a `provider` per entry (Sarvam stock
 * speakers, Cartesia UUIDs, and your own clones), so use that rather than
 * assuming Cartesia. A Sarvam clone id (svc-*) can only ever be spoken by
 * Sarvam, and the stock speakers default to Sarvam because its voices are the
 * ones built for Telugu and the other Indian languages.
 */
function voiceProviderForId(voiceId: string, list: Array<{ id: string; provider?: string }>): string {
  const raw = String(voiceId || '').trim();
  if (/^svc-[a-z0-9-]+$/i.test(raw)) return 'sarvam';
  const match = list.find((v) => v.id === raw);
  if (match?.provider) return match.provider;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return 'cartesia';
  return 'sarvam';
}

const LANGUAGES = [
  { label: 'తెలుగు', name: 'Telugu', code: 'te-IN' },
  { label: 'हिन्दी', name: 'Hindi', code: 'hi-IN' },
  { label: 'தமிழ்', name: 'Tamil', code: 'ta-IN' },
  { label: 'ಕನ್ನಡ', name: 'Kannada', code: 'kn-IN' },
  { label: 'മലയാളം', name: 'Malayalam', code: 'ml-IN' },
  { label: 'मराठी', name: 'Marathi', code: 'mr-IN' },
  { label: 'English', name: 'English', code: 'en-IN' },
];

const PRESETS: Record<string, Record<string, string>> = {
  'Real estate': {
    Telugu: 'నా Instagram యాడ్ ద్వారా వచ్చే లీడ్స్‌కి వెంటనే కాల్ చేసి, వారి బడ్జెట్ మరియు 2BHK/3BHK వివరాలు కనుక్కొని, ఈ వీకెండ్ సైట్ విజిట్ బుక్ చేయాలి.',
    Hindi: 'इंस्टाग्राम विज्ञापन से आने वाले सभी नए लीड्स को कॉल करें, उनकी आवश्यकताएं पूछें और साइट विजिट बुक करें।',
    Tamil: 'எனது Instagram விளம்பரம் மூலம் வரும் லீட்களுக்கு உடனே கால் செய்து, அவர்களின் பட்ஜெட் மற்றும் 2BHK/3BHK விவரங்களைக் கேட்டு, இந்த வார இறுதி சைட் விசிட் புக் செய்ய வேண்டும்.',
    Kannada: 'ನನ್ನ Instagram ಜಾಹೀರಾತಿನಿಂದ ಬರುವ ಲೀಡ್‌ಗಳಿಗೆ ತಕ್ಷಣವೇ ಕರೆ ಮಾಡಿ, ಅವರ ಬಜೆಟ್ ಮತ್ತು 2BHK/3BHK ವಿವರಗಳನ್ನು ಪಡೆದು, ಈ ವಾರಾಂತ್ಯದ ಸೈಟ್ ಭೇಟಿ ಬುಕ್ ಮಾಡಬೇಕು.',
    Malayalam: 'എന്റെ Instagram പരസ്യത്തിൽ നിന്ന് വരുന്ന ലീഡുകളെ ഉടൻ വിളിച്ച്, അവരുടെ ബജറ്റും 2BHK/3BHK വിവരങ്ങളും ചോദിച്ച്, ഈ വാരാന്ത്യത്തിൽ സൈറ്റ് സന്ദർശനം ബുക്ക് ചെയ്യണം.',
    Marathi: 'माझ्या Instagram जाहिरातीवरून येणाऱ्या सर्व लीड्सना त्वरित कॉल करा, त्यांचे बजेट आणि 2BHK/3BHK माहिती विचारून या वीकेंडला साइट व्हिजिट बुक करा.',
    English: 'Call every new enquiry from my Instagram ad, ask what they need, and book a visit.',
  },
  'Coaching & tuition': {
    Telugu: 'మా నీట్/జేఈఈ కోచింగ్ గురించి ఆసక్తి చూపిన విద్యార్థులకు కాల్ చేసి, ఫ్రీ డెమో క్లాస్ కోసం రిజిస్టర్ చేసి వాట్సాప్‌లో సిలబస్ పంపాలి.',
    Hindi: 'कोचिंग में रुचि रखने वाले छात्रों को कॉल करें, उनकी कक्षा जानें और फ्री डेमो क्लास के लिए स्लॉट बुक करें।',
    Tamil: 'எங்கள் நீட்/ஜேஇஇ கோச்சிங் பற்றி விசாரித்த மாணவர்களை அழைத்து, இலவச டெமோ வகுப்பிற்கு பதிவு செய்து வாட்ஸ்அப்பில் பாடத்திட்டம் அனுப்ப வேண்டும்.',
    Kannada: 'ನಮ್ಮ ನೀಟ್/ಜೆಇಇ ಕೋಚಿಂಗ್ ಬಗ್ಗೆ ವಿಚಾರಿಸಿದ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಕರೆ ಮಾಡಿ, ಉಚಿತ ಡೆಮೊ ತರಗತಿಗೆ ನೋಂದಾಯಿಸಿ ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಪಠ್ಯಕ್ರಮ ಕಳುಹಿಸಬೇಕು.',
    Malayalam: 'ഞങ്ങളുടെ നീറ്റ്/ജെഇഇ കോച്ചിംഗിനെക്കുറിച്ച് അന്വേഷിച്ച വിദ്യാർത്ഥികളെ വിളിച്ച്, സൗജന്യ ഡെമോ ക്ലാസിനായി രജിസ്റ്റർ ചെയ്ത് വാട്ട്‌സ്ആപ്പിൽ സിലബസ് അയക്കണം.',
    Marathi: 'आमच्या नीट/जेईई कोचिंगबद्दल विचारणा करणाऱ्या विद्यार्थ्यांना कॉल करा, मोफत डेमो क्लाससाठी नोंदणी करा आणि व्हॉट्सॲपवर अभ्यासक्रम पाठवा.',
    English: 'Call students inquiring about competitive exam courses, understand their class, and register for a free demo session.',
  },
  'Hospital & clinic': {
    Telugu: 'క్లినిక్ హెల్త్ చెకప్ మరియు డాక్టర్ కన్సల్టేషన్ అపాయింట్‌మెంట్స్ బుక్ చేయడానికి రోగులతో మాట్లాడి సమయం కన్ఫర్మ్ చేయాలి.',
    Hindi: 'मरीजों को कॉल करके डॉक्टर अपॉइंटमेंट और हेल्थ चेकअप पैकेज बुक करें और समय कन्फर्म करें।',
    Tamil: 'மருத்துவமனை ஹெல்த் செக்கப் மற்றும் மருத்துவர் ஆலோசனை முன்பதிவு செய்ய நோயாளிகளிடம் பேசி நேரத்தை உறுதி செய்ய வேண்டும்.',
    Kannada: 'ಕ್ಲಿನಿಕ್ ಹೆಲ್ತ್ ಚೆಕಪ್ ಮತ್ತು ವೈದ್ಯರ ಸಮಾಲೋಚನೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡಲು ರೋಗಿಗಳೊಂದಿಗೆ ಮಾತನಾಡಿ ಸಮಯವನ್ನು ದೃಢಪಡಿಸಬೇಕು.',
    Malayalam: 'ക്ലിനിക് ഹെൽത്ത് ചെക്കപ്പും ഡോക്ടർ കൺസൾട്ടേഷൻ അപ്പോയിന്റ്മെന്റും ബുക്ക് ചെയ്യാൻ രോഗികളോട് സംസാരിച്ച് സമയം സ്ഥിരീകരിക്കണം.',
    Marathi: 'क्लिनिक हेल्थ चेकअप आणि डॉक्टरांच्या भेटीची वेळ बुक करण्यासाठी रुग्णांशी बोला आणि वेळ कन्फर्म करा.',
    English: 'Assist patients with doctor consultation appointments, answer timings, and send WhatsApp confirmation.',
  },
  'Car & bike dealership': {
    Telugu: 'కొత్త కారు కోసం ఎంక్వైరీ చేసిన కస్టమర్లకి కాల్ చేసి, ఎక్స్చేంజ్ ఆఫర్స్ వివరించి, డోర్‌స్టెప్ టెస్ట్ డ్రైవ్ బుక్ చేయాలి.',
    Hindi: 'नए वाहन की पूछताछ करने वाले ग्राहकों को कॉल करें, ऑफर बताएं और घर पर टेस्ट ड्राइव का समय तय करें।',
    Tamil: 'புதிய கார் வாங்க விசாரித்த வாடிக்கையாளர்களை அழைத்து, எக்ஸ்சேஞ்ச் சலுகைகளை விளக்கி, டோர்ஸ்டெப் டெஸ்ட் டிரைவ் புக் செய்ய வேண்டும்.',
    Kannada: 'ಹೊಸ ಕಾರಿಗಾಗಿ ವಿಚಾರಿಸಿದ ಗ್ರಾಹಕರಿಗೆ ಕರೆ ಮಾಡಿ, ಎಕ್ಸ್‌ಚೇಂಜ್ ಆಫರ್‌ಗಳನ್ನು ವಿವರಿಸಿ, ಡೋರ್‌ಸ್ಟೆಪ್ ಟೆಸ್ಟ್ ಡ್ರೈವ್ ಬುಕ್ ಮಾಡಬೇಕು.',
    Malayalam: 'പുതിയ കാറിനായി അന്വേഷിച്ച ഉപഭോക്താക്കളെ വിളിച്ച്, എക്സ്ചേഞ്ച് ഓഫറുകൾ വിശദീകരിച്ച്, ഡോർസ്റ്റെപ്പ് ടെസ്റ്റ് ഡ്രൈവ് ബുക്ക് ചെയ്യണം.',
    Marathi: 'नवीन वाहनाची चौकशी करणाऱ्या ग्राहकांना कॉल करा, एक्सचेंज ऑफर्स सांगा आणि डोअरस्टेप टेस्ट ड्राइव्ह बुक करा.',
    English: 'Call automotive leads, present ongoing exchange offers and discounts, and schedule a doorstep test drive.',
  },
};

const PLACEHOLDERS_BY_LANG: Record<string, string> = {
  Telugu: 'ఉదా: నా Instagram యాడ్ ద్వారా వచ్చే లీడ్స్‌కి కాల్ చేసి వివరాలు కనుక్కోవాలి...',
  Hindi: 'उदा: इंस्टाग्राम विज्ञापन से आने वाले सभी लीड्स को कॉल करके जानकारी प्राप्त करें...',
  Tamil: 'உதா: எனது Instagram விளம்பரம் மூலம் வரும் லீட்களுக்கு கால் செய்து விவரங்களைக் கேட்கவும்...',
  Kannada: 'ಉದಾ: ನನ್ನ Instagram ಜಾಹೀರಾತಿನಿಂದ ಬರುವ ಲೀಡ್‌ಗಳಿಗೆ ಕರೆ ಮಾಡಿ ವಿವರಗಳನ್ನು ಪಡೆಯಿರಿ...',
  Malayalam: 'ഉദാ: എന്റെ Instagram പരസ്യത്തിൽ നിന്നുള്ള ലീഡുകളെ വിളിച്ച് വിവരങ്ങൾ ചോദിക്കുക...',
  Marathi: 'उदा: माझ्या Instagram जाहिरातीवरून येणाऱ्या सर्व लीड्सना कॉल करून माहिती विचारा...',
  English: 'e.g. Call every new enquiry from my Instagram ad, ask what they need, and book a visit.',
};

export function AiEmployeeBuilderHero({ onEmployeeCreated }: AiEmployeeBuilderHeroProps) {
  const navigate = useNavigate();
  const toast = useToast();

  const [callingMode, setCallingMode] = useState<'instant' | 'bulk'>('instant');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('Telugu');
  const [prompt, setPrompt] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [isListeningPrompt, setIsListeningPrompt] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);

  // Voice selection state (fetched from the server: Sarvam stock speakers,
  // Cartesia voices and your cloned voices).
  const LANG_NAME_TO_CODE: Record<string, string> = {
    Telugu: 'te',
    Hindi: 'hi',
    English: 'en',
    Tamil: 'ta',
    Kannada: 'kn',
    Malayalam: 'ml',
    Marathi: 'mr',
  };

  const DEFAULT_VOICE_PER_LANG: Record<string, string> = {
    Telugu: '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b',   // Charan (Pure Telugu)
    Hindi: 'cb9c954d-bcaa-43ed-82bf-aeb5e88a3cb5',     // Kabir (Hindi)
    English: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b',   // Tessa (English)
    Tamil: '01d7796d-ac10-4ea3-8df0-3cc04f2d25ff',     // Kavitha (Tamil)
    Kannada: '4c00ff98-199c-4967-99ae-7b69125edcff',   // Disha (Kannada)
    Malayalam: 'b426013c-002b-4e89-8874-8cd20b68373a', // Latha (Malayalam)
    Marathi: '5c32dce6-936a-4892-b131-bafe474afe5f',   // Anika (Marathi)
  };

  const filterVoicesByLanguage = (langName: string, allList: CartesiaVoice[]): CartesiaVoice[] => {
    if (!allList || allList.length === 0) {
      return [];
    }
    const code = LANG_NAME_TO_CODE[langName] || 'te';

    const directMatches = allList.filter((v) => {
      const vLang = (v.language_code || '').toLowerCase();
      return vLang === code || vLang.startsWith(`${code}-`);
    });

    const cloned = allList.filter((v) => {
      if (!v.is_cloned) return false;
      const vLang = (v.language_code || '').toLowerCase();
      return !vLang || vLang === code || vLang.startsWith(`${code}-`);
    });

    const map = new Map<string, CartesiaVoice>();
    for (const v of directMatches) map.set(v.id, v);
    for (const v of cloned) map.set(v.id, v);

    const result = Array.from(map.values());

    result.sort((a, b) => {
      const aSonic = a.provider === 'cartesia' && !a.is_cloned;
      const bSonic = b.provider === 'cartesia' && !b.is_cloned;
      if (aSonic && !bSonic) return -1;
      if (!aSonic && bSonic) return 1;
      if (a.is_cloned && !b.is_cloned) return -1;
      if (!a.is_cloned && b.is_cloned) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  };

  const [allVoices, setAllVoices] = useState<CartesiaVoice[]>([]);
  const [voices, setVoices] = useState<CartesiaVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(DEFAULT_VOICE_PER_LANG.Telugu);
  const [voicesLoading, setVoicesLoading] = useState(true);

  // Live Voice Sample Preview state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [isPlayingDialogue, setIsPlayingDialogue] = useState<boolean>(false);
  const [isLoadingDialogue, setIsLoadingDialogue] = useState<boolean>(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceReqIdRef = useRef<number>(0);

  // Test Call Modal state after building employee
  const [showTestModal, setShowTestModal] = useState(false);
  const [builtEmployee, setBuiltEmployee] = useState<AIEmployee | null>(null);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [isDialingTestPhone, setIsDialingTestPhone] = useState(false);
  const [dialedCallState, setDialedCallState] = useState<{ callId: string; status: string } | null>(null);

  const stopVoiceSample = () => {
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current.currentTime = 0;
    }
    setPlayingVoiceId(null);
    setLoadingVoiceId(null);
    setIsPlayingDialogue(false);
    setIsLoadingDialogue(false);
  };

  const handlePlayVoiceSample = async (voiceId: string, customText?: string, isDialogue = false) => {
    // If already playing this voice/dialogue, toggle pause
    if (isDialogue ? isPlayingDialogue : (playingVoiceId === voiceId && !isPlayingDialogue)) {
      stopVoiceSample();
      return;
    }

    stopVoiceSample();
    const reqId = ++voiceReqIdRef.current;
    setSelectedVoiceId(voiceId);

    if (isDialogue) {
      setIsLoadingDialogue(true);
    } else {
      setLoadingVoiceId(voiceId);
    }

    try {
      if (!voiceAudioRef.current) {
        voiceAudioRef.current = new Audio();
      }
      const audio = voiceAudioRef.current;
      audio.onended = () => {
        if (reqId === voiceReqIdRef.current) {
          setPlayingVoiceId(null);
          setIsPlayingDialogue(false);
        }
      };
      audio.onerror = () => {
        if (reqId === voiceReqIdRef.current) {
          setPlayingVoiceId(null);
          setIsPlayingDialogue(false);
          toast.error('Could not play audio sample.');
        }
      };

      const textToSynthesize = customText?.trim() || prompt.trim() || undefined;
      const res = await api.post<{ success: boolean; audioUrl: string | null }>('/employees/voice-sample', {
        voice: voiceId,
        text: textToSynthesize,
        language: selectedLanguage,
        provider: voiceProviderForId(voiceId, allVoices.length > 0 ? allVoices : voices),
      });

      if (reqId !== voiceReqIdRef.current) return;
      if (!res.audioUrl) {
        toast.error('No audio returned for this voice.');
        if (isDialogue) setIsLoadingDialogue(false);
        else setLoadingVoiceId(null);
        return;
      }

      audio.src = res.audioUrl;
      if (isDialogue) {
        setIsLoadingDialogue(false);
        setIsPlayingDialogue(true);
      } else {
        setLoadingVoiceId(null);
        setPlayingVoiceId(voiceId);
      }
      await audio.play();
    } catch (err: any) {
      if (reqId === voiceReqIdRef.current) {
        if (isDialogue) setIsLoadingDialogue(false);
        else setLoadingVoiceId(null);
        setPlayingVoiceId(null);
        setIsPlayingDialogue(false);
        toast.error(err?.message || 'Voice preview unavailable');
      }
    }
  };

  useEffect(() => () => {
    stopVoiceSample();
  }, []);

  const handleTestPhoneCall = async () => {
    if (!builtEmployee) return;
    const raw = testPhoneNumber.trim();
    if (!raw) {
      toast.error('Please enter a phone number to test');
      return;
    }
    setIsDialingTestPhone(true);
    try {
      const res = await api.post<{
        success: boolean;
        call: { callId: string; status: string; estimatedCredits: number };
      }>('/calls/instant', {
        employee_id: builtEmployee.id,
        phone: raw,
        name: 'Owner Voice Test',
        purpose: builtEmployee.role || 'Live Phone Test Call',
        is_test: true,
      });
      if (res.success && res.call) {
        setDialedCallState({ callId: res.call.callId, status: res.call.status || 'ringing' });
        toast.success(`📞 Test call dialed to ${raw}! Pick up your phone to test.`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to place test call.');
    } finally {
      setIsDialingTestPhone(false);
    }
  };

  useEffect(() => {
    setVoicesLoading(true);
    api.get<{ success: boolean; voices: { all: CartesiaVoice[] } }>('/employees/voices')
      .then((res) => {
        const catalog = res.voices?.all || [];
        setAllVoices(catalog);
        const filtered = filterVoicesByLanguage(selectedLanguage, catalog);
        setVoices(filtered);
        const defaultVoice = DEFAULT_VOICE_PER_LANG[selectedLanguage] || filtered[0]?.id || '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b';
        setSelectedVoiceId(defaultVoice);
      })
      .catch((err) => {
        console.error('Failed to load Cartesia voices:', err);
        setVoices([]);
      })
      .finally(() => setVoicesLoading(false));
  }, []);

  // Swara voice modal state
  const [isSwaraOpen, setIsSwaraOpen] = useState(false);
  const [swaraMessages, setSwaraMessages] = useState<Array<{ sender: 'swara' | 'user'; text: string }>>([]);
  const [swaraInput, setSwaraInput] = useState('');
  const [swaraListening, setSwaraListening] = useState(false);
  const [swaraSpeaking, setSwaraSpeaking] = useState(false);
  const [swaraLoading, setSwaraLoading] = useState(false);
  const [isBuildingSwara, setIsBuildingSwara] = useState(false);
  const swaraConvIdRef = useRef<string>('');

  const recognitionRef = useRef<any>(null);
  const swaraRecognitionRef = useRef<any>(null);

  // Set prompt based on category and language
  const handleSelectPreset = (category: string) => {
    setActiveCategory(category);
    const categoryTemplates = PRESETS[category];
    if (categoryTemplates) {
      const templateText = categoryTemplates[selectedLanguage] || categoryTemplates.English || categoryTemplates.Telugu;
      setPrompt(templateText);
    }
  };

  const handleLanguageChange = (langName: string) => {
    stopVoiceSample();
    setSelectedLanguage(langName);

    // If a category was chosen, or if the current prompt text matches a preset from ANY language,
    // seamlessly transition the prompt to the new language's preset!
    let targetCategory = activeCategory;
    if (!targetCategory && prompt) {
      for (const [cat, langMap] of Object.entries(PRESETS)) {
        if (Object.values(langMap).some((p) => p.trim() === prompt.trim())) {
          targetCategory = cat;
          setActiveCategory(cat);
          break;
        }
      }
    }

    if (targetCategory && PRESETS[targetCategory]) {
      const categoryTemplates = PRESETS[targetCategory];
      const templateText = categoryTemplates[langName] || categoryTemplates.English || categoryTemplates.Telugu;
      if (templateText) {
        setPrompt(templateText);
      }
    }

    const filtered = filterVoicesByLanguage(langName, allVoices);
    setVoices(filtered);
    const defaultVoice = DEFAULT_VOICE_PER_LANG[langName] || filtered[0]?.id || '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b';
    setSelectedVoiceId(defaultVoice);
  };

  // Mic dictation for prompt input
  const togglePromptMic = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Please use Chrome.');
      return;
    }

    if (isListeningPrompt) {
      recognitionRef.current?.stop();
      setIsListeningPrompt(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      const langObj = LANGUAGES.find((l) => l.name === selectedLanguage);
      rec.lang = langObj?.code || 'te-IN';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => setIsListeningPrompt(true);
      rec.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListeningPrompt(false);
      };
      rec.onerror = () => setIsListeningPrompt(false);
      rec.onend = () => setIsListeningPrompt(false);

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsListeningPrompt(false);
    }
  };

  // Build employee action
  const handleBuildEmployee = async (customPrompt?: string) => {
    const finalPrompt = (customPrompt || prompt).trim();
    if (!finalPrompt && !activeCategory) {
      toast.error('Please describe what your AI employee should do or choose an industry chip.');
      return;
    }

    setIsBuilding(true);
    try {
      const res = await api.post<{ success: boolean; employee: AIEmployee }>('/employees/quick-build', {
        prompt: finalPrompt || activeCategory,
        language: selectedLanguage,
        mode: callingMode,
        category: activeCategory,
        autoSave: true,
        voice: selectedVoiceId,
        voice_provider: voiceProviderForId(selectedVoiceId, allVoices.length > 0 ? allVoices : voices),
      });

      if (res.success && res.employee) {
        toast.success(`✨ AI Employee "${res.employee.name}" created successfully!`);
        setBuiltEmployee(res.employee);
        setShowTestModal(true);
        if (onEmployeeCreated) {
          onEmployeeCreated(res.employee);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to build AI employee. Please try again.');
    } finally {
      setIsBuilding(false);
    }
  };

  // Start Swara Voice Dialog
  const openSwara = () => {
    swaraConvIdRef.current = `swara_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    setIsSwaraOpen(true);
    const initialGreetings: Record<string, string> = {
      Telugu: 'నమస్తే! నేను స్వరా. మీ వ్యాపారం కోసం ఎలాంటి AI ఎంప్లాయ్ కావాలో చెప్పండి. మీ బిజినెస్ పేరు మరియు ముఖ్య ఉద్దేశం ఏమిటి?',
      Hindi: 'नमस्ते! मैं स्वरा हूँ। आपके व्यवसाय के लिए कैसा AI कर्मचारी चाहिए? आपके व्यापार का नाम और मुख्य उद्देश्य क्या है?',
      Tamil: 'வணக்கம்! நான் ஸ்வரா. உங்கள் வணிகத்திற்கு என்ன வகையான AI பணியாளர் தேவை? உங்கள் வணிகத்தின் பெயர் மற்றும் முக்கிய நோக்கம் என்ன?',
      Kannada: 'ನಮಸ್ಕಾರ! ನಾನು ಸ್ವರಾ. ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕಾಗಿ ಯಾವ ರೀತಿಯ AI ಉದ್ಯೋಗಿ ಬೇಕು? ನಿಮ್ಮ ವ್ಯವಹಾರದ ಹೆಸರು ಮತ್ತು ಮುಖ್ಯ ಉದ್ದೇಶವೇನು?',
      Malayalam: 'നമസ്കാരം! ഞാൻ സ്വര. നിങ്ങളുടെ ബിസിനസ്സിനായി ഏത് തരത്തിലുള്ള AI ജീവനക്കാരനാണ് വേണ്ടത്? നിങ്ങളുടെ ബിസിനസ്സിന്റെ പേരും പ്രധാന ലക്ഷ്യവും എന്താണ്?',
      Marathi: 'नमस्कार! मी स्वरा आहे. तुमच्या व्यवसायासाठी तुम्हाला कोणत्या प्रकारचा AI कर्मचारी हवा आहे? तुमच्या व्यवसायाचे नाव आणि मुख्य उद्देश काय आहे?',
      English: 'Hello! I am Swara. Tell me about your business and what you want your AI calling employee to do.',
    };
    const initialText = initialGreetings[selectedLanguage] || initialGreetings.English || initialGreetings.Telugu;
    setSwaraMessages([{ sender: 'swara', text: initialText }]);
    speakSwaraText(initialText);
  };

  // Swara's voice.
  //
  // This used the browser's built-in speechSynthesis, which is the Windows
  // system voice — it has no Telulu/Hindi voice for most users and is what made
  // "Talk to Swara" sound wrong. Sarvam is synthesised server-side with the
  // organization's own key, which is the same voice the employees will use.
  const swaraAudioRef = useRef<HTMLAudioElement | null>(null);
  const swaraAudioUrlRef = useRef<string | null>(null);
  const swaraReqIdRef = useRef(0);

  const stopSwaraSpeech = () => {
    const audio = swaraAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSwaraSpeaking(false);
  };

  const speakSwaraText = async (text: string) => {
    if (!text?.trim()) return;
    const reqId = ++swaraReqIdRef.current;
    setSwaraSpeaking(true);
    try {
      // A single Audio element reused per source keeps playback interruptible
      // (stopSwaraSpeech pauses it) instead of stacking overlapping utterances.
      if (!swaraAudioRef.current) {
        swaraAudioRef.current = new Audio();
      }
      const audio = swaraAudioRef.current;
      audio.onended = () => setSwaraSpeaking(false);
      audio.onerror = () => setSwaraSpeaking(false);

      const res = await api.post<{ success: boolean; audioUrl: string | null }>('/employees/voice-sample', {
        text,
        voice: selectedVoiceId,
        provider: voiceProviderForId(selectedVoiceId, allVoices.length > 0 ? allVoices : voices),
        language: selectedLanguage,
      });
      // A newer message started while this request was in flight.
      if (reqId !== swaraReqIdRef.current || !res.audioUrl) {
        setSwaraSpeaking(false);
        return;
      }
      if (swaraAudioUrlRef.current) URL.revokeObjectURL(swaraAudioUrlRef.current);
      swaraAudioUrlRef.current = res.audioUrl;
      audio.src = res.audioUrl;
      await audio.play();
    } catch {
      if (reqId === swaraReqIdRef.current) setSwaraSpeaking(false);
    }
  };

  // Release the object URL when the component unmounts.
  useEffect(() => () => {
    stopSwaraSpeech();
    if (swaraAudioUrlRef.current) URL.revokeObjectURL(swaraAudioUrlRef.current);
  }, []);

  // Swara Mic Input
  const toggleSwaraMic = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser.');
      return;
    }

    if (swaraListening) {
      swaraRecognitionRef.current?.stop();
      setSwaraListening(false);
      return;
    }

    stopSwaraSpeech();

    try {
      const rec = new SpeechRecognition();
      const langObj = LANGUAGES.find((l) => l.name === selectedLanguage);
      rec.lang = langObj?.code || 'te-IN';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => setSwaraListening(true);
      rec.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          sendSwaraMessage(transcript);
        }
        setSwaraListening(false);
      };
      rec.onerror = () => setSwaraListening(false);
      rec.onend = () => setSwaraListening(false);

      swaraRecognitionRef.current = rec;
      rec.start();
    } catch {
      setSwaraListening(false);
    }
  };

  const sendSwaraMessage = async (text: string) => {
    if (!text.trim()) return;
    const newMessages = [...swaraMessages, { sender: 'user' as const, text }];
    setSwaraMessages(newMessages);
    setSwaraInput('');
    setSwaraLoading(true);

    try {
      const res = await api.post<{ success: boolean; reply: string }>('/employees/swara-chat', {
        messages: newMessages.map((m) => ({
          role: m.sender === 'swara' ? 'assistant' : 'user',
          content: m.text,
        })),
        language: selectedLanguage,
      });

      if (res.reply) {
        setSwaraMessages([...newMessages, { sender: 'swara', text: res.reply }]);
        speakSwaraText(res.reply);
      }
    } catch {
      const fallbackReplyMap: Record<string, string> = {
        Telugu: 'సరిగ్గా అర్థం చేసుకున్నాను! మీ అవసరాలకు తగిన AI ఎంప్లాయ్ తయారు చేయడానికి క్రింద ఉన్న బటన్ క్లిక్ చేయండి.',
        Hindi: 'मैं समझ गई! अपने व्यवसाय के अनुसार AI कर्मचारी बनाने के लिए नीचे दिए गए बटन पर क्लिक करें।',
        Tamil: 'நான் சரியாக புரிந்து கொண்டேன்! உங்கள் தேவைக்கேற்ப AI பணியாளரை உருவாக்க கீழே உள்ள பொத்தானைக் கிளிக் செய்யவும்.',
        Kannada: 'ನಾನು ಸರಿಯಾಗಿ ಅರ್ಥಮಾಡಿಕೊಂಡಿದ್ದೇನೆ! ನಿಮ್ಮ ಅಗತ್ಯಕ್ಕೆ ತಕ್ಕ AI ಉದ್ಯೋಗಿಯನ್ನು ರಚಿಸಲು ಕೆಳಗಿನ ಬಟನ್ ಕ್ಲಿಕ್ ಮಾಡಿ.',
        Malayalam: 'ഞാൻ ശരിയായി മനസ്സിലാക്കി! നിങ്ങളുടെ ആവശ്യത്തിനനുസരിച്ച് AI ജീവനക്കാരനെ സൃഷ്ടിക്കാൻ താഴെയുള്ള ബട്ടണിൽ ക്ലിക്ക് ചെയ്യുക.',
        Marathi: 'मला समजले! तुमच्या गरजेनुसार AI कर्मचारी तयार करण्यासाठी खालील बटणावर क्लिक करा.',
        English: 'Got it! Click the button below to generate your AI employee now.',
      };
      const fallbackReply = fallbackReplyMap[selectedLanguage] || fallbackReplyMap.English;
      setSwaraMessages([...newMessages, { sender: 'swara', text: fallbackReply }]);
      speakSwaraText(fallbackReply);
    } finally {
      setSwaraLoading(false);
    }
  };

  const handleBuildFromSwara = async () => {
    stopSwaraSpeech();
    const userMessages = swaraMessages.filter((m) => m.sender === 'user');
    const userSummary = userMessages.map((m) => m.text).join('. ').trim();

    // Check if user has answered or provided any details
    if (!userSummary && !prompt && !activeCategory) {
      toast.error('Please tell Swara your business name or what you need first.');
      return;
    }

    setIsBuildingSwara(true);
    try {
      const finalPrompt = userSummary || prompt || activeCategory || 'Custom Business Assistant';
      const convId = swaraConvIdRef.current || `swara_${Date.now()}`;
      const res = await api.post<{ success: boolean; employee: AIEmployee }>('/employees/quick-build', {
        prompt: finalPrompt,
        conversation: swaraMessages,
        conversationId: convId,
        language: selectedLanguage,
        mode: callingMode,
        category: activeCategory,
        autoSave: true,
        voice: selectedVoiceId,
        voice_provider: voiceProviderForId(selectedVoiceId, voices),
      });

      if (res.success && res.employee) {
        toast.success(`✨ AI Employee "${res.employee.name}" created successfully!`);
        setIsSwaraOpen(false);
        setBuiltEmployee(res.employee);
        setShowTestModal(true);
        if (onEmployeeCreated) {
          onEmployeeCreated(res.employee);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to build AI employee from conversation. Please try again.');
    } finally {
      setIsBuildingSwara(false);
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-purple-900/40 bg-gradient-to-br from-[#16102e] via-[#100b24] to-[#0a0718] p-3 sm:p-6 md:p-8 text-white shadow-2xl shadow-purple-950/60 transition-all max-w-full">
        {/* Ambient background glow orbs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-purple-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-indigo-600/15 blur-3xl" />

        {/* Top Header Tag & Title Row */}
        <div className="relative z-10 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-purple-300/80">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-purple-400 shrink-0" />
              <span className="truncate">DESCRIBE THE JOB · WE BUILD THE EMPLOYEE</span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:gap-3">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white md:text-3xl">
                Build your AI employee
              </h2>
              <span className="inline-flex items-center rounded-md border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-amber-300 shadow-sm">
                FREE
              </span>
            </div>

            <p className="mt-1 text-xs text-zinc-400 md:text-sm">
              Describe the job in a few sentences. You only pay for the calls they make.
            </p>
          </div>

          {/* Top-right grid launcher button */}
          <button
            type="button"
            onClick={() => setShowTemplatesModal(true)}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white shrink-0"
            title="Browse industry templates"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        {/* Main interactive grid: Left Builder & Right Voice Agent */}
        <div className="relative z-10 mt-4 sm:mt-6 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 max-w-full">
          {/* Left Column: Mode toggles, Language chips, and Prompt Input Box */}
          <div className="flex flex-col justify-between lg:col-span-8 min-w-0 max-w-full">
            {/* Control Bar: Calling Mode + Indic Languages */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 max-w-full">
              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1 rounded-xl sm:rounded-full border border-white/10 bg-black/40 p-1 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setCallingMode('instant')}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-full px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-all ${
                    callingMode === 'instant'
                      ? 'bg-white text-zinc-950 shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-current shrink-0" />
                  <span className="truncate">Instant Lead Calling</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCallingMode('bulk')}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-full px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-all ${
                    callingMode === 'bulk'
                      ? 'bg-white text-zinc-950 shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Megaphone className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span className="truncate">Bulk Calling</span>
                </button>
              </div>

              {/* Language Selector */}
              <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-thin max-w-full">
                <span className="mr-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500 shrink-0">
                  PRIMARY
                </span>

                {LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguage === lang.name;
                  return (
                    <button
                      key={lang.name}
                      type="button"
                      onClick={() => handleLanguageChange(lang.name)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all shrink-0 select-none cursor-pointer ${
                        isSelected
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-white shadow-md shadow-amber-900/40 ring-1 ring-amber-400/40'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Voice Selector Row — fetched live with audio sample preview */}
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin max-w-full">
              <span className="mr-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500 shrink-0">
                VOICE
              </span>

              {voicesLoading && (
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading voices...
                </span>
              )}

              {!voicesLoading && (
                <>
                  {/* Individual Voice Chips */}
                  {voices.map((v) => {
                    const isActive = selectedVoiceId === v.id;
                    const isVoicePlaying = playingVoiceId === v.id && !isPlayingDialogue;
                    const isVoiceLoading = loadingVoiceId === v.id && !isLoadingDialogue;
                    const genderEmoji = v.gender === 'female' ? '👩' : '👨';
                    const displayName = v.name.split(' - ')[0].split('(')[0].trim();
                    const isSonic = v.provider === 'cartesia' && !v.is_cloned;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handlePlayVoiceSample(v.id)}
                        title={`${v.name} · Click to select and hear voice sample`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition shrink-0 border cursor-pointer ${
                          isActive
                            ? 'border-purple-500/80 bg-purple-500/25 font-semibold text-purple-200 shadow-sm ring-1 ring-purple-500/40'
                            : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span>{genderEmoji}</span>
                        <span className="max-w-[100px] truncate">{displayName}</span>
                        {v.is_cloned ? (
                          <span className="text-amber-400 text-[9px] font-bold">★</span>
                        ) : isSonic ? (
                          <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[8px] font-bold text-amber-300 border border-amber-500/30">
                            Sonic
                          </span>
                        ) : null}
                        {isVoiceLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-purple-300" />
                        ) : isVoicePlaying ? (
                          <span className="flex items-center gap-0.5">
                            <span className="h-2 w-0.5 bg-purple-300 animate-[pulse_0.4s_ease-in-out_infinite]" />
                            <span className="h-3 w-0.5 bg-purple-200 animate-[pulse_0.6s_ease-in-out_infinite_0.1s]" />
                            <span className="h-1.5 w-0.5 bg-purple-300 animate-[pulse_0.5s_ease-in-out_infinite_0.2s]" />
                          </span>
                        ) : (
                          <Volume2 className={`h-3 w-3 ${isActive ? 'text-purple-300' : 'text-zinc-500 hover:text-zinc-300'}`} />
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {/* Prompt Textarea Card */}
            <div className="mt-3 flex flex-1 flex-col justify-between rounded-2xl border border-purple-900/50 bg-[#090616]/90 p-3 sm:p-4 shadow-inner transition focus-within:border-purple-500/80 max-w-full">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={PLACEHOLDERS_BY_LANG[selectedLanguage] || PLACEHOLDERS_BY_LANG.English}
                rows={3}
                className="w-full resize-none bg-transparent text-xs sm:text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none md:text-base"
              />

              {/* Bottom Action Bar inside Textarea */}
              <div className="mt-3 flex flex-col gap-2.5 border-t border-white/5 pt-3">
                {/* Left: Dictation mic & Industry Chips */}
                <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                  <button
                    type="button"
                    onClick={togglePromptMic}
                    className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border transition shrink-0 ${
                      isListeningPrompt
                        ? 'animate-pulse border-red-500 bg-red-500/20 text-red-400'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                    }`}
                    title={isListeningPrompt ? 'Stop voice typing' : 'Voice type prompt in selected language'}
                  >
                    <Mic className="h-3.5 w-3.5" />
                  </button>

                  {Object.keys(PRESETS).map((cat) => {
                    const isActive = activeCategory === cat;
                    const icons: Record<string, string> = {
                      'Real estate': '🏢',
                      'Coaching & tuition': '📚',
                      'Hospital & clinic': '🩺',
                      'Car & bike dealership': '🚗',
                    };

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleSelectPreset(cat)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs transition max-w-full ${
                          isActive
                            ? 'border border-purple-500/60 bg-purple-500/20 font-medium text-purple-200 shadow-sm'
                            : 'border border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                        }`}
                      >
                        <span>{icons[cat]}</span>
                        <span className="truncate">{cat}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Right: Golden Build Employee Button */}
                <button
                  type="button"
                  onClick={() => handleBuildEmployee()}
                  disabled={isBuilding}
                  className="w-full sm:w-auto sm:self-end inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 via-amber-700 to-yellow-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-950/50 transition hover:from-amber-500 hover:to-yellow-500 active:scale-95 disabled:opacity-50 md:text-sm"
                >
                  {isBuilding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Building AI Employee...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 fill-current text-amber-200" />
                      Build my employee
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Middle Vertical Divider with "OR" badge */}
          <div className="hidden items-center justify-center lg:flex lg:col-span-1">
            <div className="relative flex h-full w-full items-center justify-center">
              <div className="h-full w-px bg-gradient-to-b from-purple-900/10 via-purple-700/40 to-purple-900/10" />
              <div className="absolute rounded-md border border-purple-800/40 bg-[#120d26] px-1.5 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-400 shadow-lg">
                OR
              </div>
            </div>
          </div>

          {/* Right Column: "Talk to Swara" Interactive Voice Card */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-purple-900/30 bg-[#0b081a]/60 p-5 text-center lg:col-span-3">
            {/* "BEST RESULT" Tag */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 shadow-sm">
              <Sparkles className="h-3 w-3 fill-current text-amber-400" />
              BEST RESULT
            </div>

            {/* Glowing Purple Voice Orb with Golden Orbit Arc */}
            <div className="relative mt-4 flex items-center justify-center">
              {/* Outer Golden Crescent / Orbit Ring */}
              <div className="pointer-events-none absolute h-28 w-28 animate-[spin_8s_linear_infinite] rounded-full border-t-2 border-r-2 border-amber-400/90" />

              {/* Glowing Interactive Voice Button */}
              <button
                type="button"
                onClick={openSwara}
                className="group relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-violet-500 shadow-[0_0_35px_rgba(147,51,234,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_45px_rgba(168,85,247,0.8)] active:scale-95"
                title="Talk to Swara to build your employee with voice"
              >
                <div className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition group-hover:opacity-100" />
                <Mic className="h-9 w-9 text-white drop-shadow-md transition-transform duration-300 group-hover:scale-110" />
              </button>
            </div>

            {/* Title and Subtitle */}
            <h3 className="mt-4 text-base font-extrabold tracking-tight text-white md:text-lg">
              Talk to Swara
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              She asks what you&apos;d forget to type
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={openSwara}
              className="mt-3 h-8 border-purple-700/40 bg-purple-950/30 text-xs text-purple-200 hover:bg-purple-900/50 hover:text-white"
            >
              Start Voice Call
            </Button>
          </div>
        </div>
      </div>

      {/* Interactive Swara Voice Dialog */}
      {/* Interactive Swara Voice Dialog */}
      <Dialog
        open={isSwaraOpen}
        onOpenChange={(open) => {
          if (!open) stopSwaraSpeech();
          setIsSwaraOpen(open);
        }}
        className="max-w-xl w-full border border-purple-800/50 bg-gradient-to-b from-[#140e33] to-[#0c0822] p-0 text-white shadow-[0_0_60px_rgba(124,58,237,0.35)] rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col max-h-[92vh] sm:max-h-[85vh]"
      >
        {/* Top vibrant glowing accent stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-amber-400 to-indigo-500 shrink-0" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between border-b border-purple-900/40 bg-purple-950/20 px-3.5 py-3 pr-11 sm:px-5 sm:py-3.5 sm:pr-14 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="relative flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-violet-500 shadow-md shadow-purple-600/40">
              <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              {/* Online / Active pulse status ring */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-[#140e33] ${
                  swaraSpeaking ? 'bg-purple-400 animate-ping' : 'bg-emerald-500'
                }`}
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-[#140e33] ${
                  swaraSpeaking ? 'bg-purple-400' : 'bg-emerald-500'
                }`}
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-base font-bold text-white tracking-tight truncate">
                Swara · AI Employee Architect
              </h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 sm:gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-purple-300">
                  <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-purple-400" />
                  {selectedLanguage}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium text-zinc-400">
                  {callingMode === 'bulk' ? 'Bulk' : 'Instant'}
                </span>
              </div>
            </div>
          </div>

          {/* Voice Output Toggle */}
          <button
            type="button"
            onClick={
              swaraSpeaking
                ? stopSwaraSpeech
                : () => speakSwaraText(swaraMessages[swaraMessages.length - 1]?.text || '')
            }
            className={`flex h-7 sm:h-8 items-center gap-1 rounded-lg border px-2 sm:px-2.5 text-[11px] sm:text-xs font-medium transition shrink-0 ${
              swaraSpeaking
                ? 'border-purple-500 bg-purple-600/30 text-purple-200'
                : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
            title={swaraSpeaking ? 'Mute Swara voice' : 'Listen to Swara voice'}
          >
            {swaraSpeaking ? (
              <>
                <div className="flex items-center gap-0.5">
                  <span className="h-2 w-0.5 bg-purple-300 animate-[pulse_0.4s_ease-in-out_infinite]" />
                  <span className="h-3 w-0.5 bg-purple-200 animate-[pulse_0.6s_ease-in-out_infinite_0.1s]" />
                  <span className="h-1.5 w-0.5 bg-purple-300 animate-[pulse_0.5s_ease-in-out_infinite_0.2s]" />
                </div>
                <span className="hidden sm:inline">Speaking</span>
              </>
            ) : (
              <>
                <Volume2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Play Voice</span>
              </>
            )}
          </button>
        </div>

        {/* Live Audio / Status Indicator Strip */}
        {swaraSpeaking && (
          <div className="flex items-center justify-between border-b border-purple-800/30 bg-purple-950/50 px-3.5 py-1.5 sm:px-5 text-[11px] sm:text-xs text-purple-200 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-0.5 shrink-0">
                <span className="h-2 w-0.5 rounded-full bg-purple-400 animate-[pulse_0.5s_ease-in-out_infinite]" />
                <span className="h-3 w-0.5 rounded-full bg-purple-300 animate-[pulse_0.7s_ease-in-out_infinite_0.1s]" />
                <span className="h-1.5 w-0.5 rounded-full bg-purple-400 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                <span className="h-3.5 w-0.5 rounded-full bg-purple-200 animate-[pulse_0.4s_ease-in-out_infinite_0.15s]" />
              </div>
              <span className="font-medium truncate max-w-[200px] sm:max-w-none">
                Swara speaking in {selectedLanguage}...
              </span>
            </div>
            <button
              type="button"
              onClick={stopSwaraSpeech}
              className="text-[10px] sm:text-[11px] text-purple-300 hover:text-white underline shrink-0 ml-2"
            >
              Mute
            </button>
          </div>
        )}

        {swaraListening && (
          <div className="flex items-center justify-between border-b border-rose-800/30 bg-rose-950/60 px-3.5 py-1.5 sm:px-5 text-[11px] sm:text-xs text-rose-200 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </span>
              <span className="font-medium truncate max-w-[190px] sm:max-w-none">
                Listening to your voice... Speak now
              </span>
            </div>
            <button
              type="button"
              onClick={toggleSwaraMic}
              className="text-[10px] sm:text-[11px] text-rose-300 hover:text-white underline shrink-0 ml-2"
            >
              Done
            </button>
          </div>
        )}

        {/* Conversation History Area */}
        <div className="flex-1 min-h-[140px] max-h-[38vh] sm:max-h-72 space-y-2.5 sm:space-y-3 overflow-y-auto p-3.5 sm:p-5 text-sm scrollbar-thin scrollbar-thumb-purple-900 scrollbar-track-transparent">
          {swaraMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${
                msg.sender === 'swara' ? 'items-start' : 'items-end'
              }`}
            >
              <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-zinc-400 mb-0.5 px-1">
                {msg.sender === 'swara' ? (
                  <>
                    <Bot className="h-2.5 w-2.5 text-purple-400" />
                    <span>Swara</span>
                  </>
                ) : (
                  <span>You</span>
                )}
              </div>
              <div
                className={`group relative max-w-[88%] sm:max-w-[85%] rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'swara'
                    ? 'rounded-tl-xs border border-purple-800/40 bg-[#19113d]/90 text-purple-50 shadow-md'
                    : 'rounded-tr-xs bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-semibold shadow-md shadow-amber-950/30'
                }`}
              >
                {msg.text}

                {/* Quick listen button for Swara messages */}
                {msg.sender === 'swara' && (
                  <button
                    type="button"
                    onClick={() => speakSwaraText(msg.text)}
                    className="ml-1.5 inline-flex items-center opacity-40 hover:opacity-100 transition text-purple-300"
                    title="Listen to this message"
                  >
                    <Volume2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {swaraLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-purple-800/30 bg-purple-950/40 px-3 py-1.5 text-xs text-purple-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
              <span>Swara is understanding your requirements...</span>
            </div>
          )}
        </div>

        {/* Swara Input Bar & Mic */}
        <div className="border-t border-purple-900/40 bg-purple-950/20 p-3 sm:p-4 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleSwaraMic}
              className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                swaraListening
                  ? 'animate-pulse bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.6)] ring-2 ring-rose-400'
                  : 'border border-purple-500/40 bg-purple-600/20 text-purple-200 hover:bg-purple-600/40 hover:scale-105 active:scale-95'
              }`}
              title={swaraListening ? 'Stop recording voice' : 'Speak with your voice'}
            >
              <Mic className="h-4 w-4" />
            </button>

            <input
              type="text"
              value={swaraInput}
              onChange={(e) => setSwaraInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendSwaraMessage(swaraInput);
                }
              }}
              placeholder={`Type or speak in ${selectedLanguage}...`}
              className="flex-1 rounded-xl border border-purple-800/50 bg-[#120d2a] px-3 py-2 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:border-purple-400 focus:bg-[#161033] focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition min-w-0"
            />

            <button
              type="button"
              onClick={() => sendSwaraMessage(swaraInput)}
              disabled={!swaraInput.trim()}
              className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition hover:bg-purple-500 disabled:opacity-30 disabled:hover:bg-purple-600 shadow-sm"
              title="Send response"
            >
              <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] sm:text-[11px] text-zinc-400 truncate">
            🎙️ Tap mic to speak or type in <span className="font-semibold text-purple-300">{selectedLanguage}</span>
          </p>
        </div>

        {/* Create Employee CTA Button */}
        <div className="border-t border-purple-900/30 bg-[#090616] p-3 sm:p-4 shrink-0">
          <Button
            type="button"
            onClick={handleBuildFromSwara}
            disabled={isBuildingSwara}
            className="w-full h-10 sm:h-11 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 font-extrabold text-xs sm:text-sm shadow-[0_0_20px_rgba(245,158,11,0.35)] transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 disabled:opacity-60 cursor-pointer"
          >
            {isBuildingSwara ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-zinc-950 shrink-0" />
                <span className="truncate">Building AI Employee from Conversation...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current text-zinc-950 shrink-0" />
                <span className="truncate">Build AI Employee from Conversation</span>
              </>
            )}
          </Button>
        </div>
      </Dialog>

      {/* Templates Drawer / Modal */}
      <Dialog
        open={showTemplatesModal}
        onOpenChange={setShowTemplatesModal}
        className="max-w-lg w-full border border-purple-800/40 bg-[#0d0924] p-0 text-white shadow-[0_0_50px_rgba(147,51,234,0.3)] rounded-2xl overflow-hidden"
      >
        <div className="border-b border-purple-900/40 bg-purple-950/30 px-5 py-4 pr-12">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-purple-400" />
            Ready-to-use Industry Templates
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Select a template configured for {selectedLanguage}
          </p>
        </div>

        <div className="grid gap-2.5 p-5 max-h-[65vh] overflow-y-auto scrollbar-thin">
          {Object.entries(PRESETS).map(([category, langMap]) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                handleSelectPreset(category);
                setShowTemplatesModal(false);
              }}
              className="flex items-start justify-between rounded-xl border border-purple-800/30 bg-purple-950/20 p-3.5 text-left transition hover:border-purple-500/50 hover:bg-purple-900/30"
            >
              <div>
                <h4 className="font-semibold text-white text-sm">{category}</h4>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                  {langMap[selectedLanguage] || langMap.Telugu || langMap.English}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-purple-400 mt-1" />
            </button>
          ))}
        </div>
      </Dialog>

      {/* Test Call Modal after Building Employee */}
      <Dialog
        open={showTestModal}
        onOpenChange={(open) => {
          setShowTestModal(open);
          if (!open) setDialedCallState(null);
        }}
        className="max-w-xl w-full border border-purple-800/50 bg-gradient-to-b from-[#161033] via-[#0f0b24] to-[#0a0718] p-0 text-white shadow-[0_0_70px_rgba(147,51,234,0.4)] rounded-2xl overflow-hidden backdrop-blur-xl"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-purple-500 to-emerald-400 shrink-0" />

        <div className="border-b border-purple-900/40 bg-purple-950/30 p-4 sm:p-5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI Voice Employee Ready
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
              ⚡ Real-Time Voice Pipeline
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              Autonomous Mode
            </span>
            {builtEmployee?.cartesia_agent_id ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-medium text-purple-200 shadow-sm"
                title="Voice engine synchronized and active"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Voice Synced</span>
              </span>
            ) : null}
          </div>

          <h3 className="mt-2 text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
            {builtEmployee?.name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            {builtEmployee?.role} · {builtEmployee?.language}
          </p>

          {/* Real-time Voice Architecture Specs Box */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-purple-800/40 bg-black/40 p-2.5 text-[11px]">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">🎙️ Speech Recognition</span>
              <span className="text-zinc-200 font-medium">Ultra-HD Audio Engine</span>
              <span className="text-[10px] text-emerald-400">{builtEmployee?.language || 'Telugu'} (Native)</span>
            </div>
            <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-white/10 sm:pl-2.5 pt-1.5 sm:pt-0">
              <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">🧠 AI Intelligence</span>
              <span className="text-zinc-200 font-medium">Conversational AI</span>
              <span className="text-[10px] text-purple-300">Autonomous Telecaller Logic</span>
            </div>
            <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-white/10 sm:pl-2.5 pt-1.5 sm:pt-0">
              <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">🔊 Voice Synthesis</span>
              <span className="text-amber-300 font-medium">Ultra-Realistic HD Voice</span>
              <span className="text-[10px] text-zinc-400 truncate">
                {voices.find((v) => v.id === builtEmployee?.voice)?.name?.split('(')[0]?.trim() || 'Natural Voice'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
          {/* Keyterm recognition chips */}
          <div className="rounded-xl border border-purple-800/30 bg-purple-950/20 p-3 space-y-1.5">
            <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
              <span>🎯</span> Smart Keyword Recognition:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(
                (typeof builtEmployee?.livekit_metadata === 'string'
                  ? JSON.parse(builtEmployee.livekit_metadata || '{}')?.pipeline?.stt?.custom_keyterms
                  : (builtEmployee?.livekit_metadata as any)?.pipeline?.stt?.custom_keyterms) ||
                (builtEmployee as any)?.custom_keyterms || [
                  '2BHK',
                  '3BHK',
                  'బడ్జెట్',
                  'సైట్ విజిట్',
                  'ఇన్‌స్టాగ్రామ్',
                  'ఫ్లాట్',
                  'RERA',
                ]
              ).map((k: string, i: number) => (
                <span
                  key={i}
                  className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-200"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-purple-800/30 bg-purple-950/20 p-3 text-xs text-purple-200/90 leading-relaxed">
            <span className="font-semibold text-white">Opening Greeting:</span> &ldquo;{builtEmployee?.greeting}&rdquo;
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Card 1: Browser Live Call */}
            <div className="flex flex-col justify-between rounded-xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/30 to-purple-950/20 p-4 transition hover:border-indigo-500/60">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
                    <Radio className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Browser Live Call</h4>
                    <p className="text-[10px] text-zinc-400">Instant microphone test</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-300 leading-relaxed">
                  Speak directly with <strong className="text-white">{builtEmployee?.name}</strong> using your browser microphone with immediate low-latency responses.
                </p>
              </div>

              <Button
                onClick={() => {
                  setShowTestModal(false);
                  if (builtEmployee) navigate(`/employees/${builtEmployee.id}/call`);
                }}
                className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-9 gap-1.5 shadow-md shadow-indigo-950 cursor-pointer"
              >
                <Radio className="h-3.5 w-3.5" /> Start Browser Call
              </Button>
            </div>

            {/* Card 2: Real Phone Call */}
            <div className="flex flex-col justify-between rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/30 to-purple-950/20 p-4 transition hover:border-emerald-500/60">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/30">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Call Real Phone</h4>
                    <p className="text-[10px] text-zinc-400">Direct Telephony Carrier</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-300 leading-relaxed">
                  Our telecommunications carrier will dial your mobile phone so you can test how the employee sounds on a real call.
                </p>

                <div className="mt-3 space-y-1.5">
                  <input
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    className="w-full rounded-lg border border-purple-800/40 bg-black/50 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
                  />
                  {dialedCallState && (
                    <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      Status: {dialedCallState.status}... Check your phone!
                    </p>
                  )}
                </div>
              </div>

              <Button
                onClick={handleTestPhoneCall}
                disabled={isDialingTestPhone || !testPhoneNumber.trim()}
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 gap-1.5 shadow-md shadow-emerald-950 disabled:opacity-50 cursor-pointer"
              >
                {isDialingTestPhone ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Dialing Phone...
                  </>
                ) : (
                  <>
                    <Phone className="h-3.5 w-3.5" />
                    Call My Phone Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-purple-900/30 bg-[#090616] p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowTestModal(false);
              if (builtEmployee) navigate(`/employees/${builtEmployee.id}`);
            }}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Configure Prompt &amp; Voice Settings
          </Button>

          <Button
            size="sm"
            onClick={() => setShowTestModal(false)}
            className="bg-white/10 hover:bg-white/20 text-white text-xs px-4"
          >
            Done
          </Button>
        </div>
      </Dialog>
    </>
  );
}
