import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Volume2,
  VolumeX,
  Loader2,
  Check,
  Sparkles,
  Mic,
  Bot,
  Globe2,
  AlertCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useVoices } from '@/hooks/queries';
import { api } from '@/lib/api';
import type { VoiceOption } from '@/types';

interface VoiceSelectorProps {
  selectedVoiceId?: string;
  selectedProvider?: string;
  onSelect: (voice: VoiceOption) => void;
  /** Primary language chosen by the user, e.g. "Telugu". Drives the default filter. */
  language?: string;
  onPreviewError?: (message: string) => void;
  className?: string;
}

// Display name -> ISO 639-1 code. Cartesia/Sarvam return bare codes ("te"), so we
// normalise both directions against this.
export const LANGUAGE_CODES: Record<string, string> = {
  Telugu: 'te',
  Hindi: 'hi',
  Tamil: 'ta',
  Kannada: 'kn',
  Malayalam: 'ml',
  Marathi: 'mr',
  English: 'en',
  Bengali: 'bn',
  Gujarati: 'gu',
  Punjabi: 'pa',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Japanese: 'ja',
  Arabic: 'ar',
  Portuguese: 'pt',
  Italian: 'it',
  Russian: 'ru',
  Chinese: 'zh',
  Korean: 'ko',
  Dutch: 'nl',
  Turkish: 'tr',
  Polish: 'pl',
  Swedish: 'sv',
};

const CODE_TO_LANGUAGE: Record<string, string> = Object.fromEntries(
  Object.entries(LANGUAGE_CODES).map(([name, code]) => [code, name])
);

// Short greeting per language so a preview sounds like the voice will on a call
// instead of reading a generic English sentence in a Telugu voice.
const PREVIEW_PHRASES: Record<string, string> = {
  te: 'నమస్కారం అండి! నేను మీకు ఎలా సహాయపడగలను?',
  hi: 'नमस्ते! मैं आपकी किस तरह मदद कर सकता हूँ?',
  ta: 'வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?',
  kn: 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?',
  ml: 'നമസ്കാരം! എനിക്ക് നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?',
  mr: 'नमस्कार! मी तुम्हाला कसे मदत करू शकतो?',
  en: 'Hello! This is how I will sound when I call your customers.',
  bn: 'হ্যালো! আমি আপনার গ্রাহকদের সাথে এভাবেই কথা বলব।',
  gu: 'નમસ્તે! હું તમારા ગ્રાહકો સાથે આવી રીતે બોલીશ.',
  pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੇ ਗਾਣਕਾਂ ਨਾਲ ਇਸ ਤਰ੍ਹਾਂ ਬੋਲਾਂਗਾ।',
};

/** Reads the code off a voice regardless of which field the provider populated. */
function voiceCode(v: VoiceOption): string {
  const raw = String(v.language_code || v.language || '').toLowerCase();
  return raw.split('-')[0].split('_')[0];
}

export function voiceLanguageName(v: VoiceOption): string {
  return v.language_name || CODE_TO_LANGUAGE[voiceCode(v)] || 'Multilingual';
}

export function VoiceSelector({
  selectedVoiceId,
  onSelect,
  language,
  onPreviewError,
  className = '',
}: VoiceSelectorProps) {
  const { data: voicesData, isLoading, isError, refetch } = useVoices();
  const [search, setSearch] = useState('');
  // A *user override* on top of the primary language, so we derive the effective
  // filter instead of syncing it in an effect:
  //   undefined = follow the primary language (the default)
  //   null     = user explicitly chose "all languages"
  //   'te'     = user explicitly chose one language
  // Picking a new primary language therefore re-points the list on its own,
  // while an explicit choice survives the next language change.
  const [langOverride, setLangOverride] = useState<string | null | undefined>(undefined);
  const [showClonedOnly, setShowClonedOnly] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Monotonic token identifying the newest preview request.
  const requestRef = useRef(0);

  const apiVoices: VoiceOption[] = useMemo(() => {
    if (!voicesData?.voices) return [];
    const all = (voicesData.voices as { all?: VoiceOption[] }).all;
    if (Array.isArray(all) && all.length > 0) return all;
    const cartesia = (voicesData.voices as { cartesia?: VoiceOption[] }).cartesia || [];
    const cloned = (voicesData.voices as { cloned?: VoiceOption[] }).cloned || [];
    return [...cloned, ...cartesia];
  }, [voicesData]);

  // When the user picks a primary language, the library follows it: they asked for
  // Telugu, so the list opens on Telugu rather than a hardcoded default tab.
  const primaryCode = language ? LANGUAGE_CODES[language] || null : null;
  const filterLang = langOverride === undefined ? primaryCode : langOverride;

  // Languages actually present in the response, with counts. Never hardcoded, so a
  // language with no voices does not offer an empty tab.
  const languages = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const v of apiVoices) {
      const code = voiceCode(v);
      if (!code) continue;
      const prev = counts.get(code);
      counts.set(code, { name: voiceLanguageName(v), count: (prev?.count ?? 0) + 1 });
    }
    return [...counts.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [apiVoices]);

  const clonedCount = useMemo(() => apiVoices.filter((v) => v.is_cloned).length, [apiVoices]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apiVoices.filter((v) => {
      if (filterLang && voiceCode(v) !== filterLang) return false;
      if (showClonedOnly && !v.is_cloned) return false;
      if (!q) return true;
      return (
        v.name?.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        voiceLanguageName(v).toLowerCase().includes(q) ||
        v.gender?.toLowerCase().includes(q)
      );
    });
  }, [apiVoices, filterLang, search, showClonedOnly]);

  // Tears down the current element without letting it report anything.
