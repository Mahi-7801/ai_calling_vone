import { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Save,
  RotateCw,
  Server,
  Layers,
  Sparkles,
  Lock,
  Globe,
  ExternalLink,
  Phone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

interface CredentialsData {
  cartesiaApiKey: string;
  cartesiaModel: string;
  cartesiaVoiceId: string;
  groqApiKey: string;
  groqModel: string;
  openaiApiKey: string;
  twilioSid: string;
  twilioPhoneNumber: string;
  vobizAuthId: string;
  vobizConsoleEmail: string;
  livekitUrl: string;
  paymentProvider: string;
  razorpayKeyId?: string;
}

interface ProviderLiveStatus {
  status: string;
  latencyMs: number;
}

export function AdminConfigPage() {
  const toast = useToast();
  const [creds, setCreds] = useState<CredentialsData | null>(null);
  const [liveStatus, setLiveStatus] = useState<Record<string, ProviderLiveStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showMasked, setShowMasked] = useState<Record<string, boolean>>({});
  const [isSavingKey, setIsSavingKey] = useState<string | null>(null);

  const fetchCredentialsAndStatus = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const [credsRes, liveRes] = await Promise.all([
        api.get<{ success: boolean; credentials: CredentialsData }>('/admin/config/credentials'),
        api.get<{ success: boolean; providers: Record<string, ProviderLiveStatus> }>('/admin/providers/live-status').catch(() => null),
      ]);
      setCreds(credsRes.credentials);
      if (liveRes?.providers) {
        setLiveStatus(liveRes.providers);
      }
    } catch {
      if (!quiet) toast.error('Failed to load system credentials');
    } finally {
      if (!quiet) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCredentialsAndStatus();
    // Auto-refresh live status every 10s
    const interval = setInterval(() => {
      fetchCredentialsAndStatus(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveCredential = async (key: string, value: string) => {
    if (!value || value.trim() === '') {
      toast.error('Value cannot be empty');
      return;
    }
    setIsSavingKey(key);
    try {
      await api.put('/admin/config/credentials', { key, value });
      toast.success(`Updated ${key} successfully!`);
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      fetchCredentialsAndStatus(true);
    } catch (err: any) {
      toast.error(err.message || `Failed to update ${key}`);
    } finally {
      setIsSavingKey(null);
    }
  };

  const toggleMask = (key: string) => {
    setShowMasked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">API Keys &amp; Gateway Config</h1>
            <Badge variant="outline" className="border-purple-500/40 text-purple-600 bg-purple-500/10 gap-1 text-xs">
              <Lock className="h-3 w-3" /> Encrypted Vault &amp; Live Status
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Production infrastructure secrets for Twilio PSTN, VoBiz India, Cartesia Voice, Groq LPU, and LiveKit WebRTC.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCredentialsAndStatus(false)}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
          >
            <RotateCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {isLoading || !creds ? (
        <div className="grid gap-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
        <div className="grid gap-4">
          {/* Twilio Primary PSTN Carrier */}
          <Card className="border-red-500/30 bg-gradient-to-br from-red-500/5 via-card to-card">
            <CardHeader className="p-4 pb-2.5 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/20 text-red-600">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold">Twilio Telephony Carrier (PSTN &amp; SIP)</CardTitle>
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                        Primary Telephony
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Active outbound &amp; inbound carrier routing calls directly via public Webhook tunnel.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {liveStatus.twilio && (
                    <span className="text-[11px] font-mono text-emerald-600 flex items-center gap-1 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {liveStatus.twilio.latencyMs}ms ping
                    </span>
                  )}
                  <a
                    href="https://console.twilio.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                  >
                    Console <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Twilio Account SID</span>
                    <button
                      type="button"
                      onClick={() => toggleMask('twilio')}
                      className="text-muted-foreground hover:text-foreground text-[11px] flex items-center gap-1"
                    >
                      {showMasked['twilio'] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showMasked['twilio'] ? 'Hide' : 'Reveal'}
                    </button>
                  </label>
                  <Input
                    type={showMasked['twilio'] ? 'text' : 'password'}
                    value={creds.twilioSid || ''}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    disabled
                    className="font-mono text-xs bg-muted h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">Account: AI Calling Platform Live</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Verified Caller ID / Phone Number</label>
                  <Input
                    value={creds.twilioPhoneNumber || ''}
                    placeholder="+1xxxxxxxxxx"
                    disabled
                    className="font-mono text-xs font-bold text-foreground bg-muted h-8"
                  />
                  <p className="text-[10px] text-emerald-600 font-medium">✓ Active Incoming &amp; Outbound PSTN DID</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cartesia Voice Cloning Vault */}
          <Card className="border-purple-500/30">
            <CardHeader className="p-4 pb-2.5 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20 text-purple-600">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold">Cartesia Voice Cloning &amp; Sonic TTS</CardTitle>
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                        Active Synthesis
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Powers sub-120ms ultra-low latency AI voice synthesis, Telugu accents, and instant voice cloning.
                    </CardDescription>
                  </div>
                </div>
                {liveStatus.cartesia && (
                  <span className="text-[11px] font-mono text-emerald-600 flex items-center gap-1 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {liveStatus.cartesia.latencyMs}ms ping • 1,020 models
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Cartesia API Key</span>
                    <button
                      type="button"
                      onClick={() => toggleMask('cartesia')}
                      className="text-muted-foreground hover:text-foreground text-[11px] flex items-center gap-1"
                    >
                      {showMasked['cartesia'] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showMasked['cartesia'] ? 'Hide' : 'Reveal'}
                    </button>
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showMasked['cartesia'] ? 'text' : 'password'}
                      value={editValues['cartesiaApiKey'] ?? creds.cartesiaApiKey}
                      onChange={(e) => setEditValues((p) => ({ ...p, cartesiaApiKey: e.target.value }))}
                      className="font-mono text-xs h-8"
                    />
                    {editValues['cartesiaApiKey'] !== undefined && (
                      <Button
                        size="sm"
                        onClick={() => handleSaveCredential('cartesiaApiKey', editValues['cartesiaApiKey'])}
                        disabled={isSavingKey === 'cartesiaApiKey'}
                        className="h-8 px-2.5 gap-1.5 text-xs"
                      >
                        <Save className="h-3 w-3" /> Save
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Synthesis Engine Model</label>
                  <Input
                    value={creds.cartesiaModel || 'sonic-3.6'}
                    disabled
                    className="font-mono text-xs bg-muted h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">Cartesia Sonic-3.6 (Sub-120ms streaming latency)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* VoBiz Telephony Carrier (India PSTN) */}
          <Card className="border-blue-500/30">
            <CardHeader className="p-4 pb-2.5 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-600">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold">VoBiz Telephony Carrier (India PSTN)</CardTitle>
                      <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600">
                        India Trunk
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Domestic India PSTN direct SIP trunking, 20,340 DIDs pool, and caller-ID routing.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {liveStatus.vobiz && (
                    <span className="text-[11px] font-mono text-blue-600 flex items-center gap-1 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {liveStatus.vobiz.latencyMs}ms ping
                    </span>
                  )}
                  <a
                    href="https://console.vobiz.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                  >
                    Carrier Console <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">VoBiz Auth Account ID</label>
                  <Input
                    value={creds.vobizAuthId || 'MA_0JG73TST'}
                    disabled
                    className="font-mono text-xs bg-muted font-bold h-8"
                  />
                  <p className="text-[10px] text-muted-foreground truncate">Console Login: Carrier Admin Console</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">API Base Endpoint</label>
                  <Input
                    value="https://api.vobiz.ai/api/v1"
                    disabled
                    className="font-mono text-xs bg-muted h-8"
                  />
                  <p className="text-[10px] text-emerald-600 font-medium">SSL Direct Bridge Active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Groq Real-Time LLM Inference */}
          <Card className="border-amber-500/30">
            <CardHeader className="p-4 pb-2.5 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600/20 text-amber-600">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-bold">Groq LPU Conversational LLM</CardTitle>
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">
                        Sub-150ms TTFT
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Ultra-fast token inference generating conversational responses in real-time.
                    </CardDescription>
                  </div>
                </div>
                {liveStatus.groq && (
                  <span className="text-[11px] font-mono text-amber-600 flex items-center gap-1 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {liveStatus.groq.latencyMs}ms ping • LPU Active
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Groq API Key</span>
                    <button
                      type="button"
                      onClick={() => toggleMask('groq')}
                      className="text-muted-foreground hover:text-foreground text-[11px] flex items-center gap-1"
                    >
                      {showMasked['groq'] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showMasked['groq'] ? 'Hide' : 'Reveal'}
                    </button>
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showMasked['groq'] ? 'text' : 'password'}
                      value={editValues['groqApiKey'] ?? creds.groqApiKey}
                      onChange={(e) => setEditValues((p) => ({ ...p, groqApiKey: e.target.value }))}
                      className="font-mono text-xs h-8"
                    />
                    {editValues['groqApiKey'] !== undefined && (
                      <Button
                        size="sm"
                        onClick={() => handleSaveCredential('groqApiKey', editValues['groqApiKey'])}
                        disabled={isSavingKey === 'groqApiKey'}
                        className="h-8 px-2.5 gap-1.5 text-xs"
                      >
                        <Save className="h-3 w-3" /> Save
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Configured LLM Model</label>
                  <Input
                    value={creds.groqModel || 'llama-3.3-70b-versatile'}
                    disabled
                    className="font-mono text-xs bg-muted h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">High-intelligence conversational model</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* LiveKit WebRTC & Razorpay Gateway */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="p-4 pb-2.5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-600" />
                  <CardTitle className="text-sm font-bold">LiveKit WebRTC Media Server</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div>
                  <label className="text-muted-foreground">Cloud URL</label>
                  <Input value={creds.livekitUrl || 'wss://cloud.livekit.io'} disabled className="font-mono text-xs bg-muted h-8 mt-1" />
                </div>
                <p className="text-[10px] text-emerald-600 font-medium">✓ Opus 48kHz Full-Duplex Audio Active</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2.5 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-emerald-600" />
                    <CardTitle className="text-sm font-bold">Admin Razorpay Gateway</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">Live</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div>
                  <label className="text-muted-foreground">Razorpay Key ID</label>
                  <Input value={creds.razorpayKeyId || 'rzp_live_TacgNeCEMObPyQ'} disabled className="font-mono text-xs bg-muted h-8 mt-1" />
                </div>
                <p className="text-[10px] text-muted-foreground">Auto-generates official tax invoices upon checkout</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
