import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Megaphone, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api';
import { useCampaign } from '@/hooks/queries';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { formatDateTime } from '@/lib/utils';

export function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const campaignId = id && !isNaN(Number(id)) ? Number(id) : null;
  const { data, isLoading, isError, refetch } = useCampaign(campaignId);
  const campaign = data?.campaign;
  const [deleting, setDeleting] = useState(false);

  // The progress bars and lead counts are written by the backend as the
  // campaign dials, which it announces over the realtime socket. Refetching on
  // those events is what makes the counters move while a campaign runs instead
  // of only when the page is reloaded. A light poll covers the gap where a
  // campaign is mid-run and no single lead has finished.
  useRealtimeEvent(
    ['campaign.started', 'campaign.paused', 'campaign.completed'],
    () => { void refetch(); }
  );
  useRealtimeEvent(
    ['call.completed', 'call.failed', 'call.no_answer'],
    (d) => {
      const cid = Number(d.campaignId ?? d.campaign_id ?? 0);
      if (!cid || cid === campaignId) void refetch();
    }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (isError || !campaign) {
    return <ErrorState title="Campaign not found" onRetry={() => refetch()} />;
  }

  const pct = campaign.total_leads ? Math.round((campaign.processed_leads / campaign.total_leads) * 100) : 0;

  const toggle = async () => {
    try {
      await api.post(`/campaigns/${campaign.id}/${campaign.status === 'calling' ? 'pause' : 'start'}`);
      toast.success(campaign.status === 'calling' ? 'Campaign paused' : 'Campaign started');
      refetch();
    } catch (err) {
      toast.error('Action failed', err instanceof ApiClientError ? err.message : '');
    }
  };

  const handleDelete = async () => {
    if (!campaign) return;
    if (!confirm(`Delete campaign "${campaign.name}"? This removes its leads too.`)) return;
    setDeleting(true);
    try {
      await api.del(`/campaigns/${campaign.id}`);
      toast.success('Campaign deleted successfully');
      navigate('/calling/campaigns');
    } catch (err) {
      toast.error('Failed to delete campaign', err instanceof ApiClientError ? err.message : '');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/calling/campaigns')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All campaigns
      </button>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">{campaign.name}</h1>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {campaign.employee_name} · created {formatDateTime(campaign.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button onClick={toggle}>
              {campaign.status === 'calling' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {campaign.status === 'calling' ? 'Pause' : 'Start campaign'}
            </Button>
            <Button
              variant="outline"
              loading={deleting}
              onClick={handleDelete}
              className="text-destructive hover:bg-destructive/10 border-destructive/30 hover:border-destructive/60 cursor-pointer"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total leads', value: campaign.total_leads },
          { label: 'Completed', value: campaign.completed_leads },
          { label: 'Failed', value: campaign.failed_leads },
          { label: 'Pending', value: campaign.pending_leads },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-medium">{pct}%</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Concurrency {campaign.concurrency ?? 3} · started {formatDateTime(campaign.started_at)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign leads</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {!campaign.leads || campaign.leads.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No leads in this campaign yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Attempts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name || '—'}</TableCell>
                    <TableCell className="text-sm">{l.phone}</TableCell>
                    <TableCell className="text-sm">{l.company || '—'}</TableCell>
                    <TableCell><StatusBadge status={l.cl_status ?? l.status} /></TableCell>
                    <TableCell className="text-sm">{l.outcome || '—'}</TableCell>
                    <TableCell className="text-sm">{l.attempt_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}