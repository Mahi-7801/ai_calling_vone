import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtimeEvent } from '@/hooks/useRealtime';
import type {
  AIEmployee,
  BillingData,
  Call,
  Campaign,
  Conversation,
  DashboardData,
  Lead,
  OrderResult,
  PerformanceData,
  PhoneNumber,
  SettingsData,
  VoiceOption,
  Webhook,
  WebhookDelivery,
} from '@/types';

export const qk = {
  dashboard: ['dashboard'] as const,
  employees: ['employees'] as const,
  employee: (id: number | string) => ['employee', String(id)] as const,
  voices: ['voices'] as const,
  leads: (filters: string) => ['leads', filters] as const,
  lead: (id: number) => ['lead', id] as const,
  campaigns: ['campaigns'] as const,
  campaign: (id: number) => ['campaign', id] as const,
  calls: (filters: string) => ['calls', filters] as const,
  call: (id: string) => ['call', id] as const,
  liveCalls: ['live-calls'] as const,
  conversations: (filters: string) => ['conversations', filters] as const,
  conversation: (id: string) => ['conversation', id] as const,
  performance: (employeeId: number | string | null) => ['performance', employeeId ? String(employeeId) : 'all'] as const,
  phoneNumbers: ['phone-numbers'] as const,
  billing: ['billing'] as const,
  settings: ['settings'] as const,
  webhooks: ['webhooks'] as const,
  me: ['me'] as const,
  whatsappConversations: (filters: string) => ['whatsapp-conversations', filters] as const,
  whatsappMessages: (id: number | null) => ['whatsapp-messages', id] as const,
  whatsappChannels: ['whatsapp-channels'] as const,
  whatsappStatus: ['whatsapp-status'] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.get<DashboardData>('/dashboard'),
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: qk.employees,
    queryFn: () => api.get<{ success: boolean; employees: AIEmployee[] }>('/employees'),
  });
}

/**
 * Keeps the cached employee roster in step with changes made in other tabs.
 *
 * Status changes and creates are applied straight to the cache, because the
 * server sends everything those events need and a refetch would show every
 * current tab a spinner. Anything that alters columns a refetch computes (call
 * counts, assigned number) still invalidates rather than patching.
 */
export function useEmployeeRealtimeSync() {
  const qc = useQueryClient();

  useRealtimeEvent('employee.status', (d) => {
    const id = d.id as number;
    const status = d.status as string;
    qc.setQueryData<{ success: boolean; employees: AIEmployee[] }>(qk.employees, (prev) => {
      if (!prev) return prev;
      const list = prev.employees.map((e) => (e.id === id ? { ...e, status } : e));
      return { ...prev, employees: list };
    });
    qc.setQueryData<{ success: boolean; employee: AIEmployee }>(qk.employee(id), (prev) =>
      prev ? { ...prev, employee: { ...prev.employee, status } } : prev,
    );
  });

  useRealtimeEvent('employee.created', () => {
    // The list endpoint also derives call counts and assigned numbers, so a
    // create is a refetch rather than a cache append.
    qc.invalidateQueries({ queryKey: qk.employees });
  });

  useRealtimeEvent(['employee.updated', 'employee.trained'], (d) => {
    const id = d.id as number;
    // Both change server-computed fields (system_prompt, knowledge, faqs), so
    // re-read the detail rather than trusting the event payload.
    qc.invalidateQueries({ queryKey: qk.employee(id) });
  });

  useRealtimeEvent('employee.deleted', (d) => {
    const id = String(d.id);
    qc.setQueryData<{ success: boolean; employees: AIEmployee[] }>(qk.employees, (prev) => {
      if (!prev) return prev;
      return { ...prev, employees: prev.employees.filter((e) => String(e.id) !== id) };
    });
    qc.removeQueries({ queryKey: qk.employee(id) });
  });
}

export function useEmployee(id: number | string | null | undefined) {
  const safeId = typeof id === 'number'
    ? (Number.isFinite(id) && id > 0 ? id : null)
    : (typeof id === 'string' && id.trim().length > 0 ? id.trim() : null);

  return useQuery({
    queryKey: safeId !== null ? qk.employee(safeId) : ['employee', 'invalid'],
    queryFn: () => {
      if (!safeId) return Promise.reject(new Error('Invalid employee ID'));
      return api.get<{ success: boolean; employee: AIEmployee }>(`/employees/${safeId}`);
    },
    enabled: safeId !== null,
  });
}

export function useVoices() {
  return useQuery({
    queryKey: qk.voices,
    queryFn: () =>
      api.get<{ success: boolean; voices: Record<string, VoiceOption[]> }>('/employees/voices'),
  });
}

