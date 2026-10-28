import { useState, useEffect, useCallback } from 'react';
import {
  PhoneCall,
  Radio,
  PhoneOff,
  RotateCw,
  Building2,
  Bot,
  Activity,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  PhoneIncoming,
  PhoneOutgoing,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

interface LiveCall {
  id: number;
  call_id: string;
  organization_id: number;
  employee_id: number;
  phone_number: string;
  direction: 'outbound' | 'inbound';
  status: 'preparing' | 'ringing' | 'connected' | 'completed' | 'failed' | 'busy' | 'no-answer';
  duration?: number;
  created_at: string;
  ended_at?: string;
  org_name?: string;
  employee_name?: string;
  employee_voice?: string;
}

function formatLiveDuration(createdAt: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function detectCarrier(phoneNumber?: string): { name: string; badgeClass: string } {
  if (!phoneNumber) return { name: 'PSTN', badgeClass: 'bg-muted text-muted-foreground' };
  if (phoneNumber.startsWith('+1') || phoneNumber.includes('7372508034')) {
    return { name: 'Twilio US', badgeClass: 'border-red-500/40 text-red-600 bg-red-500/10' };
  }
  if (phoneNumber.startsWith('+91') || phoneNumber.includes('8065354620')) {
    return { name: 'VoBiz India', badgeClass: 'border-blue-500/40 text-blue-600 bg-blue-500/10' };
  }
  return { name: 'SIP Trunk', badgeClass: 'border-purple-500/40 text-purple-600 bg-purple-500/10' };
}

export function AdminLiveCallsPage() {
  const toast = useToast();
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<LiveCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [terminatingId, setTerminatingId] = useState<number | null>(null);
  const [selectedCall, setSelectedCall] = useState<LiveCall | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'recent'>('active');
  const [, setTimerTick] = useState(0);

  const fetchLiveCalls = useCallback(async (quiet = false) => {
    if (!quiet) setIsRefreshing(true);
    try {
      const res = await api.get<{ success: boolean; calls: LiveCall[]; recentCompleted?: LiveCall[] }>('/admin/live-calls');
      setCalls(res.calls || []);
      if (res.recentCompleted) setRecentCompleted(res.recentCompleted);
    } catch {
      // quiet fail on background polls
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveCalls();
    // Poll every 3 seconds for live supervisory monitoring
    const pollInterval = setInterval(() => {
      fetchLiveCalls(true);
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [fetchLiveCalls]);

  // Tick duration timer every 1 second for live connected calls
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTerminate = async (call: LiveCall) => {
    if (!confirm(`Are you sure you want to forcibly terminate active call ${call.call_id} to ${call.phone_number}?`)) {
      return;
    }
    setTerminatingId(call.id);
    try {
      await api.post(`/admin/live-calls/${call.id}/terminate`, {});
      toast.success(`Call ${call.call_id} forcibly terminated`);
      setCalls((prev) => prev.filter((c) => c.id !== call.id));
      if (selectedCall?.id === call.id) setSelectedCall(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to terminate call');
    } finally {
      setTerminatingId(null);
    }
  };

  const connectedCount = calls.filter((c) => c.status === 'connected').length;
  const ringingCount = calls.filter((c) => c.status === 'ringing' || c.status === 'preparing').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Live Call Supervisor</h1>
            <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Real-Time Wallboard (3s Polling)
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Supervise all active PSTN &amp; SIP calls in real-time across tenant organizations, track latency, and emergency terminate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLiveCalls(false)}
            disabled={isRefreshing}
            className="gap-2 text-xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active Concurrent Calls</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PhoneCall className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-foreground">{calls.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Total active channels right now</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Connected &amp; Conversing</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600">
              <Radio className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-emerald-600">{connectedCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">AI streaming live voice</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Ringing / Dialing</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-amber-600">{ringingCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Waiting for customer answer</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Active Telephony Carriers</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-600">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-base font-bold text-foreground">Twilio US &amp; VoBiz IN</p>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Carrier Webhooks Active
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs className="mb-2">
        <TabsTrigger
          active={activeTab === 'active'}
          onClick={() => setActiveTab('active')}
          className="gap-2 text-xs"
        >
          <Radio className="h-3.5 w-3.5 text-emerald-500" />
          Active Live Calls ({calls.length})
        </TabsTrigger>
        <TabsTrigger
          active={activeTab === 'recent'}
          onClick={() => setActiveTab('recent')}
          className="gap-2 text-xs"
        >
          <Clock className="h-3.5 w-3.5" />
          Recently Completed ({recentCompleted.length})
        </TabsTrigger>
      </Tabs>

      {/* Tab 1: Active Calls Wallboard */}
      {activeTab === 'active' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
                  Active Channels Wallboard
                </CardTitle>
                <CardDescription>
                  Streaming audio session states updated every 3 seconds with live duration timers.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  LIVE TELEMETRY
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : calls.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <PhoneOff className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">No Live Calls in Progress</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  No outbound campaigns or inbound calls are currently active on the telephony carrier. When a call connects, it appears here immediately.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-3 px-4">Call ID &amp; Audio</th>
                      <th className="py-3 px-4">Carrier</th>
                      <th className="py-3 px-4">Tenant / Org</th>
                      <th className="py-3 px-4">AI Employee</th>
                      <th className="py-3 px-4">Customer Phone</th>
                      <th className="py-3 px-4">Status &amp; Live Timer</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {calls.map((c) => {
                      const carrier = detectCarrier(c.phone_number);
                      const isConnected = c.status === 'connected';
                      return (
                        <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {/* Audio pulse waveform animation */}
                              <div className="flex items-end gap-0.5 h-4 w-4">
                                <span className={`w-1 bg-emerald-500 rounded-full ${isConnected ? 'animate-bounce h-3' : 'h-1'}`} />
                                <span className={`w-1 bg-emerald-500 rounded-full ${isConnected ? 'animate-bounce delay-75 h-4' : 'h-1'}`} />
                                <span className={`w-1 bg-emerald-500 rounded-full ${isConnected ? 'animate-bounce delay-150 h-2' : 'h-1'}`} />
                              </div>
                              <div>
                                <span className="font-mono font-medium text-foreground">{c.call_id}</span>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                  {c.direction === 'inbound' ? (
                                    <span className="flex items-center gap-0.5 text-blue-500">
                                      <PhoneIncoming className="h-2.5 w-2.5" /> Inbound
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-0.5 text-purple-500">
                                      <PhoneOutgoing className="h-2.5 w-2.5" /> Outbound
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={`text-[10px] font-mono ${carrier.badgeClass}`}>
                              {carrier.name}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium text-foreground">{c.org_name || `Org #${c.organization_id}`}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
                              <div>
                                <p className="font-medium text-foreground">{c.employee_name || `Agent #${c.employee_id}`}</p>
                                {c.employee_voice && (
                                  <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
                                    {c.employee_voice}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-medium">
                            {c.phone_number}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {isConnected ? (
                                <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30 gap-1.5 font-mono text-[11px]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Connected • {formatLiveDuration(c.created_at)}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 border-amber-500/30 gap-1.5 font-mono text-[11px]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  {c.status} • {formatLiveDuration(c.created_at)}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedCall(c)}
                                className="h-7 text-xs gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                Details
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleTerminate(c)}
                                disabled={terminatingId === c.id}
                                className="h-7 text-xs gap-1.5"
                              >
                                <PhoneOff className="h-3 w-3" />
                                {terminatingId === c.id ? 'Terminating...' : 'Force Kill'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Recent Completed Calls */}
      {activeTab === 'recent' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Recent Platform Call Stream
            </CardTitle>
            <CardDescription>
              Latest terminated and completed calls across all organizations with duration and status.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentCompleted.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No recently completed calls logged in this session.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-3 px-4">Call ID</th>
                      <th className="py-3 px-4">Carrier</th>
                      <th className="py-3 px-4">Organization</th>
                      <th className="py-3 px-4">AI Employee</th>
                      <th className="py-3 px-4">Destination</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Outcome</th>
                      <th className="py-3 px-4 text-right">Completed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentCompleted.map((c) => {
                      const carrier = detectCarrier(c.phone_number);
                      return (
                        <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-foreground">
                            {c.call_id}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={`text-[10px] font-mono ${carrier.badgeClass}`}>
                              {carrier.name}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-medium text-foreground">
                            {c.org_name || `Org #${c.organization_id}`}
                          </td>
                          <td className="py-3 px-4">
                            {c.employee_name || `Agent #${c.employee_id}`}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {c.phone_number}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold">
                            {c.duration ? `${c.duration}s` : '0s'}
                          </td>
                          <td className="py-3 px-4">
                            {c.status === 'completed' ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Completed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground gap-1">
                                <XCircle className="h-3 w-3" /> {c.status}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-muted-foreground">
                            {new Date(c.created_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Call Details Inspector Drawer / Modal */}
      {selectedCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg shadow-2xl border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Live Call Telemetry Inspector
                </CardTitle>
                <CardDescription className="font-mono text-xs">{selectedCall.call_id}</CardDescription>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCall(null)}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border">
                <div>
                  <p className="text-muted-foreground">Carrier Gateway</p>
                  <p className="font-semibold text-foreground mt-0.5">{detectCarrier(selectedCall.phone_number).name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Call Direction</p>
                  <p className="font-semibold capitalize text-foreground mt-0.5">{selectedCall.direction}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer Destination</p>
                  <p className="font-mono font-semibold text-foreground mt-0.5">{selectedCall.phone_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Elapsed Duration</p>
                  <p className="font-mono font-bold text-emerald-600 mt-0.5">{formatLiveDuration(selectedCall.created_at)}</p>
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-muted/20 border">
                <p className="font-semibold text-foreground">AI Speech Pipeline State</p>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Voice Synthesis</span>
                  <span className="font-mono text-foreground">{selectedCall.employee_voice || 'Cartesia Sonic Telugu/English'}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>LLM Reasoning Engine</span>
                  <span className="font-mono text-foreground">Groq Llama 3.3 70B Versatile</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Speech-to-Text LPU</span>
                  <span className="font-mono text-foreground">Sarvam Saaras / Whisper v3</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Streaming Protocol</span>
                  <span className="font-mono text-emerald-600 font-semibold">WebRTC Opus 48kHz Full-Duplex</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setSelectedCall(null)}>
                  Close
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleTerminate(selectedCall)}
                  disabled={terminatingId === selectedCall.id}
                  className="gap-1.5"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                  Terminate Call Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
