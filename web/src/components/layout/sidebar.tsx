import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  LogOut,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageSquareText,
  PhoneCall,
  PhoneIncoming,
  Phone,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
  X,
  GraduationCap,
  Contact,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { formatCredits } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Employees',
    items: [
      { to: '/employees', label: 'My Employees', icon: Users },
      { to: '/voice-clones', label: 'Voice Clones', icon: Sparkles },
    ],
  },
  {
    label: 'Calling',
    items: [
      { to: '/calling/instant', label: 'Instant Leads', icon: PhoneCall },
      { to: '/calling/campaigns', label: 'Bulk Campaigns', icon: Megaphone },
      { to: '/calling/inbound', label: 'Inbound Calls', icon: PhoneIncoming },
      { to: '/calling/contacts', label: 'Contact List', icon: Contact },
    ],
  },
  {
    label: 'Results & Setup',
    items: [
      { to: '/results/leads', label: 'Leads & Results', icon: ListChecks },
      { to: '/results/conversations', label: 'All Conversations', icon: MessageSquareText },
      { to: '/training', label: 'Train Employees', icon: GraduationCap },
      { to: '/phone-numbers', label: 'Phone Numbers', icon: Phone },
      { to: '/performance', label: 'Performance', icon: BarChart3 },
      { to: '/billing', label: 'Billing', icon: Wallet },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallet, organization, user, logout } = useAuth();
  const navigate = useNavigate();

  const content = (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Telugu AI Calling</p>
          <p className="text-xs text-muted-foreground">{organization?.name ?? 'AI Employees SaaS'}</p>
        </div>
        <button className="ml-auto text-muted-foreground hover:text-foreground lg:hidden" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3 scrollbar-thin">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.label ? (
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => onClose()}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.label === 'Bulk Campaigns' && (
                    <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">New</span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3 space-y-2">
        <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">{formatCredits(wallet?.balance ?? 0)} credits</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Available balance</p>
          <button
            onClick={() => {
              navigate('/billing');
              onClose();
            }}
            className="mt-2 w-full rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Buy credits
          </button>
        </div>

        {/* User Profile & Logout Bar in Sidebar */}
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {(user?.name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground leading-tight">{user?.name || 'Account'}</p>
              <p className="truncate text-[10px] text-muted-foreground leading-tight">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
            title="Sign out of your account"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:block">{content}</aside>
      {/* Mobile */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r">{content}</aside>
        </div>
      ) : null}
    </>
  );
}

/**
 * Who else in this organization is working right now. Derived from live
 * sockets, so it needs no polling and cannot show someone who already left.
 */
function PresenceIndicator() {
  const { users } = usePresence();
  if (users.length === 0) return null;
  return (
    <div
      className="hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground md:flex shrink-0"
      title={users.map((u) => `${u.name}${u.page ? ` — ${u.page}` : ''}`).join('\n')}
    >
      <Users className="h-3.5 w-3.5 text-emerald-600" />
      {users.length === 1 ? `${users[0].name.split(' ')[0]} is online` : `${users.length} others online`}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void; title?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 flex h-14 sm:h-16 items-center justify-between border-b bg-background/80 px-3 sm:px-4 backdrop-blur lg:px-6 min-w-0 max-w-full">
      <div className="flex items-center gap-2.5 min-w-0">
        <button className="text-muted-foreground hover:text-foreground lg:hidden shrink-0" onClick={onMenu} aria-label="Open menu">
          <SlidersHorizontal className="h-5 w-5" />
        </button>
        <div className="hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground md:flex shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI Calling Platform
        </div>
        <PresenceIndicator />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(user?.role === 'admin' || user?.role === 'superadmin') ? (
          <button
            onClick={() => navigate('/admin')}
            className="rounded-md bg-purple-500/15 border border-purple-500/30 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/25"
          >
            Admin
          </button>
        ) : null}
        <button
          onClick={() => navigate('/calling/instant')}
          className="hidden rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 sm:inline-flex"
        >
          <PhoneCall className="mr-1 h-3.5 w-3.5" /> Call now
        </button>

        {/* User Account & Logout in Topbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 rounded-full border py-1 pl-1 pr-1.5 sm:pr-2 bg-card">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shrink-0">
            {(user?.name ?? 'U').charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium leading-tight truncate max-w-[120px]">{user?.name}</p>
            <p className="text-[11px] leading-tight text-muted-foreground truncate max-w-[120px]">{user?.email}</p>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="font-medium text-[11px] sm:text-xs">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}