export function useLeads(filters: { q?: string; status?: string; outcome?: string; employee_id?: string; campaign_id?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  return useQuery({
    queryKey: ['leads', params.toString()],
    queryFn: () =>
      api.get<{
        success: boolean;
        leads: Lead[];
        total: number;
        counts: { byStatus: Array<{ status: string; c: number }> };
      }>(`/leads?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: number | null) {
  const safeId = typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null;
  return useQuery({
    queryKey: qk.lead(safeId ?? 0),
    queryFn: () => {
      if (!safeId) return Promise.reject(new Error('Invalid lead ID'));
      return api.get<{ success: boolean; lead: Lead }>(`/leads/${safeId}`);
    },
    enabled: safeId !== null,
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: qk.campaigns,
    queryFn: () => api.get<{ success: boolean; campaigns: Campaign[] }>('/campaigns'),
    // A running campaign is being dialled by the backend, so poll gently while
    // any campaign is live. This is the safety net behind the realtime events:
    // if the socket is down, the list still advances instead of freezing.
    refetchInterval: (query) => {
      const list = query.state.data?.campaigns ?? [];
      return list.some((c: Campaign) => c.status === 'calling') ? 10_000 : false;
    },
  });
}

export function useCampaign(id: number | null) {
  const safeId = typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null;
  return useQuery({
    queryKey: qk.campaign(safeId ?? 0),
    queryFn: () => {
      if (!safeId) return Promise.reject(new Error('Invalid campaign ID'));
      return api.get<{ success: boolean; campaign: Campaign }>(`/campaigns/${safeId}`);
    },
    enabled: safeId !== null,
    refetchInterval: (query) =>
      query.state.data?.campaign?.status === 'calling' ? 8_000 : false,
  });
}

export function useCalls(filters: { status?: string; direction?: string; employee_id?: string; campaign_id?: string; q?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  return useQuery({
    queryKey: qk.calls(params.toString()),
    queryFn: () => api.get<{ success: boolean; calls: Call[]; total: number }>(`/calls?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useCall(id: string | null) {
  return useQuery({
    queryKey: qk.call(id ?? ''),
    queryFn: () => api.get<{ success: boolean; call: Call }>(`/calls/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as { call?: Call } | undefined)?.call?.status;
      return status && !['completed', 'failed'].includes(status) ? 3000 : false;
    },
  });
}

export function useLiveCalls() {
  return useQuery({
    queryKey: qk.liveCalls,
    queryFn: () => api.get<{ success: boolean; calls: Call[] }>('/calls/live'),
    refetchInterval: 5000,
  });
}

export function useConversations(filters: { q?: string; employee_id?: string; status?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  return useQuery({
    queryKey: qk.conversations(params.toString()),
    queryFn: () =>
      api.get<{ success: boolean; conversations: Conversation[]; total: number; byOutcome: Array<{ outcome: string; c: number }> }>(
        `/conversations?${params.toString()}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function usePerformance(employeeId?: number | string | null) {
  const safeId = typeof employeeId === 'number'
    ? (Number.isFinite(employeeId) && employeeId > 0 ? String(employeeId) : null)
    : (typeof employeeId === 'string' && employeeId.trim().length > 0 ? employeeId.trim() : null);

  return useQuery({
    queryKey: qk.performance(employeeId === undefined ? null : safeId),
    queryFn: () =>
      api.get<PerformanceData>(`/performance/${safeId ? `?employee_id=${encodeURIComponent(safeId)}` : ''}`),
    enabled: employeeId === undefined || employeeId === null || safeId !== null,
    refetchInterval: 30_000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: qk.conversation(id ?? ''),
    queryFn: () => api.get<{ success: boolean; conversation: Call }>(`/conversations/${id}`),
    enabled: !!id,
  });
}

export function usePhoneNumbers() {
  return useQuery({
    queryKey: qk.phoneNumbers,
    queryFn: () => api.get<{ success: boolean; numbers: PhoneNumber[] }>('/phone-numbers'),
  });
}

export function useBilling() {
  return useQuery({
    queryKey: qk.billing,
    queryFn: () => api.get<BillingData>('/billing/'),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: () => api.get<SettingsData>('/settings'),
  });
}

// ---------- Mutations ----------

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<{ success: boolean; employee: AIEmployee }>('/employees', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.employees }),
  });
}

export function useUpdateEmployee(id: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put<{ success: boolean; employee: AIEmployee }>(`/employees/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.employees });
      qc.invalidateQueries({ queryKey: qk.employee(id) });
    },
  });
}

export function useEmployeeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number | string; status: string }) =>
      api.post(`/employees/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.employees }),
  });
}

export function useDuplicateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => api.post<{ success: boolean; employeeId: number | string }>(`/employees/${id}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.employees }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => api.del(`/employees/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.employees });
      const previous = qc.getQueryData<{ success: boolean; employees: AIEmployee[] }>(qk.employees);
      const targetId = String(id);
      qc.setQueryData<{ success: boolean; employees: AIEmployee[] }>(qk.employees, (old) => {
        if (!old) return old;
        return {
          ...old,
          employees: old.employees.filter((e) => String(e.id) !== targetId),
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.employees, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.employees });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<{ success: boolean; lead: Lead; updated?: boolean }>('/leads', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.put<{ success: boolean; lead: Lead }>(`/leads/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/leads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useAssignPhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employeeId }: { id: number; employeeId: number | null }) =>
      api.post<{ success: boolean; number: PhoneNumber }>(`/phone-numbers/${id}/assign`, { employee_id: employeeId ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.phoneNumbers });
      qc.invalidateQueries({ queryKey: qk.employees });
    },
  });
}

export function useDeletePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/phone-numbers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.phoneNumbers }),
  });
}

export function useUpdatePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.put<{ success: boolean }>(`/phone-numbers/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.phoneNumbers }),
  });
}

