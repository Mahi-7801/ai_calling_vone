import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Server,
  PhoneCall,
  CreditCard,
  Phone,
  Users,
  KeyRound,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ShoppingBag,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

interface AdminNavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badge?: string;
  isLive?: boolean;
}

interface AdminNavGroup {
  groupLabel?: string;
  items: AdminNavItem[];
}

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    groupLabel: 'Monitoring & Real-Time',
    items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/live-calls', label: 'Live Supervisor', icon: PhoneCall, isLive: true },
      { to: '/admin/providers', label: 'Providers & Balances', icon: Server },
    ],
  },
  {
    groupLabel: 'AI & Telephony Pool',
    items: [
      { to: '/admin/voice-clones', label: 'Voice Clones', icon: Sparkles, badge: 'Cartesia' },
      { to: '/admin/numbers', label: 'Phone Numbers', icon: Phone },
      { to: '/admin/available-numbers', label: 'Available Numbers', icon: ShoppingBag },
      { to: '/admin/purchased-numbers', label: 'Purchased Numbers', icon: History },
    ],
  },
  {
    groupLabel: 'Platform Management',
    items: [
      { to: '/admin/users', label: 'Users & Orgs', icon: Users },
      { to: '/admin/payments', label: 'Payments & Wallets', icon: CreditCard },
      { to: '/admin/config', label: 'API Credentials', icon: KeyRound },
    ],
  },
];

export function AdminShell() {
  const { user, isAdmin, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate(user ? '/dashboard' : '/login', { replace: true });
    }
  }, [isAdmin, loading, user, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-purple-600 border-t-transparent" />
          <p className="text-xs font-medium text-muted-foreground">Loading Admin Console...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  // Determine current active page title
  const currentItem = ADMIN_NAV_GROUPS.flatMap((g) => g.items).find((i) =>
    i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)
  );
  const currentTitle = currentItem?.label ?? 'Admin Console';

  const sidebarContent = (
    <div className="flex h-full flex-col bg-card border-r">
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4 lg:px-5 bg-card">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold tracking-tight text-foreground">Admin Console</span>
            </div>
            <span className="inline-block rounded bg-purple-500/15 px-1.5 py-0.2 text-[10px] font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-300">
              Superadmin
            </span>
          </div>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Vertical Navigation Links */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin">
        {ADMIN_NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.groupLabel ? (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.groupLabel}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150',
                      isActive
                        ? 'bg-purple-600 text-white font-semibold shadow-xs shadow-purple-600/30'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className={cn('h-4 w-4 shrink-0 transition-transform group-hover:scale-105', isActive ? 'text-white' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className="truncate leading-normal">{item.label}</span>

                    {item.isLive && (
                      <span className="ml-auto flex items-center gap-1 shrink-0">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className={cn('text-[9px] font-bold uppercase tracking-wider', isActive ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400')}>
                          Live
                        </span>
                      </span>
                    )}

                    {item.badge && !item.isLive && (
                      <span
                        className={cn(
                          'ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0',
                          isActive ? 'bg-white/25 text-white' : 'bg-purple-500/10 text-purple-700 dark:text-purple-300'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Admin Sidebar Footer */}
      <div className="border-t p-3 space-y-2 bg-card">
        {/* Superadmin User Box */}
        <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 p-2.5">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white shadow-xs">
            SA
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground leading-tight">{user?.name || 'Superadmin'}</p>
            <p className="truncate text-[10px] text-muted-foreground leading-tight">{user?.email}</p>
          </div>
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/15 hover:border-destructive/30"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out of Admin
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Desktop Fixed Side Navbar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Side Navbar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main App Canvas (with left padding on lg screens) */}
      <div className="flex min-h-screen flex-col lg:pl-[268px]">
        {/* Admin Top Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur lg:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="text-muted-foreground hover:text-foreground lg:hidden p-1.5 rounded-lg hover:bg-muted shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium text-muted-foreground hidden sm:inline shrink-0">Admin</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground hidden sm:inline shrink-0" />
              <h1 className="text-xs sm:text-sm font-bold text-foreground truncate">{currentTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* System Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>System Operational</span>
            </div>

            {/* Quick Admin Profile Display */}
            <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-purple-600" />
              <span className="hidden md:inline font-mono text-[11px] text-foreground font-semibold">{user?.email}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 overflow-x-hidden min-w-0 w-full max-w-full">
          <div className="w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
