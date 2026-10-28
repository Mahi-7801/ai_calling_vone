export interface ApiError {
  success: false;
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}

export interface User {
  id: number;
  organization_id: number | null;
  role: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  email_verified_at?: string | null;
  first_login?: number;
  status?: string;
  last_login_at?: string | null;
  created_at?: string;
}

export interface Organization {
  id: number;
  owner_user_id: number;
  name: string;
  business_type?: string | null;
  calling_purpose?: string | null;
  preferred_language?: string | null;
  credit_balance?: number;
  status: string;
  settings?: unknown;
  created_at?: string;
}

export interface Wallet {
  id: number;
  organization_id: number;
  balance: number;
  lifetime_used: number;
  lifetime_purchased: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreditTransaction {
  id: number;
  organization_id: number;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  reference: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  organization_id: number;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  reference: string | null;
  created_at: string;
}

export interface Subscription {
  id: number;
  organization_id: number;
  plan: string;
  status: string;
  started_at?: string;
  renews_at?: string;
}

export interface AIEmployee {
  id: any;
  organization_id: number;
  name: string;
  avatar_url?: string | null;
  role: string;
  description?: string | null;
  department?: string | null;
  persona?: string | null;
  language?: string;
  language_code?: string;
  personality?: string | null;
  tone?: string | null;
  speaking_style?: string | null;
  formality?: string | null;
  greeting?: string | null;
  objective?: string | null;
  never_say?: string | null;
  instructions?: string | null;
  max_call_duration?: number;
  retry_attempts?: number;
  call_timeout?: number;
  goodbye_message?: string | null;
  working_hours?: unknown;
  record_calls?: number;
  transcript_enabled?: number;
  human_transfer?: number;
  outcome_detection?: number;
  custom_message?: string | null;
  welcome_message?: string | null;
  ambient_sound?: string | null;
  ambient_volume?: number;
  ambient_enabled?: number;
  voice_provider?: string;
  voice?: string;
  voice_speed?: number;
  voice_pitch?: number;
  voice_stability?: number;
  voice_naturalness?: number;
  system_prompt?: string | null;
  status: string;
  total_calls: number;
  successful_calls: number;
  avg_duration: number;
  created_at?: string;
  updated_at?: string;
  // joined / computed
  call_count?: number;
  answered_count?: number;
  avg_duration_actual?: number;
  assigned_number?: string | null;
  livekit_agent_name?: string | null;
  livekit_metadata?: any;
  cartesia_agent_id?: string | null;
  cartesia_agent_url?: string | null;
  custom_keyterms?: string[];
  // detail-only
  faqs?: FAQ[];
  docs?: DocumentRow[];
  knowledge?: KnowledgeRow[];
  scripts?: ScriptRow[];
  examples?: ExampleRow[];
  versions?: EmployeeVersion[];
  numbers?: PhoneNumber[];
  training_updated_at?: string | null;
}

export interface EmployeeVersion {
  id: number;
  employee_id: number;
  version: number;
  is_published?: number;
  created_at?: string;
}

export interface FAQ {
  id: number;
  employee_id: number;
  question: string;
  answer: string;
  created_at?: string;
}

export interface DocumentRow {
  id: number;
  employee_id: number;
  name: string;
  file_type?: string | null;
  file_url?: string | null;
  status?: string;
  created_at?: string;
}

export interface KnowledgeRow {
  id: number;
  employee_id: number;
  type: string;
  title: string;
  content: string;
  created_at?: string;
}

export interface ScriptRow {
  id: number;
  employee_id: number;
  name: string;
  content: string;
  created_at?: string;
}

export interface ExampleRow {
  id: number;
  employee_id: number;
  customer_text: string;
  ideal_response: string;
  created_at?: string;
}

export interface PhoneNumber {
  id: number;
  organization_id: number;
  number: string;
  provider?: string;
  country?: string;
  region?: string | null;
  type?: string;
  employee_id?: number | null;
  status: string;
  /** Carrier sends null when no monthly fee applies; do not default it. */
  monthly_cost?: number | null;
  is_trial?: boolean;
  voice_enabled?: boolean;
  source?: string | null;
  created_at?: string;
  employee_name?: string | null;
}

export interface Lead {
  id: number;
  organization_id: number;
  name?: string | null;
  phone: string;
  company?: string | null;
  purpose?: string | null;
  location?: string | null;
  email?: string | null;
  custom_message?: string | null;
  campaign_id?: number | null;
  employee_id?: number | null;
  status?: string;
  outcome?: string | null;
  interest?: string | null;
  next_followup?: string | null;
  last_call_id?: string | null;
  created_at?: string;
  updated_at?: string;
  // joined
  campaign_name?: string | null;
  employee_name?: string | null;
  total_calls?: number;
  contacts?: Array<{ id: number; lead_id: number; type: string; value: string }>;
  calls?: Call[];
}

export interface Campaign {
  id: number;
  organization_id: number;
  name: string;
  employee_id: number;
  status: string;
  schedule?: unknown;
  call_rules?: unknown;
  total_leads: number;
  pending_leads: number;
  processed_leads: number;
  completed_leads: number;
  failed_leads: number;
  concurrency?: number;
  started_at?: string | null;
  paused_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  employee_name?: string;
  employee_role?: string;
  imported?: number;
  skipped?: number;
  leads?: Array<CampaignLead & { employee_name?: string }>;
}

export interface CampaignLead extends Lead {
  cl_status?: string;
  attempt_count?: number;
  last_error?: string | null;
  called_at?: string | null;
}

export interface Call {
  id: number;
  call_id: string;
  organization_id: number;
  campaign_id?: number | null;
  employee_id: number;
  lead_id?: number | null;
  phone_number: string;
  direction: string;
  status: string;
  duration: number;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  outcome?: string | null;
  outcome_confidence?: number | null;
  outcome_reason?: string | null;
  next_action?: string | null;
  sentiment?: string | null;
  intent?: string | null;
  summary?: string | null;
  recording_url?: string | null;
  recording_proxy_url?: string | null;
  credits_used?: number;
  request_id?: string | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
  // joined
  employee_name?: string | null;
  employee_role?: string | null;
  avatar_url?: string | null;
  lead_name?: string | null;
  lead_company?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  lead_location?: string | null;
  campaign_name?: string | null;
  transcript?: TranscriptRow[];
  events?: CallEvent[];
  recordings?: RecordingRow[];
  analysis?: CallOutcome | null;
}

export interface TranscriptRow {
  id: number;
  call_id: string;
  speaker: 'ai' | 'customer';
  text: string;
  ts: number;
  created_at?: string;
}

export interface CallEvent {
  id: number;
  call_id: string;
  event_type: string;
  payload?: unknown;
  created_at?: string;
}

export interface RecordingRow {
  id: number;
  call_id: string;
  url?: string;
  duration?: number;
  size_bytes?: number;
  created_at?: string;
}

export interface CallOutcome {
  id: number;
  call_id: string;
  outcome: string;
  confidence?: number;
  reason?: string | null;
  next_action?: string | null;
  created_at?: string;
}

export interface Conversation {
  call_id: string;
  phone_number: string;
  direction: string;
  status: string;
  duration: number;
  outcome?: string | null;
  sentiment?: string | null;
  intent?: string | null;
  summary?: string | null;
  recording_url?: string | null;
  created_at: string;
  credits_used?: number;
  employee_id: number;
  employee_name?: string;
  lead_name?: string | null;
  lead_company?: string | null;
}

export interface Webhook {
  id: number;
  organization_id: number;
  url: string;
  secret: string;
  events: string[];
  is_active: number;
  created_at?: string;
}

export interface WebhookDelivery {
  id: number;
  webhook_id: number;
  event: string;
  status?: string;
  attempts?: number;
  created_at?: string;
  url?: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  language_code?: string;
  language_name?: string;
  gender?: string;
  provider: string;
  description?: string;
  tier?: 'premium' | 'standard' | 'value' | 'cloned';
  rate?: number;
  badge?: string;
  is_cloned?: boolean;
  sample_url?: string | null;
  preview_file_id?: string | null;
}

export interface BillingPackage {
  key: string;
  name: string;
  price: number;
  credits: number;
}

export interface BillingData {
  billing: {
    wallet: Wallet;
    transactions: CreditTransaction[];
    subscription: Subscription | null;
    payments: Payment[];
    usage: { calls: number; minutes: number; credits_consumed: number };
    pricing: { creditPerMinute: number; packages: BillingPackage[] };
  };
}

export interface OrderResult {
  order: {
    orderId: string;
    provider: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
    /** Razorpay publishable key - required to open Checkout. */
    keyId: string;
    merchant: string;
    /** Server-side primary key of the pending `payments` row, not a gateway id. */
    paymentId: number;
    credits: number;
  };
}

export interface DashboardData {
  dashboard: {
    onboarding: {
      company_set: boolean;
      employee_created: boolean;
      phone_configured: boolean;
      demo_done: boolean;
    };
    stats: {
      credits: number;
      calls_today: number;
      minutes_used: number;
      successful_calls: number;
      total_calls: number;
      avg_duration: number;
      credits_used_total: number;
    };
    leads: { total: number; contacted: number; interested: number; conversion_pct: number };
    counts: {
      employees: number;
      numbers: number;
      active_campaigns: number;
      employee_perf: Array<{
        id: number;
        name: string;
        role: string;
        status: string;
        calls: number;
        successful: number;
        avg_duration: number;
        interested: number;
      }>;
    };
    charts: {
      callsOverTime: Array<{ day: string; calls: number; minutes: number }>;
      byOutcome: Array<{ outcome: string; c: number }>;
      employeePerf: Array<{ name: string; total: number; success: number }>;
      creditUsage: Array<{ day: string; credits: number }>;
    };
    recentCalls: Call[];
    recentEmployees: AIEmployee[];
    recentCampaigns: Campaign[];
    recentLeads: Lead[];
  };
}

export interface PerformanceData {
  performance: {
    totals: {
      total_calls: number;
      answered_calls: number;
      completed_calls: number;
      failed_calls: number;
      avg_duration: number;
      interested: number;
      conversion: number;
      credits_used: number;
      calls_today: number;
      qualified_today: number;
      hot_leads: number;
    };
    leads: {
      leads_today: number;
      qualified_today: number;
      qualified_total?: number;
      hot_leads: number;
      leads_total: number;
      leads_yesterday: number;
      qualified_yesterday: number;
    };
    hotLeadList: Array<{
      id: number;
      name: string | null;
      phone: string;
      status: string;
      outcome: string | null;
      company: string | null;
      location: string | null;
      created_at: string;
    }>;
    needsAttentionList: Array<{
      id: number;
      name: string | null;
      phone: string;
      status: string;
      created_at: string;
      last_outcome: string | null;
      last_call_status: string | null;
    }>;
    perDay: Array<{ day: string; rawDay: string; calls: number; minutes: number }>;
    employeeComparison: Array<{
      id: number;
      name: string;
      role: string;
      status: string;
      calls: number;
      successful: number;
      avg_duration: number;
      interested: number;
    }>;
    outcomeDistribution: Array<{ outcome: string; label: string; c: number; percent: number }>;
    outcomeTotal: number;
    speedToLeadSeconds: number | null;
    speedToLeadFallbackSeconds: number | null;
    employeeId: number | null;
    /** Names of sub-queries that failed. Empty on a healthy response. */
    errors: string[];
  };
}

export interface SettingsData {
  settings: Record<string, unknown>;
  profile: { id: number; name: string; email: string; phone?: string | null; avatar_url?: string | null };
  organization: Organization;
  apiKeys: Array<{
    id: number;
    name: string;
    key_prefix: string;
    is_active: number;
    expires_at?: string | null;
    created_at?: string;
    last_used_at?: string | null;
  }>;
}

export type CallStatus =
  | 'preparing'
  | 'calling'
  | 'ringing'
  | 'connected'
  | 'ai_speaking'
  | 'customer_speaking'
  | 'completed'
  | 'failed'
  | 'paused';

export interface RealtimeEventBase {
  type: string;
  data: Record<string, unknown>;
}

export interface RealtimeCallEvent extends RealtimeEventBase {
  type:
    | 'call.created'
    | 'call.ringing'
    | 'call.answered'
    | 'call.ai_started'
    | 'call.user_started'
    | 'call.transcript'
    | 'call.completed'
    | 'call.failed';
  data: {
    callId: string;
    callDbId?: number;
    employeeId?: number;
    phoneNumber?: string;
    direction?: string;
    speaker?: string;
    text?: string;
    ts?: number;
    status?: string;
    duration?: number;
    outcome?: string;
    creditsUsed?: number;
    recordingUrl?: string;
    error?: string;
    manuallyEnded?: boolean;
  };
}

/**
 * Canonical lead.status / call.outcome vocabulary. The backend stores and
 * queries these literals lowercase snake_case (db default 'new',
 * callService/mediaStreamService lead updates, and the LLM enum in
 * providers/ai/groq.js), so any Title-Case value written here would never match
 * a WHERE clause. Display text is produced with titleCase() at the render site.
 */
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'interested'
  | 'not_interested'
  | 'callback_requested'
  | 'follow_up'
  | 'converted'
  | 'dnd'
  | 'invalid';

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'interested',
  'not_interested',
  'follow_up',
  'callback_requested',
  'converted',
  'dnd',
  'invalid',
];

/** Outcomes the backend can write to calls.outcome / leads.outcome. */
export const CALL_OUTCOMES = [
  'interested',
  'not_interested',
  'follow_up',
  'callback',
  'converted',
  'dnd',
  'wrong_number',
  'no_answer',
  'busy',
  'failed',
] as const;

export type CallOutcomeValue = (typeof CALL_OUTCOMES)[number];