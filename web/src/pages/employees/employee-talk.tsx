import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Info, Mic, MicOff, PhoneOff, RotateCcw, Send, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { api, ApiClientError } from '@/lib/api';
import { useEmployee } from '@/hooks/queries';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { cn, formatDuration } from '@/lib/utils';

interface Message {
  id: number;
  speaker: 'ai' | 'customer';
  text: string;
  ts: number;
}

export function EmployeeTalkPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const employeeId = id ? (isNaN(Number(id)) ? id : Number(id)) : null;
  const { data, isLoading, isError, refetch } = useEmployee(employeeId);
  const employee = data?.employee;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const { typingLabel, startTyping, stopTyping } = useTypingIndicator('employee-talk', employeeId);

  // The router unmounts this page when switching to the call screen, so an
  // in-flight stream must be aborted or it writes into a dead component.
  useEffect(() => () => streamAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!started || ended) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [started, ended]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const push = (speaker: 'ai' | 'customer', text: string) => {
    setMessages((m) => [...m, { id: ++idRef.current, speaker, text, ts: Date.now() }]);
  };

  const [audioPlaying, setAudioPlaying] = useState(false);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || listening) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = employee?.language_code || 'te-IN';
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onstart = () => setListening(true);
      recognition.onend = () => {
        setListening(false);
        // If still in call and not thinking and not playing audio, auto-restart listening
        if (started && !ended && !audioPlaying) {
          setTimeout(() => {
            try { recognition.start(); } catch {}
          }, 300);
        }
      };
      recognition.onerror = () => setListening(false);

      recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const transcriptText = event.results[last]?.[0]?.transcript;
        if (transcriptText && transcriptText.trim()) {
          // Interrupt any currently playing AI voice immediately
          if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setAudioPlaying(false);
          }
          setInput(transcriptText);
          void send(transcriptText);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  };

  const toggleMic = () => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Streams the employee reply: text arrives token by token over SSE, and the
  // voice is synthesized once the text is complete (providers do not offer
  // sentence-level TTS, so synthesizing early would either truncate the reply
  // or require guessing where sentences end).
  const send = async (text: string) => {
    if (!employeeId || !text.trim()) return;

    // Instant interruption: pause any playing audio
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setAudioPlaying(false);
    }

    const incoming = text.trim();
    push('customer', incoming);
    setInput('');
    setThinking(true);
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    // Append to a single streaming bubble rather than one message per delta.
    const replyId = ++idRef.current;
    let reply = '';
    let finished = false;

    const setReply = (next: string) => {
      reply = next;
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === replyId);
        if (!exists) return [...prev, { id: replyId, speaker: 'ai', text: next, ts: Date.now() }];
        return prev.map((m) => (m.id === replyId ? { ...m, text: next } : m));
      });
    };
    setReply('');

    try {
      const history = messages
        .filter((m) => m.text)
        .slice(-10)
        .map((m) => ({ role: m.speaker === 'ai' ? 'assistant' : 'user', content: m.text }));

      await api.stream(
        `/employees/${employeeId}/chat-stream`,
        { message: incoming, history },
        {
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === 'delta') setReply(reply + String(data.text ?? ''));
            if (event === 'error') setReply(`(error) ${String(data.message ?? 'Something went wrong.')}`);
            if (event === 'done') finished = true;
          },
        },
      );
      if (!reply) setReply('(no reply)');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      const message = err instanceof ApiClientError ? err.message : 'Could not reach AI.';
      setReply(`(error) ${message}`);
    } finally {
      // Strip the empty placeholder so an aborted turn does not leave a blank
      // bubble in the transcript.
      if (!reply || reply === '(no reply)') {
        setMessages((prev) => prev.filter((m) => m.id !== replyId));
      }
      setThinking(false);
      streamAbortRef.current = null;
    }

    if (!finished || !reply) return;

    // The reply is complete, so ask for the voice. Talking is independent of the
    // text render, so the user can read while it plays.
    if (!muted) {
      try {
        const res = await api.post<{ success: boolean; response: string; voiceUrl: string | null }>(
          `/employees/${employeeId}/test`,
          { message: '__voice__', text: reply },
        );
        if (res.voiceUrl) {
          setAudioUrl(res.voiceUrl);
          setTimeout(() => {
            if (audioRef.current) {
              setAudioPlaying(true);
              audioRef.current.play().catch(() => setAudioPlaying(false));
            }
          }, 50);
        }
      } catch {
        /* text reply is already shown; audio is best-effort */
      }
    }
  };

  const handleAudioEnded = () => {
    setAudioPlaying(false);
    // After AI speaks, automatically start listening for human response
    if (started && !ended) {
      startListening();
    }
  };

  const start = async () => {
    setStarted(true);
    setEnded(false);
    setSeconds(0);
    if (employee?.greeting && employeeId) {
      setThinking(true);
      push('ai', employee.greeting.replace('{name}', employee.name));
      // Greeting voice is a plain one-shot request, not a conversation turn, so
      // it goes through the existing test endpoint.
      try {
        const res = await api.post<{ success: boolean; voiceUrl: string | null }>(`/employees/${employeeId}/test`, {
          message: '__greeting__',
        });
        if (res.voiceUrl) {
          setAudioUrl(res.voiceUrl);
          setTimeout(() => {
            if (audioRef.current) {
              setAudioPlaying(true);
              audioRef.current.play().catch(() => setAudioPlaying(false));
            }
          }, 50);
        }
      } catch {
        /* greeting text already shown */
      } finally {
        setThinking(false);
      }
    }
  };

  const end = () => {
    setEnded(true);
    setStarted(false);
    stopListening();
    stopTyping();
    // Drop any reply still streaming in; its text is incomplete.
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setAudioPlaying(false);
  };

  const reset = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setMessages([]);
    setEnded(false);
    setStarted(false);
    setSeconds(0);
    setAudioUrl(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[28rem] w-full" />
      </div>
    );
  }

  if (isError || !employee) {
    return <ErrorState title="Employee not found" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/employees')}
          className="gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Conversation */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-3 border-b">
            <Avatar name={employee.name} url={employee.avatar_url} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>{employee.name}</CardTitle>
                <StatusBadge status={employee.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {employee.role} · {employee.language}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-semibold">{formatDuration(seconds)}</p>
              <p className="text-xs text-muted-foreground">{started ? 'In conversation' : ended ? 'Completed' : 'Ready'}</p>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div ref={scrollRef} className="h-[24rem] space-y-3 overflow-y-auto p-5 scrollbar-thin">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-7 w-7" />
                  </div>
                  <p className="mt-3 font-medium">AI employee is ready</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                    Start a browser conversation to test how {employee.name} speaks and responds.
                  </p>
                  {typingLabel ? <p className="mt-2 text-sm font-medium text-foreground">{typingLabel}</p> : null}
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.speaker === 'customer' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                        m.speaker === 'customer'
                          ? 'rounded-br-sm bg-primary text-primary-foreground'
                          : 'rounded-bl-sm bg-muted',
                      )}
                    >
                      <p className="mb-0.5 text-[11px] font-semibold opacity-70">
                        {m.speaker === 'customer' ? 'Customer' : employee.name}
                      </p>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                ))
              )}
              {thinking ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t p-4">
              {!started && !ended ? (
                <Button className="w-full" size="lg" onClick={start}>
                  <Mic className="h-4 w-4" /> Start Conversation
                </Button>
              ) : started ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        // Only broadcast the transition, not every keystroke.
                        if (e.target.value && !input) startTyping();
                        if (!e.target.value && input) stopTyping();
                      }}
                      onBlur={stopTyping}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void send(input);
                        }
                      }}
                      placeholder="Type or click mic to speak in Telugu…"
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      type="button"
                      variant={listening ? 'destructive' : 'outline'}
                      onClick={toggleMic}
                      title={listening ? 'Stop listening' : 'Speak into microphone'}
                      className={cn(listening && 'animate-pulse border-red-500 bg-red-500 text-white')}
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => send(input)} disabled={!input.trim() || thinking}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setMuted((m) => !m)}>
                      {muted ? <MicOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      {muted ? 'Unmute' : 'Mute'}
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={end}>
                      <PhoneOff className="h-4 w-4" /> End Conversation
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={reset}>
                    <RotateCcw className="h-4 w-4" /> New conversation
                  </Button>
                  <Button className="flex-1" onClick={() => navigate('/calling/instant')}>
                    Test a phone call
                  </Button>
                </div>
              )}
              {audioUrl ? (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onPlay={() => setAudioPlaying(true)}
                  onEnded={handleAudioEnded}
                  className="mt-3 w-full"
                  controls
                  autoPlay
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Side panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-4 w-4" /> Test mode
              </CardTitle>
            </CardHeader>
<CardContent className="space-y-2 text-sm text-muted-foreground">
      <p>This browser conversation uses your employee's system prompt, personality and knowledge.</p>
            <p>Phone calling is enabled once a number is assigned in the employee wizard.</p>
            {/* No outcome panel here on purpose: this browser session is not a
                call record, so nothing is sent for AI analysis. Real analysis
                (summary, sentiment, outcome, next action) is produced only for
                actual calls and is shown on the conversation. */}
            <p>
              Browser rehearsals are not saved as calls, so they produce no outcome analysis. Place a real call to get a
              summary, sentiment, outcome and next action.
            </p>
            {typingLabel ? <p className="font-medium text-foreground">{typingLabel}</p> : null}
            <Button variant="outline" size="sm" className="mt-1" onClick={() => navigate(`/employees/${employee.id}`)}>
              Edit employee
            </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Link className="text-primary hover:underline" to={`/training?employee=${employee.id}`}>
                Train knowledge & FAQs →
              </Link>
              <Link className="text-primary hover:underline" to="/calling/instant">
                Make an instant phone call →
              </Link>
              <Link className="text-primary hover:underline" to="/performance">
                View performance →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
