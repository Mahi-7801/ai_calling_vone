import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { LoginPage } from '@/pages/auth/login';
import { RegisterPage } from '@/pages/auth/register';
import { VerifyEmailPage } from '@/pages/auth/verify-email';
import { ForgotPasswordPage } from '@/pages/auth/forgot-password';
import { ResetPasswordPage } from '@/pages/auth/reset-password';
import { OnboardingPage } from '@/pages/auth/onboarding';
import { DashboardPage } from '@/pages/dashboard';
import { EmployeesPage } from '@/pages/employees/employees';
import { EmployeeNewPage } from '@/pages/employees/employee-new';
import { EmployeeEditPage } from '@/pages/employees/employee-edit';
import { EmployeeTalkPage } from '@/pages/employees/employee-talk';
import { BrowserCallPage } from '@/pages/employees/employee-call';
import { InstantCallPage } from '@/pages/calling/instant-call';
import { CampaignsPage } from '@/pages/calling/campaigns';
import { CampaignDetailPage } from '@/pages/calling/campaign-detail';
import { InboundPage } from '@/pages/calling/inbound';
import { ContactListPage } from '@/pages/calling/contact-list';
import { LeadsPage } from '@/pages/results/leads';
import { ConversationsPage } from '@/pages/results/conversations';
import { TrainingPage } from '@/pages/results/training';
import { PhoneNumbersPage } from '@/pages/phone-numbers';
import { VoiceClonesPage } from '@/pages/voice-clones';
import { PerformancePage } from '@/pages/performance';
import { BillingPage } from '@/pages/billing';
import { SettingsPage } from '@/pages/settings';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminOverviewPage } from '@/pages/admin/admin-overview';
import { AdminVoiceClonesPage } from '@/pages/admin/admin-voice-clones';
import { AdminProvidersPage } from '@/pages/admin/admin-providers';
import { AdminLiveCallsPage } from '@/pages/admin/admin-live-calls';
import { AdminPaymentsPage } from '@/pages/admin/admin-payments';
import { AdminNumbersPage } from '@/pages/admin/admin-numbers';
import { AdminAvailableNumbersPage } from '@/pages/admin/admin-available-numbers';
import { AdminPurchasedNumbersPage } from '@/pages/admin/admin-purchased-numbers';
import { AdminUsersPage } from '@/pages/admin/admin-users';
import { AdminConfigPage } from '@/pages/admin/admin-config';
import { LandingPage } from '@/pages/landing';

import { useAuth } from '@/context/AuthContext';

function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Customer / Tenant App Shell */}
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employees/new" element={<EmployeeNewPage />} />
        <Route path="/employees/:id" element={<EmployeeEditPage />} />
        <Route path="/employees/:id/talk" element={<EmployeeTalkPage />} />
        <Route path="/employees/:id/call" element={<BrowserCallPage />} />
        <Route path="/calling/instant" element={<InstantCallPage />} />
        <Route path="/calling/campaigns" element={<CampaignsPage />} />
        <Route path="/calling/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/calling/inbound" element={<InboundPage />} />
        <Route path="/calling/contacts" element={<ContactListPage />} />
        <Route path="/contacts" element={<Navigate to="/calling/contacts" replace />} />
        <Route path="/results/leads" element={<LeadsPage />} />
        <Route path="/results/conversations" element={<ConversationsPage />} />
        <Route path="/results/conversations/:id" element={<ConversationsPage detail />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/voice-clones" element={<VoiceClonesPage />} />
        <Route path="/phone-numbers" element={<PhoneNumbersPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<Navigate to="/settings/profile" />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
      </Route>

      {/* Enterprise Platform Admin Portal */}
      <Route path="/admin" element={<AdminShell />}>
        <Route index element={<AdminOverviewPage />} />
        <Route path="voice-clones" element={<AdminVoiceClonesPage />} />
        <Route path="providers" element={<AdminProvidersPage />} />
        <Route path="live-calls" element={<AdminLiveCallsPage />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="numbers" element={<AdminNumbersPage />} />
        <Route path="available-numbers" element={<AdminAvailableNumbersPage />} />
        <Route path="purchased-numbers" element={<AdminPurchasedNumbersPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="config" element={<AdminConfigPage />} />
      </Route>

      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/home" element={<LandingPage />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}