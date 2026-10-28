import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, PhoneCall, MessagesSquare, Languages, BarChart3, ShieldCheck } from 'lucide-react';

const FEATURES = [
  { icon: PhoneCall, label: 'Instant & bulk AI phone calls' },
  { icon: Languages, label: 'Natural Telugu conversations' },
  { icon: MessagesSquare, label: 'Live transcripts & analysis' },
  { icon: BarChart3, label: 'Employee performance analytics' },
  { icon: ShieldCheck, label: 'Org-level security & compliance' },
];

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="relative flex min-h-screen">
      {/* Top right "Back to Landing Page" button */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-100 hover:text-slate-900 transition-all hover:scale-[1.02]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Landing Page</span>
        </Link>
      </div>

      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-indigo-700 p-10 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2.5 w-fit hover:opacity-90 transition-opacity" title="Back to Landing Page">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Bot className="h-6 w-6" />
          </div>
          <span className="text-lg font-semibold">Telugu AI Calling</span>
        </Link>

        <div className="space-y-4">
          <h1 className="max-w-md text-3xl font-bold leading-tight">
            Hire AI employees that call your leads and have real conversations.
          </h1>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Record every call, analyze intent, and follow up — all with a single Telugu-first AI calling platform.
          </p>
        </div>

        <ul className="space-y-3">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-center gap-3 text-sm text-primary-foreground/90">
              <f.icon className="h-4 w-4" /> {f.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Landing Page</span>
          </Link>

          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <span className="font-semibold">Telugu AI Calling</span>
            </Link>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}