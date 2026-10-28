import { ArrowRight, FileSpreadsheet, ListChecks, Phone, BarChart3, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CampaignHeroProps {
  onCreateClick: () => void;
  hasEmployees?: boolean;
}

/**
 * Static explainer shown when there are no campaigns yet, or on demand.
 *
 * It deliberately carries no lead counts, sample contact rows or progress
 * percentages: nothing here is live data, and a made-up "153 of 247 / 88%
 * interested" reads as a real campaign on a screen that has no campaign.
 */
export function CampaignHero({ onCreateClick }: CampaignHeroProps) {
  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full">
      {/* Top Banner from screenshot */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3.5 sm:p-4 text-sm dark:border-amber-500/20 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-xs sm:text-sm truncate">Finish setting up your AI employee</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground">About three minutes, and free to build and test.</p>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full sm:w-auto bg-amber-600 font-medium text-white hover:bg-amber-700 dark:bg-amber-500 text-xs sm:text-sm h-8 shrink-0"
          onClick={onCreateClick}
        >
          Continue
        </Button>
      </div>

      {/* Blue Unlock Info Pill */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 py-2 px-3 text-xs text-blue-700 dark:text-blue-300 text-center">
        <Lock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        <span>Add a Bulk Calling employee to unlock this panel</span>
        <button
          onClick={onCreateClick}
          className="font-semibold underline hover:text-blue-900 dark:hover:text-blue-100 ml-1"
        >
          Add one
        </button>
      </div>

      {/* Main Hero Container */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border bg-gradient-to-b from-card/80 via-card/50 to-muted/20 p-4 sm:p-8 md:p-12 shadow-sm backdrop-blur min-w-0 max-w-full">
        <div className="mx-auto max-w-3xl text-center min-w-0">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-0.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Bulk Campaigns
          </div>

          {/* Heading */}
          <h1 className="mt-4 sm:mt-5 text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground sm:leading-tight">
            One list in, fully worked,
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              while you&apos;re elsewhere.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-3 sm:mt-4 max-w-2xl text-xs sm:text-base text-muted-foreground">
            Old leads, a customer base, a cold list — upload it once and this employee dials the whole thing, at a pace
            you set. Here&apos;s exactly how:
          </p>
        </div>

        {/* 3 Step Cards Flow */}
        <div className="relative mt-12 grid gap-6 md:grid-cols-3">
          {/* Connecting Line (Desktop) with Animated Pulsing Data Nodes matching Image 1 */}
          <div className="absolute top-1/2 left-20 right-20 hidden -translate-y-8 md:block pointer-events-none z-0">
            <div className="w-full border-t border-border/80" />
            
            {/* Pulsing Data Pill between 01 and 02 */}
            <div className="absolute top-1/2 left-[31%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
              <span className="relative flex h-3.5 w-7 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-500/50">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
                <span className="relative h-1.5 w-3.5 rounded-full bg-white/90" />
              </span>
            </div>

            {/* Pulsing Data Pill between 02 and 03 */}
            <div className="absolute top-1/2 left-[69%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
              <span className="relative flex h-3.5 w-7 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-500/50">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
                <span className="relative h-1.5 w-3.5 rounded-full bg-white/90" />
              </span>
            </div>
          </div>

          {/* Card 01 */}
          <div className="relative z-10 flex flex-col items-center rounded-2xl border bg-card/90 p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
            <span className="absolute top-3 right-4 font-mono text-xs font-semibold text-muted-foreground/60">01</span>

            <div className="my-3 flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 rounded-lg bg-card px-3.5 py-1.5 shadow-sm border border-emerald-500/30">
                <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                <span className="font-mono text-xs font-semibold text-foreground">your-contacts.csv</span>
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Phone numbers checked on import
              </span>
            </div>

            <h3 className="text-base font-bold text-foreground">Upload your list</h3>
            <p className="mt-1 text-xs text-muted-foreground">A CSV, or pulled from Leads</p>
          </div>

          {/* Card 02 */}
          <div className="relative z-10 flex flex-col items-center rounded-2xl border bg-card/90 p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
            <span className="absolute top-3 right-4 font-mono text-xs font-semibold text-muted-foreground/60">02</span>

            <div className="my-3 flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl bg-primary/5 border border-primary/15 px-4 text-center">
              <ListChecks className="h-5 w-5 text-primary" />
              <p className="text-xs text-muted-foreground">
                Each contact gets its own call: dialled, transcribed, then scored with an outcome and a next action.
              </p>
            </div>

            <h3 className="text-base font-bold text-foreground">Employee dials automatically</h3>
            <p className="mt-1 text-xs text-muted-foreground">At the pace you set</p>
          </div>

          {/* Card 03 */}
          <div className="relative z-10 flex flex-col items-center rounded-2xl border bg-card/90 p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
            <span className="absolute top-3 right-4 font-mono text-xs font-semibold text-muted-foreground/60">03</span>

            <div className="my-3 flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 text-center">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <p className="text-xs text-muted-foreground">
                Progress, outcomes and credits spent appear on the campaign page once the campaign is running.
              </p>
            </div>

            <h3 className="text-base font-bold text-foreground">Watch it dial — live</h3>
            <p className="mt-1 text-xs text-muted-foreground">Full analytics as it runs</p>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-8 sm:mt-12 flex justify-center w-full">
          <Button
            size="lg"
            onClick={onCreateClick}
            className="group relative h-11 sm:h-12 gap-2 rounded-full px-5 sm:px-8 text-sm sm:text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-105 w-full sm:w-auto"
          >
            Create your first campaign
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}