// Mirrors what VoBizProvider.getNumbersInventory actually maps. The carrier has
// no `prefix_area` field, so the area label is built from `region`/`series`.
export interface VoBizInventoryItem {
  id: string;
  e164: string;
  /** Carrier number class, normalised onto the inventory tabs. */
  type: 'local' | 'national' | 'mobile' | 'tollfree' | 'shared';
  country: string;
  region: string | null;
  /** Capabilities the carrier reports; null when it reports none. */
  features: string | null;
  series: string | null;
  /** null means the carrier quoted no fee - not zero. */
  monthly_fee: number | null;
  setup_fee: number | null;
  release_fee: number | null;
  currency: string;
  is_owned: boolean;
}

export interface VoBizInventoryResponse {
  success: boolean;
  carrier: string;
  accountId: string;
  total: number;
  numbers: VoBizInventoryItem[];
  can_purchase?: boolean;
}

export function useVoBizInventory(
  params: { country?: string; region?: string; type?: string; q?: string; page?: number; limit?: number } = {},
  enabled = true
) {
  const qp = new URLSearchParams();
  if (params.country) qp.set('country', params.country);
  if (params.region) qp.set('region', params.region);
  if (params.type) qp.set('type', params.type);
  if (params.q) qp.set('q', params.q);
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['phone-numbers', 'vobiz-inventory', qp.toString()],
    queryFn: () => api.get<VoBizInventoryResponse>(`/phone-numbers/vobiz/inventory?${qp.toString()}`),
    enabled,
  });
}

export function useBuyVoBizNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      e164: string;
      monthly_fee?: number;
      setup_fee?: number;
      type?: string;
      country?: string;
      region?: string | null;
      employee_id?: number | null;
      order_id?: string;
      payment_id?: string;
      signature?: string;
      payment_method?: string;
    }) =>
      api.post<{ success: boolean; message: string; number: PhoneNumber }>('/phone-numbers/vobiz/buy', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.phoneNumbers });
      qc.invalidateQueries({ queryKey: ['phone-numbers', 'vobiz-inventory'] });
    },
  });
}

export function useWebhooks() {
  return useQuery({
    queryKey: qk.webhooks,
    queryFn: () =>
      api.get<{ success: boolean; webhooks: Webhook[]; deliveries: WebhookDelivery[] }>('/webhooks'),
  });
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<OrderResult>('/billing/create-order', payload),
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ success: boolean; walletBalance?: number; creditsAdded?: number; alreadyPaid?: boolean }>(
        '/billing/verify-payment',
        payload,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.billing }),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<{ success: boolean; webhook: Webhook }>('/webhooks', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.webhooks }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api.put<{ success: boolean }>(`/webhooks/${id}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.webhooks }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.webhooks }),
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (url: string) => api.post<{ success: boolean; ok: boolean; response: string }>('/webhooks/test', { url }),
  });
}

export function useUpdateSettings(section: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<{ success: boolean } & Record<string, unknown>>(`/settings/${section}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings });
      if (section === 'profile') qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

// ---------- WhatsApp Inbox ----------
export type WhatsAppConversation = {
  id: number;
  phone_number: string;
  contact_name: string | null;
  channel_id: number | null;
  channel_phone: string | null;
  status: 'open' | 'resolved';
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
  assigned_employee_id: number | null;
  assigned_employee_name: string | null;
  created_at: string;
};

