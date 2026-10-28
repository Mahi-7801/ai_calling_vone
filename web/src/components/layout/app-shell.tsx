import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Sidebar, Topbar } from '@/components/layout/sidebar';
import { useCreditsRealtime } from '@/hooks/useCreditsRealtime';
import { useEmployeeRealtimeSync } from '@/hooks/queries';

export function AppShell() {
  const { isAuthenticated, loading, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useCreditsRealtime();
  // Keeps every open tab's employee list and detail in step with changes made
  // in any other tab. Mounted once here so it covers all pages.
  useEmployeeRealtimeSync();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Pure Platform Superadmin belongs exclusively in the Admin Console
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const routeTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/employees': 'My AI Employees',
    '/employees/new': 'New AI Employee',
    '/calling/instant': 'Instant Call',
    '/calling/campaigns': 'Bulk Campaigns',
    '/calling/inbound': 'Inbound Calls',
    '/calling/contacts': 'Contact List',
    '/results/leads': 'Leads & Results',
    '/results/conversations': 'All Conversations',
    '/training': 'Training Center',
    '/phone-numbers': 'Phone Numbers',
    '/performance': 'Performance',
    '/billing': 'Billing & Credits',
    '/settings': 'Settings',
  };
  const title = routeTitles[location.pathname] ?? 'AI Calling';

  return (
    <div className="min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-64 min-w-0 max-w-full overflow-x-hidden">
        <Topbar onMenu={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 p-2.5 sm:p-4 lg:p-6 w-full max-w-full min-w-0 overflow-x-hidden">
          <div className="w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}