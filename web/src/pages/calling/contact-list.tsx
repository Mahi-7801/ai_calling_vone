import { useNavigate } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeads } from '@/hooks/queries';
import { ContactListManager } from '@/components/contacts/contact-list-manager';

export function ContactListPage() {
  const navigate = useNavigate();
  const { data: leadsData } = useLeads({ limit: 1 });
  const totalCount = leadsData?.total ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Contact List</h1>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {totalCount} ready
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Audience Manager
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Organize phone numbers, import contact sheets, and prepare audiences for autonomous AI calling campaigns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            onClick={() => navigate('/calling/campaigns')}
            className="gap-1.5 font-semibold text-xs sm:text-sm h-8 sm:h-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <Megaphone className="h-4 w-4" /> Go to Bulk Campaigns
          </Button>
        </div>
      </div>

      {/* Main Interactive Contact List Manager */}
      <ContactListManager onLaunchCampaign={() => navigate('/calling/campaigns')} />
    </div>
  );
}