export type WhatsAppMessage = {
  id: number;
  direction: 'inbound' | 'outbound';
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'template' | 'other';
  body: string | null;
  media_url: string | null;
  status: 'received' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  meta_message_id: string | null;
  error: string | null;
  sender_name: string | null;
  created_at: string;
};

export type WhatsAppChannel = {
  id: number;
  channel_id: string;
  waba_id: string | null;
  phone_number: string | null;
  display_name: string | null;
  status: string;
  is_default: 0 | 1;
};

export type WhatsAppStatus = {
  configured: boolean;
  provider: string;
  channel_count: number;
  webhook_registered: boolean;
};

export function useWhatsAppConversations(params: { status?: string; search?: string; limit?: number; offset?: number } = {}) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) qp.set(k, String(v));
  });
  const qs = qp.toString();
  return useQuery({
    queryKey: qk.whatsappConversations(qs),
    queryFn: () =>
      api.get<{ success: boolean; conversations: WhatsAppConversation[]; total: number; unread: number }>(
        `/whatsapp/conversations${qs ? `?${qs}` : ''}`,
      ),
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });
}

export function useWhatsAppMessages(conversationId: number | null) {
  return useQuery({
    queryKey: qk.whatsappMessages(conversationId),
    queryFn: () =>
      api.get<{ success: boolean; conversation: WhatsAppConversation; messages: WhatsAppMessage[] }>(
        `/whatsapp/conversations/${conversationId}/messages?limit=100`,
      ),
    enabled: conversationId !== null && conversationId !== undefined,
    refetchInterval: 10000,
  });
}

export function useWhatsAppChannels() {
  return useQuery({
    queryKey: qk.whatsappChannels,
    queryFn: () => api.get<{ success: boolean; channels: WhatsAppChannel[] }>('/whatsapp/channels'),
  });
}

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: qk.whatsappStatus,
    queryFn: () => api.get<{ success: boolean; configured: boolean; provider: string; channel_count: number; webhook_registered: boolean }>('/whatsapp/status'),
  });
}

export function useSendWhatsAppMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { body: string }) => api.post<{ success: boolean; message: WhatsAppMessage }>(`/whatsapp/conversations/${conversationId}/messages`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.whatsappMessages(conversationId) });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
}

// -----------------------------------------------------------------------------
// Wallet & Phone Number Purchase State Machine Hooks
// -----------------------------------------------------------------------------

export interface WalletData {
  id: number;
  organization_id: number;
  balance_paise: number;
  reserved_paise: number;
  available_paise: number;
  balance_inr: string;
  reserved_inr: string;
  available_inr: string;
  currency: string;
}

export interface WalletTransaction {
  id: number;
  wallet_id: number;
  organization_id: number;
  amount_paise: number;
  amount_inr: string;
  type: string;
  status: string;
  reference: string;
  balance_after_paise: number;
  balance_after_inr: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface NumberOrder {
  id: number;
  order_id: string;
  order_ref?: string;
  organization_id: number;
  phone_number: string;
  provider: string;
  number_type: string;
  region?: string;
  setup_fee_inr: string;
  monthly_fee_inr: string;
  markup_inr: string;
  total_charged_inr: string;
  provider_cost_inr: string;
  total_charged_paise?: number;
  amount_charged_paise?: number;
  provider_cost_paise?: number;
  provider_order_id?: string;
  status: string;
  error_message?: string;
  assigned_employee_id?: number;
  organization_name?: string;
  org_name?: string;
  user_email?: string;
  user_name?: string;
  created_at: string;
}

export interface FinancialSummaryData {
  provider: {
    name: string;
    authId: string;
    is_live: boolean;
    reported_balance_inr: string;
    safety_reserve_inr: string;
    available_purchasing_capacity_inr: string;
    is_low_balance: boolean;
    last_verified_at: string | null;
  };
  wallets: {
    total_wallets: number;
    total_liabilities_inr: string;
    total_available_inr: string;
    total_reserved_inr: string;
  };
  deposits: {
    total_deposits_count: number;
    total_deposits_inr: string;
  };
  orders: {
    total_orders: number;
    completed_orders: number;
    pending_orders: number;
    failed_orders: number;
    customer_charges_inr: string;
    provider_cost_inr: string;
    gross_margin_inr: string;
  };
  recurring: {
    active_numbers: number;
    monthly_carrier_cost_inr: string;
  };
}

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get<{ success: boolean; wallet: WalletData }>('/wallet'),
  });
}

