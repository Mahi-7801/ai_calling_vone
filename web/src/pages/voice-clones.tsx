import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Mic,
  Volume2,
  VolumeX,
  Trash2,
  RotateCw,
  Plus,
  Bot,
  Globe,
  Radio,
  Copy,
  Download,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { fetchAudioObjectUrl, triggerAudioDownload, slugifyFileName } from '@/lib/audio';
import { VoiceCloneModal } from '@/components/employees/voice-clone-modal';

interface VoiceCloneItem {
  id: number;
  name: string;
  voice_id: string;
  provider: string;
  language: string;
  gender: string;
  sample_url?: string | null;
  status: string;
  created_at: string;
  employees_using?: number;
}

interface EmployeeOption {
  id: number;
  name: string;
  voice: string;
}

export function VoiceClonesPage() {
  const toast = useToast();

  const [voices, setVoices] = useState<VoiceCloneItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [assigningVoiceId, setAssigningVoiceId] = useState<string | null>(null);
  const [downloadingVoiceId, setDownloadingVoiceId] = useState<string | null>(null);
  const [targetEmpId, setTargetEmpId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  const fetchVoiceClones = async () => {
    setIsLoading(true);
    try {
      const [voicesRes, empRes] = await Promise.all([
        api.get<{ success: boolean; voices: VoiceCloneItem[] }>('/employees/cloned-voices'),
        api.get<{ success: boolean; employees: EmployeeOption[] }>('/employees'),
      ]);
      setVoices(voicesRes.voices || []);
      setEmployees(empRes.employees || []);
      if (empRes.employees && empRes.employees.length > 0 && !targetEmpId) {
        setTargetEmpId(String(empRes.employees[0].id));
      }
    } catch {
      toast.error('Failed to load cloned voices');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVoiceClones();
    return () => {
      if (audioPlayer) {
        audioPlayer.pause();
      }
    };
  }, []);

  const resolveSampleUrl = async (voice: VoiceCloneItem) => {
    if (voice.sample_url) return voice.sample_url;
    const res = await api.post<{ success: boolean; audioUrl: string }>('/employees/test-voice-sample', {
      voiceId: voice.voice_id,
      text: 'నమస్కారం! ఇది నా క్లోనింగ్ వాయిస్. నేను మీ కాల్స్ మాట్లాడటానికి సిద్ధంగా ఉన్నాను.',
      language: voice.language || 'te',
    });
    if (!res.audioUrl) throw new Error('No audio generated');
    setVoices((prev) => prev.map((v) => (v.voice_id === voice.voice_id ? { ...v, sample_url: res.audioUrl } : v)));
    return res.audioUrl;
  };

  const handlePlaySample = async (voice: VoiceCloneItem) => {
    if (playingVoiceId === voice.voice_id) {
      if (audioPlayer) {
        audioPlayer.pause();
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      }
      setAudioPlayer(null);
      setPlayingVoiceId(null);
      return;
    }

    if (audioPlayer) {
      audioPlayer.pause();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    }
    setAudioPlayer(null);

    setPlayingVoiceId(voice.voice_id);
    try {
      const rawUrl = await resolveSampleUrl(voice);
      const playable = await fetchAudioObjectUrl(rawUrl);
      if (playingVoiceId !== null && playingVoiceId !== voice.voice_id) return;
      const audio = new Audio(playable);
      if (rawUrl !== playable) objectUrlRef.current = playable;
      setAudioPlayer(audio);
      audio.onended = () => setPlayingVoiceId(null);
      audio.onerror = () => {
        setPlayingVoiceId(null);
        toast.error('Unable to play audio sample');
      };
      await audio.play();
    } catch {
      setPlayingVoiceId(null);
      toast.error('Unable to play audio sample', 'The preview audio for this voice could not be loaded.');
    }
  };

  const handleDownloadSample = async (voice: VoiceCloneItem) => {
    setDownloadingVoiceId(voice.voice_id);
    let objectUrl: string | null = null;
    try {
      const rawUrl = await resolveSampleUrl(voice);
      objectUrl = await fetchAudioObjectUrl(rawUrl);
      triggerAudioDownload(objectUrl, `${slugifyFileName(voice.name)}_${voice.voice_id.slice(0, 8)}.mp3`);
      toast.success('Sample downloaded', `${voice.name} audio saved to your device.`);
    } catch {
      toast.error('Download failed', 'Unable to download the voice sample.');
    } finally {
      if (objectUrl && objectUrl !== voice.sample_url) URL.revokeObjectURL(objectUrl);
      setDownloadingVoiceId(null);
    }
  };

  const handleDeleteVoice = async (voice: VoiceCloneItem) => {
    if (!confirm(`Are you sure you want to delete cloned voice "${voice.name}"?`)) return;
    try {
      await api.del(`/employees/cloned-voices/${voice.id}`);
      toast.success(`Voice "${voice.name}" deleted`);
      setVoices((prev) => prev.filter((v) => v.id !== voice.id));
    } catch {
      toast.error('Failed to delete cloned voice');
    }
  };

  const handleAssignToEmployee = async (voiceId: string) => {
    if (!targetEmpId) return;
    setIsAssigning(true);
    try {
      await api.put(`/employees/${targetEmpId}`, {
        voice: voiceId,
        voice_provider: 'cartesia',
      });
      toast.success('Successfully assigned cloned voice to AI Employee!');
      setAssigningVoiceId(null);
      fetchVoiceClones();
    } catch {
      toast.error('Failed to assign voice to employee');
    } finally {
      setIsAssigning(false);
    }
  };

  const activeInProduction = voices.reduce((acc, v) => acc + (v.employees_using || 0), 0);

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Voice Clones Studio</h1>
            <Badge variant="outline" className="border-purple-500/30 text-purple-600 bg-purple-500/10 gap-1">
              <Sparkles className="h-3 w-3" /> Ultra-HD Neural Voice
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 font-bold">
              ₹10 / Clone · ₹10.0/min
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Clone your personal voice in 30 seconds for ₹10. Your AI Employees will speak to customers with your exact vocal timbre, tone, and native Telugu/English accent (₹10.0/min call rate).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchVoiceClones} className="gap-2 text-xs">
            <RotateCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCloneModalOpen(true)}
            className="gap-2 text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm"
          >
            <Plus className="h-4 w-4" /> Clone New Voice · ₹10
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-card to-card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">My Cloned Voices</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-foreground">{voices.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Personalized neural voice models</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active on AI Employees</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600">
              <Bot className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-emerald-600">{activeInProduction}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Taking live calls right now</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Voice Quality</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-600">
              <Radio className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-lg font-bold text-foreground">Ultra-HD Audio</p>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Human-Lifelike Natural Tone
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Supported Languages</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-lg font-bold text-foreground">Telugu · English · Hindi</p>
          <p className="text-[11px] text-muted-foreground mt-1">Native phoneme modeling</p>
        </Card>
      </div>

      {/* Hero Banner with Instant Clone Action */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/15 via-indigo-500/10 to-transparent p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-sm font-bold text-foreground">How Voice Cloning Works</h3>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Record 10–30 seconds of your voice for just ₹10. Our neural engine creates an instant digital clone that captures your natural accent, pitch, and cadence. Attached calls are billed at ₹10.0/min.
          </p>
        </div>
        <Button
          onClick={() => setIsCloneModalOpen(true)}
          className="shrink-0 gap-2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold"
        >
          <Mic className="h-3.5 w-3.5" /> Start Recording · ₹10
        </Button>
      </div>

      {/* Voice Clones Directory */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            My Cloned Voices ({voices.length})
          </CardTitle>
          <CardDescription>
            All neural cloned voices created by your organization. Click play to listen to a live synthesized preview.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
          ) : voices.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-purple-600">
                <Mic className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">No Cloned Voices Yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                You haven&apos;t cloned any voices yet. Click below to record or upload a sample clip and create your first AI voice.
              </p>
              <Button
                size="sm"
                onClick={() => setIsCloneModalOpen(true)}
                className="mt-4 gap-2 text-xs bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Clone My First Voice
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {voices.map((voice) => {
                const isPlaying = playingVoiceId === voice.voice_id;
                return (
                  <div
                    key={voice.id}
                    className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition hover:border-purple-500/50 hover:shadow-sm"
                  >
                    <div className="space-y-3">
                      {/* Title row */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-sm text-foreground">{voice.name}</h4>
                            <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 text-[10px] py-0">
                              Neural Clone
                            </Badge>
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] py-0 font-bold">
                              ₹10.0/min
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                            {voice.language === 'te' ? 'Telugu (తెలుగు)' : voice.language === 'hi' ? 'Hindi (हिन्दी)' : 'English'} · {voice.gender || 'neutral'}
                          </p>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteVoice(voice)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete voice"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Voice UUID */}
                      <div className="flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground">
                        <span className="truncate max-w-[170px]">{voice.voice_id}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(voice.voice_id);
                            toast.success('Voice UUID copied!');
                          }}
                          className="hover:text-foreground ml-1"
                          title="Copy UUID"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Usage tag */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {voice.employees_using && voice.employees_using > 0 ? (
                            <span className="font-semibold text-foreground">
                              Used by {voice.employees_using} AI Employee{voice.employees_using > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="italic">Not assigned to any employee</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                      <Button
                        variant={isPlaying ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handlePlaySample(voice)}
                        className={`h-8 text-xs gap-1.5 ${isPlaying ? 'bg-purple-600 text-white' : ''}`}
                      >
                        {isPlaying ? <VolumeX className="h-3.5 w-3.5 animate-pulse" /> : <Volume2 className="h-3.5 w-3.5" />}
                        {isPlaying ? 'Stop' : 'Listen Sample'}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloadingVoiceId === voice.voice_id}
                        onClick={() => handleDownloadSample(voice)}
                        className="h-8 text-xs gap-1.5"
                        title="Download voice sample"
                      >
                        {downloadingVoiceId === voice.voice_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Download
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setAssigningVoiceId(voice.voice_id)}
                        className="h-8 text-xs gap-1"
                      >
                        Assign <Bot className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voice Clone Modal */}
      <VoiceCloneModal
        open={isCloneModalOpen}
        onOpenChange={setIsCloneModalOpen}
        onVoiceCloned={() => {
          fetchVoiceClones();
        }}
      />

      {/* Quick Assign Modal */}
      {assigningVoiceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md shadow-2xl border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" /> Assign Voice to AI Employee
              </CardTitle>
              <CardDescription>
                Select which AI Employee will use this cloned voice for incoming and outgoing phone calls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target AI Employee</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
                  value={targetEmpId}
                  onChange={(e) => setTargetEmpId(e.target.value)}
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (ID #{emp.id})
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
            <div className="p-4 border-t flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAssigningVoiceId(null)}
                disabled={isAssigning}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleAssignToEmployee(assigningVoiceId)}
                disabled={isAssigning || !targetEmpId}
              >
                {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
