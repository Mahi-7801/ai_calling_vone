import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones, PhoneIncoming, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { formatDateTime, formatDuration } from '@/lib/utils';
import type { Call } from '@/types';

export function InboundPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['inbound-calls'],
    queryFn: () => api.get<{ success: boolean; calls: Call[]; total: number }>('/calls?direction=inbound&limit=100'),
    refetchInterval: 10000,
  });

  // An inbound call appears the moment the carrier answers it, so refresh on the
  // call events rather than waiting out the poll interval.
  useRealtimeEvent(
    ['call.created', 'call.answered', 'call.completed', 'call.failed', 'call.no_answer'],
    () => { void queryClient.invalidateQueries({ queryKey: ['inbound-calls'] }); }
  );

  const calls = data?.calls ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Inbound Calls</h1>
          <p className="text-sm text-muted-foreground">Calls your AI employees answered on assigned numbers.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col items-start gap-3.5 p-4 sm:p-5 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-xs">
            <Headphones className="h-5 w-5 shrink-0" />
          </div>
          <p className="flex-1 text-sm text-muted-foreground leading-relaxed">
            Inbound numbers are answered by whichever AI employee they are assigned to. Assign numbers from{' '}
            <Link to="/phone-numbers" className="font-semibold text-primary hover:underline">
              Phone Numbers
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : calls.length === 0 ? (
        <EmptyState
          icon={<PhoneIncoming className="h-6 w-6" />}
          title="No inbound calls yet"
          description="When someone calls a number assigned to an AI employee, the conversation will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((c) => (
                  <TableRow key={c.call_id}>
                    <TableCell>
                      <p className="font-medium">{c.lead_name || c.phone_number}</p>
                      <p className="text-xs text-muted-foreground">{c.phone_number}</p>
                    </TableCell>
                    <TableCell className="text-sm">{c.employee_name ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-sm">{formatDuration(c.duration)}</TableCell>
                    <TableCell className="text-sm">{c.outcome || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(c.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Link to={`/results/conversations/${c.call_id}`} className="text-sm text-primary hover:underline">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}