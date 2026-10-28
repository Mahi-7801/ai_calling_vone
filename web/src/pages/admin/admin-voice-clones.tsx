import { useState, useEffect } from 'react';
import {
  Sparkles,
  Volume2,
  VolumeX,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  Copy,
  Play,
  Mic,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { fetchAudioObjectUrl } from '@/lib/audio';
import { formatDateTime } from '@/lib/utils';

interface VoiceCloneItem {
  id: number;
  name: string;
  voice_id: string;
  provider: string;
  language: string;
  gender?: string | null;
  sample_url?: string | null;
  status: string;
  created_at: string;
  org_name?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  employees_using?: number;
}

export function AdminVoiceClonesPage() {
  const toast = useToast();
  const [clones, setClones] = useState<VoiceCloneItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);

  // Live Test Speech Modal
  const [testModalVoice, setTestModalVoice] = useState<VoiceCloneItem | null>(null);
  const [testPhrase, setTestPhrase] = useState('నమస్కారం, ఇది కార్టీసియా వాయిస్ క్లోన్ టెస్ట్. నా మాటలు సహజంగా వినిపిస్తున్నాయా?');
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);

  const fetchClones = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const res = await api.get<{ success: boolean; voiceClones: VoiceCloneItem[] }>('/admin/voice-clones');
      setClones(res.voiceClones || []);
    } catch {
      if (!quiet) toast.error('Failed to load voice clones');
    } finally {
      if (!quiet) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchClones();
    // Auto-refresh every 8s for live real-time clone tracking
    const interval = setInterval(() => {
      fetchClones(true);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const playVoiceSample = (v: VoiceCloneItem) => {
    if (playingVoiceId === v.voice_id) {
      audioPlayer?.pause();
      setPlayingVoiceId(null);
      return;
    }

    if (v.sample_url) {
      audioPlayer?.pause();
      setPlayingVoiceId(v.voice_id);
      fetchAudioObjectUrl(v.sample_url)
        .then((playable) => {
          const audio = new Audio(playable);
          setAudioPlayer(audio);
          audio.onended = () => setPlayingVoiceId(null);
          audio.onerror = () => setPlayingVoiceId(null);
          audio.play();
        })
        .catch(() => {
          setPlayingVoiceId(null);
          toast.error('Could not play audio sample');
        });
    } else {
      toast.info(`Voice ID: ${v.voice_id}`, 'No sample audio cached. Cloned voice is active in Cartesia.');
    }
  };

  const handleTestTtsGenerate = async () => {
    if (!testModalVoice) return;
    setIsGeneratingTts(true);
    try {
      const token = localStorage.getItem('token') || '';
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/voice-clones/${testModalVoice.id}/preview-tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: testPhrase }),
      });
      if (!response.ok) throw new Error('Failed to generate speech');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      toast.success('Live Audio Playing', 'Cartesia synthesized speech successfully');
    } catch (err: any) {
      toast.error('Generation Failed', err.message || 'Cartesia speech generation failed');
    } finally {
      setIsGeneratingTts(false);
    }
  };

  const copyVoiceId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success('Voice UUID copied', id);
  };

  const deleteClone = async (id: number) => {
    if (!confirm('Are you sure you want to delete this cloned voice profile?')) return;
    try {
      await api.del(`/admin/voice-clones/${id}`);
      setClones((prev) => prev.filter((c) => c.id !== id));
      toast.success('Voice clone deleted');
    } catch {
      toast.error('Could not delete voice clone');
    }
  };

  const filtered = clones.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.voice_id.toLowerCase().includes(q) ||
      (c.org_name || '').toLowerCase().includes(q) ||
      (c.user_email || '').toLowerCase().includes(q)
    );
  });

  const teluguClonesCount = clones.filter((c) => c.language === 'te' || c.language === 'te-IN').length;
  const inUseCount = clones.filter((c) => (c.employees_using ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">User Voice Clones</h1>
            <Badge variant="outline" className="gap-1 border-purple-500/40 text-purple-600 bg-purple-500/10 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              Cartesia Sonic Real-Time
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor, audit, and preview all customer-cloned voices generated via Cartesia Instant Voice Cloning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchClones(false)}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3.5 border-primary/30 bg-gradient-to-br from-primary/10 to-card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">Total Clones</p>
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          </div>
          <p className="mt-1 text-xl font-bold text-foreground">{clones.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Generated by customers</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">Telugu Clones</p>
            <span className="font-mono text-xs text-muted-foreground shrink-0">te-IN</span>
          </div>
          <p className="mt-1 text-xl font-bold text-foreground">{teluguClonesCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Native Telugu voice profiles</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">Active in Calling</p>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          </div>
          <p className="mt-1 text-xl font-bold text-foreground">{inUseCount}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Attached to live employees</p>
        </Card>

        <Card className="p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground truncate">Cartesia Engine</p>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px]">Live</Badge>
          </div>
          <p className="mt-1 text-base font-bold text-foreground">sonic-3.6</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">~120ms latency</p>
        </Card>
      </div>

      {/* Clones Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base">All Platform Voice Clones</CardTitle>
            <CardDescription className="text-xs">
              Every customer cloned voice with sample preview, Cartesia UUID, and live speech test.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search clones, org, or voice ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Voice Name</TableHead>
                  <TableHead>Organization / User</TableHead>
                  <TableHead>Cartesia Voice UUID</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => {
                  const isPlaying = playingVoiceId === v.voice_id;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-semibold text-sm">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{v.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium text-foreground">{v.org_name || 'Organization'}</p>
                          <p className="text-[11px] text-muted-foreground">{v.user_email || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <span className="max-w-[130px] truncate text-muted-foreground">{v.voice_id}</span>
                          <button
                            type="button"
                            onClick={() => copyVoiceId(v.voice_id)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Copy UUID"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">
                          {v.language || 'te'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(v.employees_using ?? 0) > 0 ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                            {v.employees_using} Agents
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDateTime(v.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => playVoiceSample(v)}
                            className="h-7 text-xs gap-1"
                            title={isPlaying ? 'Pause' : 'Play cached sample'}
                          >
                            {isPlaying ? <VolumeX className="h-3 w-3 text-red-500" /> : <Volume2 className="h-3 w-3 text-primary" />}
                            {isPlaying ? 'Stop' : 'Sample'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTestModalVoice(v);
                              if (v.language === 'en') setTestPhrase('Hello! This is a real-time voice clone test powered by Cartesia Sonic.');
                              else setTestPhrase('నమస్కారం, ఇది కార్టీసియా వాయిస్ క్లోన్ టెస్ట్. నా మాటలు సహజంగా వినిపిస్తున్నాయా?');
                            }}
                            className="h-7 text-xs gap-1 border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
                          >
                            <Mic className="h-3 w-3" />
                            Live Test
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteClone(v.id)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center text-muted-foreground text-xs">
              No voice clones found.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Test Speech Modal */}
      {testModalVoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md shadow-2xl border-purple-500/30">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mic className="h-4 w-4 text-purple-600" /> Live Cartesia Speech Test
                </CardTitle>
                <CardDescription className="text-xs">
                  Synthesize real speech using voice clone: <span className="font-semibold text-foreground">{testModalVoice.name}</span>
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={() => setTestModalVoice(null)}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Test Phrase (Telugu / English)</label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground resize-none focus:outline-hidden focus:ring-1 focus:ring-primary"
                  value={testPhrase}
                  onChange={(e) => setTestPhrase(e.target.value)}
                />
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>Cartesia Voice ID:</span>
                  <span className="font-mono text-foreground truncate max-w-[180px]">{testModalVoice.voice_id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Language Code:</span>
                  <span className="font-mono text-foreground">{testModalVoice.language || 'te'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span className="font-mono text-purple-600 font-semibold">sonic-3.6</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setTestModalVoice(null)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={handleTestTtsGenerate}
                  disabled={isGeneratingTts || !testPhrase.trim()}
                  className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {isGeneratingTts ? 'Synthesizing...' : 'Generate & Play Audio'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