//
// Two traps here, both of which produced a bogus "couldn't be decoded" banner on a
// voice that was playing fine:
//   1. Assigning `src = ''` makes the browser resolve it against the document base
//      URL and attempt a load, which fires `error` on the element being discarded.
//   2. That element's handlers are still attached, so a teardown triggered by
//      clicking the *next* voice would set state for the voice now on screen.
//
// So: clear the ref first, detach the handlers, and never touch `src`.
const stopPreview = () => {
  // Invalidate anything in flight so a slow response cannot start playing.
  requestRef.current += 1;
  const el = audioRef.current;
  audioRef.current = null;
  if (el) {
    el.onended = null;
    el.onerror = null;
    el.pause();
  }
  setPlayingId(null);
  setLoadingAudioId(null);
};

useEffect(() => stopPreview, []);

const handlePlayPreview = async (e: React.MouseEvent, voice: VoiceOption) => {
    e.stopPropagation();
    setPreviewError(null);

    if (playingId === voice.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const token = ++requestRef.current;
    // Every await below can outlive the click that started it, and state read from
    // this closure is stale by then. The token is the only reliable "am I still the
    // current request?" test, so a superseded preview can never mutate state.
    const isCurrent = () => requestRef.current === token;

    const code = voiceCode(voice);
    setLoadingAudioId(voice.id);
    let audio: HTMLAudioElement | null = null;

    try {
      const res = await api.post<{ success: boolean; audioUrl: string }>('/employees/voice-sample', {
        voice: voice.id,
        text: PREVIEW_PHRASES[code] || PREVIEW_PHRASES.en,
        language: voice.language || voice.language_code || code,
        provider: voice.provider || 'cartesia',
      });

      if (!isCurrent()) return;
      if (!res.audioUrl) throw new Error('No audio returned');

      audio = new Audio(res.audioUrl);
      audio.preload = 'auto';
      audioRef.current = audio;

      audio.onended = () => {
        if (isCurrent()) stopPreview();
      };
      audio.onerror = () => {
        if (!isCurrent()) return;
        stopPreview();
        setPreviewError(`Couldn't play ${voice.name}. Try another voice.`);
      };

      // The request above is awaited, which burns the click's user activation, so
      // a plain play() is rejected with NotAllowedError and the sample appears
      // dead. Starting muted is always permitted, and we unmute once playback is
      // genuinely running.
      audio.muted = true;
      try {
        await audio.play();
      } catch (playErr) {
        if (!isCurrent()) return;
        const blocked = playErr instanceof DOMException && playErr.name === 'NotAllowedError';
        stopPreview();
        setPreviewError(
          blocked
            ? 'Your browser blocked audio playback. Click the speaker again to listen.'
            : `Couldn't play ${voice.name}. Try again in a moment.`
        );
        return;
      }

      if (!isCurrent()) return;
      audio.muted = false;
      audio.volume = 1;
      setPlayingId(voice.id);
    } catch {
      if (!isCurrent()) return;
      stopPreview();
      const msg = `Couldn't play ${voice.name}. The voice service may be unavailable.`;
      setPreviewError(msg);
      onPreviewError?.(msg);
    } finally {
      if (isCurrent()) setLoadingAudioId(null);
    }
  };

  const filterBtn = 'rounded-full px-3 py-1 font-medium transition border';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Availability header. Deliberately avoids naming the upstream vendor or the
          API key: this is a customer-facing picker, not a diagnostics panel. */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-emerald-500/30 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600">
            <Volume2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">Voices ready to use</span>
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-[10px] font-semibold text-emerald-600"
              >
                {apiVoices.length > 0 ? 'All available' : 'Loading'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tap the speaker on any voice to hear how it sounds on a real call.
            </p>
          </div>
        </div>

        {apiVoices.length > 0 ? (
          <Badge variant="secondary" className="shrink-0 font-mono text-xs">
            {apiVoices.length} voices
          </Badge>
        ) : null}
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voices by name, language or style..."
            className="h-9 pl-9 text-xs"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span>
            Showing <strong>{filteredList.length}</strong> of {apiVoices.length}
          </span>
        </div>
      </div>

      {/* Language pills, built from the voices actually returned. Selecting a
          primary language above switches this automatically. */}
      {languages.length > 1 ? (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {languages.map((l) => {
            const active = filterLang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => setLangOverride(active ? null : l.code)}
                className={`${filterBtn} flex shrink-0 items-center gap-1.5 ${
                  active
                    ? 'border-emerald-600 bg-emerald-600 font-semibold text-white shadow-xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {l.name}
                <span
                  className={`rounded px-1 py-0 text-[10px] ${
                    active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {l.count}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setLangOverride(null)}
            className={`${filterBtn} flex shrink-0 items-center gap-1.5 ${
              filterLang === null
                ? 'border-primary bg-primary font-semibold text-primary-foreground shadow-xs'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            <Globe2 className="h-3 w-3" /> All languages
          </button>

          {clonedCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowClonedOnly((v) => !v)}
              className={`${filterBtn} flex shrink-0 items-center gap-1.5 ${
                showClonedOnly
                  ? 'border-purple-600 bg-purple-600 font-semibold text-white shadow-xs'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              <Sparkles className="h-3 w-3" /> My cloned ({clonedCount})
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Inline preview error, so a dead speaker button is never silent */}
      {previewError ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {previewError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-semibold text-foreground">Loading voices...</p>
        </div>
      ) : isError ? (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center">
          <p className="text-xs font-semibold text-destructive">Couldn't load the voice library</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs font-medium text-primary underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid max-h-[460px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredList.map((voice) => {
            const isSelected = selectedVoiceId === voice.id;
            const isPlaying = playingId === voice.id;
            const isLoadingAudio = loadingAudioId === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => onSelect(voice)}
                className={`group relative flex cursor-pointer flex-col justify-between gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/40'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-accent/30'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isLoadingAudio}
                        onClick={(e) => handlePlayPreview(e, voice)}
                        title={isPlaying ? 'Stop sample' : `Hear ${voice.name}`}
                        aria-label={isPlaying ? 'Stop sample' : `Hear ${voice.name}`}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                          isPlaying
                            ? 'animate-pulse bg-emerald-600 text-white shadow-sm'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                      >
                        {isLoadingAudio ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isPlaying ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
                          {voice.name}
                        </h4>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="text-[10px] capitalize text-muted-foreground">
                            {voice.gender || 'neutral'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">•</span>
                          <span className="text-[10px] font-medium text-foreground">
                            {voiceLanguageName(voice)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-muted-foreground/30 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </div>

                  {voice.description ? (
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {voice.description}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[10px]">
                  <div className="flex items-center gap-1">
                    {voice.is_cloned ? (
                      <Badge
                        variant="outline"
                        className="gap-0.5 border-purple-500/40 bg-purple-500/10 px-1.5 py-0 text-[10px] text-purple-600"
                      >
                        <Mic className="h-2.5 w-2.5" /> My cloned voice
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-bold text-emerald-600"
                      >
                        {voiceLanguageName(voice)}
                      </Badge>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-foreground">
                      ₹{voice.rate ? voice.rate.toFixed(1) : voice.is_cloned ? '10.0' : '6.8'}/min
                    </span>
                    <span className="ml-1 text-[9px] text-muted-foreground">usage</span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredList.length === 0 ? (
            <div className="col-span-full space-y-2 py-12 text-center">
              <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-xs font-semibold text-foreground">No voices match</p>
              <p className="text-[11px] text-muted-foreground">
                {showClonedOnly ? 'You have not cloned a voice yet.' : 'Try another language or clear your search.'}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}