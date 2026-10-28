import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  HelpCircle,
  Megaphone,
  Pause,
  Play,
  Plus,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api';
import { useCampaigns } from '@/hooks/queries';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import { formatDate } from '@/lib/utils';
import type { Campaign } from '@/types';
import { CampaignHero } from '@/components/campaigns/campaign-hero';
import { NewOutboundCampaignModal } from '@/components/campaigns/new-outbound-campaign-modal';
import { ContactListManager } from '@/components/contacts/contact-list-manager';

export function CampaignsPage() {
  const { data, isLoading, refetch } = useCampaigns();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showHeroGuide, setShowHeroGuide] = useState(false);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'contacts'>('campaigns');
  const [initialModalContacts, setInitialModalContacts] = useState<any[] | undefined>(undefined);
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<'all' | 'immediate' | 'scheduled'>('all');

  const campaigns = data?.campaigns ?? [];

  // Campaign progress is driven by the backend, which emits these as leads are
  // dialled. Without this the table sat frozen at whatever it showed when the
  // page loaded, and processed_leads only moved on a manual refresh.
  useRealtimeEvent(
    ['campaign.started', 'campaign.paused', 'campaign.completed'],
    () => { void refetch(); }
  );
  // Each lead resolves individually, so call-level events also nudge the list.
  useRealtimeEvent(
    ['call.completed', 'call.failed', 'call.no_answer'],
    (d) => {
      if (d.campaignId || d.campaign_id) void refetch();
    }
  );

  const toggle = async (c: Campaign) => {
    setBusyId(c.id);
    try {
      await api.post(`/campaigns/${c.id}/${c.status === 'calling' ? 'pause' : 'start'}`);
      toast.success(c.status === 'calling' ? 'Campaign paused' : 'Campaign started');
      refetch();
    } catch (err) {
      toast.error('Action failed', err instanceof ApiClientError ? err.message : '');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: Campaign) => {
    if (!confirm(`Delete campaign "${c.name}"? This removes its leads too.`)) return;
    setBusyId(c.id);
    try {
      await api.del(`/campaigns/${c.id}`);
      toast.success('Campaign deleted successfully');
      refetch();
    } catch (err) {
      toast.error('Failed to delete campaign', err instanceof ApiClientError ? err.message : '');
    } finally {
      setBusyId(null);
    }
  };

  // Campaign classifications
  const isScheduledCampaign = (c: Campaign) => {
    const sched = c.schedule as any;
    return c.status === 'scheduled' || (sched && typeof sched === 'object' && sched.mode === 'later');
  };
  const scheduledCampaigns = campaigns.filter(isScheduledCampaign);
  const immediateCampaigns = campaigns.filter((c) => !isScheduledCampaign(c));
  const activeCampaigns = campaigns.filter((c) => c.status === 'calling').length;
  const totalCampaigns = campaigns.length;
  const totalLeads = campaigns.reduce((acc, c) => acc + (c.total_leads || 0), 0);
  const completedLeads = campaigns.reduce((acc, c) => acc + (c.completed_leads || 0), 0);

  const displayedCampaigns = campaigns.filter((c) => {
    if (campaignTypeFilter === 'immediate') return !isScheduledCampaign(c);
    if (campaignTypeFilter === 'scheduled') return isScheduledCampaign(c);
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 max-w-full">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Bulk Campaigns</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Outbound Engine
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Run autonomous AI calling campaigns at scale across your contact lists.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab(activeTab === 'contacts' ? 'campaigns' : 'contacts')}
            className={`text-xs h-8 sm:h-9 gap-1.5 ${
              activeTab === 'contacts' ? 'bg-primary/10 text-primary border-primary/30' : ''
            }`}
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            {activeTab === 'contacts' ? 'View Campaigns' : 'Contact List'}
          </Button>

          {campaigns.length > 0 && activeTab === 'campaigns' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHeroGuide(!showHeroGuide)}
              className="text-xs h-8 sm:h-9"
            >
              <HelpCircle className="h-3.5 w-3.5 mr-1" />
              {showHeroGuide ? 'Hide Overview' : 'How it works'}
            </Button>
          )}
          <Button
            onClick={() => {
              setInitialModalContacts(undefined);
              setOpen(true);
            }}
            className="gap-1.5 font-semibold shadow-sm text-xs sm:text-sm h-8 sm:h-9"
          >
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'campaigns'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
        >
          <Megaphone className="h-3.5 w-3.5" />
          <span>Campaigns ({campaigns.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'contacts'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Contact List</span>
        </button>
      </div>

      {/* VIEW 1: CONTACT LIST TAB */}
      {activeTab === 'contacts' && (
        <ContactListManager
          onLaunchCampaign={(contactsToPass) => {
            setInitialModalContacts(contactsToPass);
            setOpen(true);
          }}
        />
      )}

      {/* VIEW 2: CAMPAIGNS TAB */}
      {activeTab === 'campaigns' && (
        <>
          {/* Hero Overview: Shown when no campaigns exist, or when user toggles 'How it works' */}
          {(!isLoading && campaigns.length === 0) || showHeroGuide ? (
            <CampaignHero onCreateClick={() => { setInitialModalContacts(undefined); setOpen(true); }} />
          ) : null}

      {/* If campaigns exist, show KPI stats & table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : campaigns.length > 0 ? (
        <div className="space-y-4 sm:space-y-5 min-w-0 max-w-full">
          {/* Quick Stats Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-3.5 sm:p-4 bg-card/60 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Campaigns</p>
                <Megaphone className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-extrabold text-foreground">{totalCampaigns}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {activeCampaigns} currently active dialing
              </p>
            </Card>

            <Card className="p-3.5 sm:p-4 bg-card/60 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Immediate Calling</p>
                <Zap className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-extrabold text-foreground">{immediateCampaigns.length}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Live / immediate dispatch</p>
            </Card>

            <Card className="p-3.5 sm:p-4 bg-card/60 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scheduled Campaigns</p>
                <Calendar className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-extrabold text-foreground">{scheduledCampaigns.length}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Timed automated launch
              </p>
            </Card>

            <Card className="p-3.5 sm:p-4 bg-card/60 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Calls Completed</p>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-extrabold text-foreground">{completedLeads}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {totalLeads > 0 ? Math.round((completedLeads / totalLeads) * 100) : 0}% completion across {totalLeads} leads
              </p>
            </Card>
          </div>

          {/* Filter Pills for Immediate vs Scheduled */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCampaignTypeFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  campaignTypeFilter === 'all'
                    ? 'bg-foreground text-background border-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                }`}
              >
                All Campaigns ({campaigns.length})
              </button>
              <button
                type="button"
                onClick={() => setCampaignTypeFilter('immediate')}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  campaignTypeFilter === 'immediate'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                }`}
              >
                <Zap className="h-3 w-3" /> Immediate ({immediateCampaigns.length})
              </button>
              <button
                type="button"
                onClick={() => setCampaignTypeFilter('scheduled')}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  campaignTypeFilter === 'scheduled'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                }`}
              >
                <Calendar className="h-3 w-3" /> Scheduled ({scheduledCampaigns.length})
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Showing {displayedCampaigns.length} of {campaigns.length} campaigns
            </p>
          </div>

          {/* Mobile Cards View */}
          <div className="space-y-3 md:hidden">
            {displayedCampaigns.map((c) => {
              const pct = c.total_leads ? Math.round((c.processed_leads / c.total_leads) * 100) : 0;
              const isSched = isScheduledCampaign(c);
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/calling/campaigns/${c.id}`)}
                  className="rounded-xl border bg-card p-3.5 shadow-sm space-y-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                        {isSched ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                            <Calendar className="h-2.5 w-2.5" /> Scheduled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <Zap className="h-2.5 w-2.5" /> Immediate
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.employee_name || 'AI Employee'} · {c.total_leads} leads
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t text-xs">
                    <span className="text-muted-foreground">{formatDate(c.created_at)}</span>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busyId === c.id}
                        onClick={() => toggle(c)}
                        className="h-7 text-xs px-2.5"
                      >
                        {c.status === 'calling' ? (
                          <><Pause className="h-3 w-3 mr-1" /> Pause</>
                        ) : (
                          <><Play className="h-3 w-3 mr-1" /> Start</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busyId === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(c);
                        }}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                        title="Delete campaign"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table Card */}
          <Card className="hidden md:block">
            <CardContent className="p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Employee & Caller ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedCampaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                        No campaigns found in this filter category.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedCampaigns.map((c) => {
                      const pct = c.total_leads ? Math.round((c.processed_leads / c.total_leads) * 100) : 0;
                      const isSched = isScheduledCampaign(c);
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/40 transition-colors"
                          onClick={() => navigate(`/calling/campaigns/${c.id}`)}
                        >
                          <TableCell>
                            <p className="font-semibold text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.total_leads} leads · concurrency {c.concurrency ?? 1} call{c.concurrency === 1 ? '' : 's'}
                            </p>
                          </TableCell>
                          <TableCell>
                            {isSched ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                <Calendar className="h-3 w-3" /> Scheduled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                <Zap className="h-3 w-3" /> Immediate
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="font-medium text-foreground">{c.employee_name ?? '—'}</span>
                            <p className="text-[11px] text-muted-foreground">{c.employee_role || 'AI Caller'}</p>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={c.status} />
                          </TableCell>
                          <TableCell className="min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-foreground">{pct}%</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {c.completed_leads} done · {c.failed_leads} failed · {c.pending_leads} pending
                            </p>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                loading={busyId === c.id}
                                onClick={() => toggle(c)}
                                className="h-8 text-xs font-medium"
                              >
                                {c.status === 'calling' ? (
                                  <Pause className="h-3.5 w-3.5 mr-1" />
                                ) : (
                                  <Play className="h-3.5 w-3.5 mr-1" />
                                )}
                                {c.status === 'calling' ? 'Pause' : 'Start'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busyId === c.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  remove(c);
                                }}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                                title="Delete campaign"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
        </>
      )}

      {/* New Outbound Campaign Comprehensive Modal */}
      <NewOutboundCampaignModal
        open={open}
        onOpenChange={setOpen}
        initialContacts={initialModalContacts}
        onSuccess={(id) => {
          refetch();
          navigate(`/calling/campaigns/${id}`);
        }}
      />
    </div>
  );
}