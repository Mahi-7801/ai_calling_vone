import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MicOff, Phone, PhoneOff, Radio, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useEmployee } from '@/hooks/queries';
import { useBrowserCall } from '@/hooks/useBrowserCall';
import { cn, formatDuration } from '@/lib/utils';

/**
 * Full-duplex browser call with an AI employee.
 *
 * Unlike the Talk page (which streams text and then plays a single clip), this
 * captures the microphone and streams the employee's voice back in real time,
 * so it is the closest thing to a phone call that does not need a number.
 */
export function BrowserCallPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const employeeId = id ? (isNaN(Number(id)) ? id : Number(id)) : null;
  const { data, isLoading, isError, refetch } = useEmployee(employeeId);
  const employee = data?.employee;

  const call = useBrowserCall(employeeId);
  const { state, aiSpeaking, userSpeaking, seconds, events, error, livekitConnected } = call;

  // Collapse streamed deltas into one entry per turn so the transcript reads as
  // conversation rather than one line per token.
  const turns = useMemo(() => {
    const out: Array<{ id: number; speaker: 'ai' | 'customer'; text: string }> = [];
    let aiBuffer: string | null = null;
    for (const e of events) {
      if (e.type === 'user_transcript') {
        aiBuffer = null;
        out.push({ id: out.length + 1, speaker: 'customer', text: e.text ?? '' });
      } else if (e.type === 'ai_delta') {
        if (aiBuffer === null) {
          aiBuffer = '';
          out.push({ id: out.length + 1, speaker: 'ai', text: '' });
        }
        const last = out[out.length - 1];
        last.text += e.text ?? '';
      }
    }
    return out;
  }, [events]);

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

  const idle = state === 'idle';
  const live = state === 'live' || state === 'ending';

  const startCall = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('This browser does not support microphone capture');
      return;
    }
    await call.start();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/employees')} className="gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate(`/employees/${employee.id}/talk`)}>
          Text conversation instead
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
              <p className="text-xs text-muted-foreground">
                {live ? 'Live' : state === 'connecting' ? 'Connecting…' : state === 'ended' ? 'Call ended' : 'Ready'}
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-5">
            {/* Status strip: makes it obvious whether the AI is hearing you. */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              {live ? (
                <>
                  <Radio className={cn('h-4 w-4 text-emerald-600', (aiSpeaking || userSpeaking) && 'animate-pulse')} />
                  <span className="font-medium">
                    {aiSpeaking ? `${employee.name} is speaking…` : userSpeaking ? 'Listening to you…' : 'Listening…'}
                  </span>
                  {livekitConnected ? (
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      ⚡ LiveKit WebRTC Cloud
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <MicOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {state === 'connecting' ? 'Connecting to LiveKit & Call Server…' : 'Microphone is off'}
                  </span>
                </>
              )}
            </div>

            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

            <div className="h-[18rem] space-y-3 overflow-y-auto scrollbar-thin">
              {turns.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {idle ? 'Start the call and speak — the employee will answer out loud.' : 'Waiting for the first turn…'}
                </p>
              ) : (
                turns.map((t) => (
                  <div key={t.id} className={cn('flex', t.speaker === 'customer' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                        t.speaker === 'customer' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted',
                      )}
                    >
                      <p className="mb-0.5 text-[11px] font-semibold opacity-70">
                        {t.speaker === 'customer' ? 'You' : employee.name}
                      </p>
                      <p className="whitespace-pre-wrap">{t.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2">
              {idle ? (
                <Button className="flex-1" size="lg" onClick={startCall}>
                  <Phone className="h-4 w-4" /> Start Live Call
                </Button>
              ) : live ? (
                <Button variant="destructive" className="flex-1" size="lg" onClick={call.hangup}>
                  <PhoneOff className="h-4 w-4" /> End Call
                </Button>
              ) : (
                <Button className="flex-1" size="lg" onClick={call.reset}>
                  <Square className="h-4 w-4" /> Start Another Call
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Before you start</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>This uses your microphone, so allow access when prompted.</p>
              <p>Your speech is transcribed on the server and sent to this employee&apos;s prompt.</p>
              <p>Use headphones if the room is noisy — the AI ignores your mic while it speaks.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Link className="text-primary hover:underline" to={`/employees/${employee.id}/talk`}>
                Text conversation →
              </Link>
              <Link className="text-primary hover:underline" to="/calling/instant">
                Make a real phone call →
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