export function useWalletTransactions(params: { limit?: number; offset?: number; type?: string } = {}) {
  const qp = new URLSearchParams();
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.offset) qp.set('offset', String(params.offset));
  if (params.type) qp.set('type', params.type);

  return useQuery({
    queryKey: ['wallet', 'transactions', qp.toString()],
    queryFn: () => api.get<{ success: boolean; transactions: WalletTransaction[]; total: number }>(`/wallet/transactions?${qp.toString()}`),
  });
}

export function useCreateWalletDeposit() {
  return useMutation({
    mutationFn: (payload: { amount: number }) =>
      api.post<{ success: boolean; order: { orderId: string; keyId: string; amount: number; amountPaise: number; currency: string } }>('/wallet/create-order', payload),
  });
}

export function useVerifyWalletDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { order_id: string; payment_id: string; signature?: string }) =>
      api.post<{ success: boolean; credited: boolean; amount_inr: string; wallet: WalletData }>('/wallet/verify', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['wallet', 'transactions'] });
      qc.invalidateQueries({ queryKey: qk.billing });
    },
  });
}

export function useAvailableNumbers(
  params: { country?: string; region?: string; type?: string; q?: string; page?: number; limit?: number } = {},
  enabled = true
) {
  const qp = new URLSearchParams();
  if (params.country) qp.set('country', params.country);
  if (params.region) qp.set('region', params.region);
  if (params.type) qp.set('type', params.type);
  if (params.q) qp.set('q', params.q);
  if (params.page) qp.set('page', String(params.page));
  if (params.limit) qp.set('limit', String(params.limit));

  return useQuery({
    queryKey: ['numbers', 'available', qp.toString()],
    queryFn: () => api.get<VoBizInventoryResponse & { platform_markup_inr: number }>(`/numbers/available?${qp.toString()}`),
    enabled,
  });
}

export function usePurchaseNumberWithWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { e164: string; employee_id?: number | null; user_message?: string | null }) =>
      api.post<{ success: boolean; orderId: string; number: PhoneNumber; totalChargedInr: string; balanceAfterInr: string; message: string }>('/numbers/purchase', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['wallet', 'transactions'] });
      qc.invalidateQueries({ queryKey: qk.phoneNumbers });
      qc.invalidateQueries({ queryKey: ['numbers', 'available'] });
      qc.invalidateQueries({ queryKey: ['numbers', 'orders'] });
    },
  });
}

export function useNumberOrders(params: { limit?: number; offset?: number } = {}) {
  const qp = new URLSearchParams();
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.offset) qp.set('offset', String(params.offset));

  return useQuery({
    queryKey: ['numbers', 'orders', qp.toString()],
    queryFn: () => api.get<{ success: boolean; orders: NumberOrder[]; total: number }>(`/numbers/orders?${qp.toString()}`),
  });
}

export function useAdminProviderBalance() {
  return useQuery({
    queryKey: ['admin', 'provider-balance'],
    queryFn: () => api.get<{
      success: boolean;
      provider: string;
      authId: string;
      is_live: boolean;
      reported_balance: number;
      reported_balance_inr: string;
      safety_reserve_inr: string;
      available_purchasing_capacity_inr: string;
      currency: string;
      is_low_balance: boolean;
      last_verified_at: string | null;
      active_numbers_count: number;
    }>('/admin/provider-balance'),
    refetchInterval: 30000,
  });
}

export function useAdminFinancialSummary() {
  return useQuery({
    queryKey: ['admin', 'financial-summary'],
    queryFn: () => api.get<FinancialSummaryData & { success: boolean }>('/admin/financial-summary'),
    refetchInterval: 30000,
  });
}

export function useAdminNumberOrders(params: { limit?: number; offset?: number; status?: string; q?: string } = {}) {
  const qp = new URLSearchParams();
  if (params.limit) qp.set('limit', String(params.limit));
  if (params.offset) qp.set('offset', String(params.offset));
  if (params.status) qp.set('status', params.status);
  if (params.q) qp.set('q', params.q);

  return useQuery({
    queryKey: ['admin', 'number-orders', qp.toString()],
    queryFn: () => api.get<{ success: boolean; orders: NumberOrder[]; total: number }>(`/admin/number-orders?${qp.toString()}`),
  });
}

export function useAdminWalletAdjust() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { organization_id: number; amount: number; type?: 'credit' | 'debit'; reason?: string }) =>
      api.post<{ success: boolean; organization_id: number; delta_inr: string; new_balance_inr: string; reference: string }>('/admin/wallet/adjust', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'financial-summary'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

