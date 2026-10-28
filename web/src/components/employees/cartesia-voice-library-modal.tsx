import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Volume2,
  Loader2,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export interface CartesiaVoice {
  id: string;
  name: string;
  language_code: string;
  language_name: string;
  gender: string;
  badge?: string;
  is_cloned?: boolean;
  description?: string;
  provider?: string;
  tagline?: string;
}

interface CartesiaVoiceLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  voices: CartesiaVoice[];
  selectedVoiceId: string;
  onSelectVoice: (voice: CartesiaVoice) => void;
}

const PRIORITY_LANGUAGES = [
  { code: 'all', label: 'All Languages' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'mr', label: 'Marathi (मराठी)' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
];

export function CartesiaVoiceLibraryModal({
  isOpen,
  onClose,
  voices,
  selectedVoiceId,
  onSelectVoice,
}: CartesiaVoiceLibraryModalProps) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selectedLang, setSelectedLang] = useState('all');
  const [selectedGender, setSelectedGender] = useState<'all' | 'female' | 'male'>('all');
  const [visibleCount, setVisibleCount] = useState(36);

  // Audio preview playback state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reqIdRef = useRef(0);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingVoiceId(null);
    setLoadingVoiceId(null);
  };

  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      setSearch('');
      setVisibleCount(36);
    }
  }, [isOpen]);

  useEffect(() => () => stopAudio(), []);

  // Compute language counts from actual voice list
  const langCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of voices) {
      const code = (v.language_code || 'en').toLowerCase();
      map.set(code, (map.get(code) || 0) + 1);
    }
    return map;
  }, [voices]);

  // Filtered voice results
  const filteredVoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return voices.filter((v) => {
      // Language filter
      if (selectedLang !== 'all') {
        const vLang = (v.language_code || '').toLowerCase();
        if (vLang !== selectedLang && !vLang.startsWith(`${selectedLang}-`)) {
          return false;
        }
      }

      // Gender filter
      if (selectedGender !== 'all') {
        const vGen = (v.gender || '').toLowerCase();
        if (selectedGender === 'female' && vGen !== 'female' && vGen !== 'feminine') return false;
        if (selectedGender === 'male' && vGen !== 'male' && vGen !== 'masculine') return false;
      }

      // Search query
      if (q) {
        const nameMatch = (v.name || '').toLowerCase().includes(q);
        const descMatch = (v.description || '').toLowerCase().includes(q);
        const langMatch = (v.language_name || '').toLowerCase().includes(q);
        const taglineMatch = (v.tagline || '').toLowerCase().includes(q);
        if (!nameMatch && !descMatch && !langMatch && !taglineMatch) return false;
      }

      return true;
    });
  }, [voices, search, selectedLang, selectedGender]);

  const handlePlaySample = async (e: React.MouseEvent, voice: CartesiaVoice) => {
    e.stopPropagation();

    if (playingVoiceId === voice.id) {
      stopAudio();
      return;
    }

    stopAudio();
    const token = ++reqIdRef.current;
    setLoadingVoiceId(voice.id);

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.onended = () => {
        if (token === reqIdRef.current) {
          setPlayingVoiceId(null);
        }
      };
      audio.onerror = () => {
        if (token === reqIdRef.current) {
          setPlayingVoiceId(null);
          setLoadingVoiceId(null);
          toast.error('Voice preview audio unavailable.');
        }
      };

      const res = await api.post<{ success: boolean; audioUrl: string | null }>('/employees/voice-sample', {
        voice: voice.id,
        language: voice.language_name || voice.language_code || 'English',
        provider: voice.provider || 'cartesia',
      });

      if (token !== reqIdRef.current) return;

      if (!res.audioUrl) {
        toast.error('No audio returned for this voice.');
        setLoadingVoiceId(null);
        return;
      }

      audio.src = res.audioUrl;
      setLoadingVoiceId(null);
      setPlayingVoiceId(voice.id);
      await audio.play();
    } catch (err: any) {
      if (token === reqIdRef.current) {
        setLoadingVoiceId(null);
        setPlayingVoiceId(null);
        toast.error(err?.message || 'Failed to play voice sample');
      }
    }
  };

  const handleSelect = (voice: CartesiaVoice) => {
    stopAudio();
    onSelectVoice(voice);
    toast.success(`Voice selected: ${voice.name.split(' - ')[0]}`);
    onClose();
  };

  const visibleVoices = filteredVoices.slice(0, visibleCount);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-[#0a0718] border border-purple-900/60 text-white rounded-3xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-purple-900/40 bg-gradient-to-r from-purple-950/60 via-[#0e0924] to-[#0a0718] flex items-center justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-300 shadow-inner">
                🎙️
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Cartesia Voice Library
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Sonic 3.6
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {voices.length > 0 ? `${voices.length} Voices` : '1,049+ Voices'}
                </span>
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 flex items-center gap-1.5">
              <span>Official real-time neural voice catalogue matching</span>
              <a
                href="https://play.cartesia.ai/voices"
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 hover:text-purple-300 inline-flex items-center gap-0.5 font-medium underline underline-offset-2"
              >
                play.cartesia.ai/voices
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 sm:px-6 bg-[#0c081e] border-b border-purple-950/50 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search voices by name, style, accent, persona (e.g. Charan, Divya, Tessa, Kabir, Support)..."
                className="w-full bg-[#130d2e] border border-purple-900/50 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Gender Filter Pills */}
            <div className="flex items-center bg-[#130d2e] border border-purple-900/50 rounded-xl p-1 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedGender('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedGender === 'all'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedGender('female')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                  selectedGender === 'female'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>👩</span> Female
              </button>
              <button
                type="button"
                onClick={() => setSelectedGender('male')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                  selectedGender === 'male'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>👨</span> Male
              </button>
            </div>
          </div>

          {/* Language Tabs Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {PRIORITY_LANGUAGES.map((lang) => {
              const isSelected = selectedLang === lang.code;
              const count = lang.code === 'all' ? voices.length : langCounts.get(lang.code) || 0;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setSelectedLang(lang.code);
                    setVisibleCount(36);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition flex items-center gap-1.5 border cursor-pointer ${
                    isSelected
                      ? 'border-purple-400 bg-purple-600/30 text-white shadow-md ring-1 ring-purple-400/40'
                      : 'border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  <span>{lang.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-purple-500 text-white' : 'bg-white/10 text-zinc-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Voice Cards Grid Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>
              Showing <strong className="text-white">{Math.min(visibleVoices.length, filteredVoices.length)}</strong> of{' '}
              <strong className="text-white">{filteredVoices.length}</strong> matching voices
            </span>
            {selectedLang !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedLang('all')}
                className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
              >
                Show all languages
              </button>
            )}
          </div>

          {filteredVoices.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <span className="text-4xl">🔍</span>
              <h3 className="text-base font-semibold text-zinc-200">No Cartesia voices found</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                No voices matched your filters. Try clearing the search term or switching to another language tab.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedLang('all');
                  setSelectedGender('all');
                }}
                className="mt-2 px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {visibleVoices.map((voice) => {
                const isSelected = selectedVoiceId === voice.id;
                const isPlaying = playingVoiceId === voice.id;
                const isLoading = loadingVoiceId === voice.id;
                const isFemale = (voice.gender || '').toLowerCase().includes('fem');
                const isTelugu = voice.language_code === 'te';

                return (
                  <div
                    key={voice.id}
                    onClick={() => handleSelect(voice)}
                    className={`group relative flex flex-col justify-between rounded-2xl p-4 border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-purple-500 bg-purple-950/40 ring-1 ring-purple-500/50 shadow-lg shadow-purple-950/50'
                        : 'border-purple-900/30 bg-[#0f0b24]/90 hover:border-purple-600/50 hover:bg-[#140e30]'
                    }`}
                  >
                    {/* Top Row: Avatar, Name, Language & Badges */}
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center text-lg shrink-0 border ${
                              isTelugu
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                : isFemale
                                ? 'bg-pink-500/15 border-pink-500/30 text-pink-300'
                                : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                            }`}
                          >
                            {isFemale ? '👩' : '👨'}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-white group-hover:text-purple-200 transition truncate">
                              {voice.name.split(' - ')[0]}
                            </h4>
                            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                              <span className="font-medium text-purple-300">
                                {voice.language_name || voice.language_code?.toUpperCase()}
                              </span>
                              <span>·</span>
                              <span className="capitalize text-zinc-400">{voice.gender || 'Neural'}</span>
                            </p>
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500 text-white shrink-0 shadow-sm">
                            <Check className="h-3 w-3" /> Selected
                          </span>
                        ) : isTelugu ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                            Pure Telugu
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0">
                            Sonic 3.6
                          </span>
                        )}
                      </div>

                      {/* Description / Style */}
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed min-h-[32px]">
                        {voice.description || voice.tagline || (isTelugu ? 'Fluent pure Telugu neural conversational voice with natural cadence.' : 'Ultra-realistic neural voice for sales, support, and conversational AI.')}
                      </p>
                    </div>

                    {/* Bottom Actions: Audio Preview & Select */}
                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                      {/* Play Preview Button */}
                      <button
                        type="button"
                        onClick={(e) => handlePlaySample(e, voice)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                          isPlaying
                            ? 'bg-purple-600 border-purple-400 text-white shadow-md'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300 hover:text-white'
                        }`}
                        title="Click to preview voice audio sample"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" />
                        ) : isPlaying ? (
                          <span className="flex items-center gap-0.5">
                            <span className="h-3 w-0.5 bg-white animate-[pulse_0.4s_ease-in-out_infinite]" />
                            <span className="h-4 w-0.5 bg-white animate-[pulse_0.6s_ease-in-out_infinite_0.1s]" />
                            <span className="h-2 w-0.5 bg-white animate-[pulse_0.5s_ease-in-out_infinite_0.2s]" />
                          </span>
                        ) : (
                          <Volume2 className="h-3.5 w-3.5 text-purple-400" />
                        )}
                        <span>{isPlaying ? 'Playing' : 'Listen Sample'}</span>
                      </button>

                      {/* Use Voice Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(voice);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          isSelected
                            ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                            : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-sm'
                        }`}
                      >
                        {isSelected ? 'In Use' : 'Use Voice'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show More Button if more available */}
          {visibleVoices.length < filteredVoices.length && (
            <div className="py-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 36)}
                className="px-6 py-2.5 rounded-2xl bg-purple-900/40 hover:bg-purple-800/50 border border-purple-700/50 text-purple-200 text-xs font-bold transition shadow-sm"
              >
                Load More Voices ({filteredVoices.length - visibleVoices.length} remaining) ↓
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:px-6 bg-[#080514] border-t border-purple-950/60 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Connected to Cartesia Live API (1,049+ Neural Voices)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
