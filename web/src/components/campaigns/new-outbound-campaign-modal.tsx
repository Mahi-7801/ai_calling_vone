import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useEmployees, usePhoneNumbers, useLeads } from '@/hooks/queries';
import { api, ApiClientError } from '@/lib/api';
import { normalizePhone, formatPhoneDisplay } from '@/lib/utils';
import type { Campaign } from '@/types';

interface ContactItem {
  id: string;
  phone: string;
  name: string;
  variables: Record<string, string>;
}

const ALL_DAYS = [
  { key: 'Mon', label: 'Mon' },
  { key: 'Tue', label: 'Tue' },
  { key: 'Wed', label: 'Wed' },
  { key: 'Thu', label: 'Thu' },
  { key: 'Fri', label: 'Fri' },
  { key: 'Sat', label: 'Sat' },
  { key: 'Sun', label: 'Sun' },
];

export function NewOutboundCampaignModal({
  open,
  onOpenChange,
  onSuccess,
  initialContacts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: (campaignId: number) => void;
  initialContacts?: any[];
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: empData, isLoading: empsLoading } = useEmployees();
  const { data: phoneData } = usePhoneNumbers();
  const { data: leadsData } = useLeads({ limit: 100 });

  // Form State
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  
  // Window & Rules
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [skipOptedOut, setSkipOptedOut] = useState(true);
  const [callingDays, setCallingDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [holidayInput, setHolidayInput] = useState('');
  const [skipRecentDays, setSkipRecentDays] = useState(0);

  // Contacts
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [customVariables, setCustomVariables] = useState<string[]>(['email']);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFromDatabase, setIsFromDatabase] = useState(false);

  // Sub-actions & modals
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactVars, setNewContactVars] = useState<Record<string, string>>({});

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const [showLoadLeadsModal, setShowLoadLeadsModal] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);

  const [showAddVarModal, setShowAddVarModal] = useState(false);
  const [newVarName, setNewVarName] = useState('');

  // Dispatch Mode: 'immediate' (Start calling right now) vs 'scheduled' (Queue for future date & time)
  const [dispatchMode, setDispatchMode] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledDate, setScheduledDate] = useState('');
  const [repeatMode, setRepeatMode] = useState<'One-time' | 'Daily' | 'Weekly'>('One-time');

  // Retries
  const [autoRetry, setAutoRetry] = useState(false);
  const [retryCount, setRetryCount] = useState(2);

  // Consent & Submitting
  const [consented, setConsented] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Auto populate contacts from initialContacts or database leads
  useEffect(() => {
    if (!open) return;

    const formatLead = (l: any): ContactItem => ({
      id: `c_${l.id || Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      phone: normalizePhone(l.phone || ''),
      name: l.name || '',
      variables: {
        company: l.company || '',
        purpose: l.purpose || '',
        location: l.location || '',
        email: l.email || '',
        custom_message: l.custom_message || '',
        ...(l.variables || {}),
      },
    });

    if (initialContacts && initialContacts.length > 0) {
      const formatted = initialContacts.map(formatLead);
      setContacts(formatted);
      setIsFromDatabase(true);

      const vars = new Set<string>(['email']);
      formatted.forEach((c) => {
        Object.keys(c.variables || {}).forEach((k) => {
          if (c.variables[k]) vars.add(k);
        });
      });
      setCustomVariables(Array.from(vars));
    } else if (leadsData?.leads && leadsData.leads.length > 0 && contacts.length === 0) {
      const formatted = leadsData.leads.map(formatLead);
      setContacts(formatted);
      setIsFromDatabase(true);

      const vars = new Set<string>(['email']);
      formatted.forEach((c) => {
        Object.keys(c.variables || {}).forEach((k) => {
          if (c.variables[k]) vars.add(k);
        });
      });
      setCustomVariables(Array.from(vars));
    }

    // Default select first AI employee if none selected
    if (!employeeId && empData?.employees && empData.employees.length > 0) {
      setEmployeeId(String(empData.employees[0].id));
    }
  }, [open, initialContacts, leadsData?.leads, empData?.employees]);

  const employees = empData?.employees ?? [];
  const phoneNumbers = phoneData?.numbers ?? [];

  // Selected Employee Details & Assigned Phone Number
  const selectedEmp = useMemo(() => {
    return employees.find((e) => String(e.id) === String(employeeId));
  }, [employees, employeeId]);

  const assignedPhone = useMemo(() => {
    if (!selectedEmp) return null;
    const match = phoneNumbers.find((p) => p.employee_id === selectedEmp.id);
    return match?.number || '+91 98100 00001 (Default Caller ID)';
  }, [selectedEmp, phoneNumbers]);

  // Calling Days text helper
  const callingDaysText = useMemo(() => {
    if (callingDays.length === 7) return 'Dials any day of the week.';
    if (callingDays.length === 5 && !callingDays.includes('Sat') && !callingDays.includes('Sun')) {
      return 'Dials on weekdays (Mon–Fri).';
    }
    if (callingDays.length === 0) return 'No calling days selected.';
    return `Dials on: ${callingDays.join(', ')}.`;
  }, [callingDays]);

  // Valid Contacts Ready Count
  const readyContacts = useMemo(() => {
    return contacts.filter((c) => {
      const p = normalizePhone(c.phone);
      return p.length >= 10;
    });
  }, [contacts]);

  // Filtered Contacts for preview
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.phone.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        Object.values(c.variables).some((v) => v.toLowerCase().includes(q))
    );
  }, [contacts, searchQuery]);

  // Reset form
  const handleClose = () => {
    setName('');
    setEmployeeId('');
    setConcurrency(1);
    setWindowStart('');
    setWindowEnd('');
    setContacts([]);
    setHolidays([]);
    setConsented(false);
    setDispatchMode('immediate');
    setScheduledDate('');
    setIsFromDatabase(false);
    onOpenChange(false);
  };

  // Day toggle
  const toggleDay = (day: string) => {
    setCallingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  // Add holiday
  const handleAddHoliday = () => {
    if (!holidayInput) return;
    if (!holidays.includes(holidayInput)) {
      setHolidays([...holidays, holidayInput]);
    }
    setHolidayInput('');
  };

  // Add Single Contact
  const handleAddSingleContact = () => {
    const raw = newContactPhone.trim();
    if (!raw) {
      toast.error('Phone number is required');
      return;
    }
    const cleanPhone = normalizePhone(raw);
    const newContact: ContactItem = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      phone: cleanPhone,
      name: newContactName.trim() || 'Lead',
      variables: { ...newContactVars },
    };
    setContacts((prev) => [newContact, ...prev]);
    setNewContactPhone('');
    setNewContactName('');
    setNewContactVars({});
    setShowAddContact(false);
    toast.success('Contact added');
  };

  // Paste Contacts Parser
  const handleApplyPaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const newItems: ContactItem[] = [];

    for (const line of lines) {
      // Split by comma, tab, or semicolon
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      const phoneCandidate = parts.find((p) => /\d{5,}/.test(p)) || parts[0];
      const nameCandidate = parts.find((p) => p !== phoneCandidate && !p.includes('@') && p.length > 0) || '';
      const emailCandidate = parts.find((p) => p.includes('@')) || '';

      if (phoneCandidate) {
        const clean = normalizePhone(phoneCandidate);
        newItems.push({
          id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          phone: clean,
          name: nameCandidate,
          variables: emailCandidate ? { email: emailCandidate } : {},
        });
      }
    }

    if (newItems.length > 0) {
      setContacts((prev) => [...newItems, ...prev]);
      toast.success(`Imported ${newItems.length} contacts`);
      setPasteText('');
      setShowPasteModal(false);
    } else {
      toast.error('No valid numbers found in pasted text');
    }
  };

  // CSV Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        if (!rows || rows.length === 0) {
          toast.error('CSV file appears to be empty');
          return;
        }

        const headers = results.meta.fields || [];
        const phoneCol = headers.find((h) =>
          ['phone', 'mobile', 'number', 'phone number', 'contact', 'tel'].includes(h.toLowerCase().trim())
        ) || headers[0];

        const nameCol = headers.find((h) =>
          ['name', 'full name', 'lead', 'customer', 'customer name'].includes(h.toLowerCase().trim())
        );

        // Detect other columns as variables
        const extraCols = headers.filter((h) => h !== phoneCol && h !== nameCol);
        if (extraCols.length > 0) {
          setCustomVariables((prev) => Array.from(new Set([...prev, ...extraCols])));
        }

        const importedItems: ContactItem[] = [];
        for (const row of rows) {
          const rawPhone = row[phoneCol];
          if (!rawPhone) continue;
          const phone = normalizePhone(rawPhone);
          const name = nameCol ? row[nameCol] || '' : '';

          const vars: Record<string, string> = {};
          for (const col of extraCols) {
            if (row[col]) vars[col] = String(row[col]).trim();
          }

          importedItems.push({
            id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            phone,
            name,
            variables: vars,
          });
        }

        if (importedItems.length > 0) {
          setContacts((prev) => [...importedItems, ...prev]);
          toast.success(`Loaded ${importedItems.length} contacts from CSV`);
        } else {
          toast.error('Could not parse any contacts with valid numbers');
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        toast.error('Error parsing CSV', err.message);
      },
    });
  };

  // Download Sample CSV
  const handleDownloadSample = () => {
    const sample =
      'Phone,Name,Email\n' +
      '9876543210,Ramesh Kumar,ramesh@example.com\n' +
      '9812345678,Priya Sharma,priya@example.com\n' +
      '+919845012345,Kiran Reddy,kiran@example.com\n';

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_campaign_leads.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Sample CSV downloaded (Phone, Name, Email)');
  };

  // Load from Org Leads
  const handleApplyLoadedLeads = () => {
    const orgLeads = leadsData?.leads ?? [];
    const selected = orgLeads.filter((l) => selectedLeadIds.includes(l.id));
    if (selected.length === 0) return;

    const newItems: ContactItem[] = selected.map((l) => ({
      id: `c_${Date.now()}_${l.id}`,
      phone: normalizePhone(l.phone),
      name: l.name || 'Lead',
      variables: {
        company: l.company || '',
        purpose: l.purpose || '',
        location: l.location || '',
      },
    }));

    setContacts((prev) => [...newItems, ...prev]);
    toast.success(`Added ${newItems.length} leads from database`);
    setSelectedLeadIds([]);
    setShowLoadLeadsModal(false);
  };

  // Add Custom Variable Column
  const handleAddVariable = () => {
    const v = newVarName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v) return;
    if (!customVariables.includes(v)) {
      setCustomVariables([...customVariables, v]);
      toast.success(`Pre-call variable "${v}" added`);
    }
    setNewVarName('');
    setShowAddVarModal(false);
  };

  // Remove Contact
  const removeContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  // Submit & Launch Campaign
  const handleLaunch = async () => {
    if (!name.trim()) {
      toast.error('Campaign Name is required');
      return;
    }
    if (!employeeId) {
      toast.error('Please select an AI Employee');
      return;
    }
    if (readyContacts.length === 0) {
      toast.error('Please add at least 1 contact with a valid phone number');
      return;
    }
    if (!consented) {
      toast.error('Please confirm compliance consent before launching');
      return;
    }

    const isScheduled = dispatchMode === 'scheduled';
    if (isScheduled && !scheduledDate) {
      toast.error('Please select a scheduled start date and time');
      return;
    }

    setLaunching(true);
    try {
      // Map contacts to backend format
      const formattedContacts = readyContacts.map((c) => ({
        phone: c.phone,
        name: c.name || 'Lead',
        ...c.variables,
      }));

      const payload = {
        name: name.trim(),
        employee_id: employeeId,
        concurrency,
        call_rules: {
          calling_window: windowStart && windowEnd ? { start: windowStart, end: windowEnd } : null,
          calling_days: callingDays,
          holidays,
          skip_opted_out: skipOptedOut,
          skip_recently_called_days: skipRecentDays,
          auto_retry: autoRetry ? { enabled: true, retries: retryCount } : { enabled: false },
        },
        schedule: {
          mode: isScheduled ? 'later' : 'now',
          date: isScheduled ? scheduledDate : null,
          repeat: repeatMode.toLowerCase(),
        },
        launchImmediately: !isScheduled,
        contacts: formattedContacts,
      };

      const res = await api.post<{ success: boolean; campaign: Campaign }>('/campaigns', payload);
      toast.success(
        isScheduled ? 'Campaign scheduled successfully!' : 'Outbound campaign launched!',
        isScheduled
          ? `Queued to start dialing on ${new Date(scheduledDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
          : `${readyContacts.length} leads queued for immediate calling`
      );

      handleClose();
      if (onSuccess && res.campaign?.id) {
        onSuccess(res.campaign.id);
      } else if (res.campaign?.id) {
        navigate(`/calling/campaigns/${res.campaign.id}`);
      }
    } catch (err) {
      toast.error('Failed to launch campaign', err instanceof ApiClientError ? err.message : '');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden border shadow-2xl">
      {/* Modal Header */}
      <div className="border-b bg-muted/40 p-4 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Phone className="h-4 w-4" />
          </span>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">New outbound campaign</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          The employee you pick runs the calls from its assigned number. Every column besides phone and name is one of the
          employee&apos;s pre-call variables — the exact same fields it uses in its script and (for instant leads) its webhook.
        </p>
      </div>

      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6 scrollbar-thin text-sm">
        {/* Campaign Name & Employee */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-semibold text-foreground">Campaign Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cold Lead Feedback Q2"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold text-foreground">Employee *</Label>
            {employees.length === 0 && !empsLoading ? (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                <span>No bulk employees — create one first</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    handleClose();
                    navigate('/employees/new');
                  }}
                >
                  Create
                </Button>
              </div>
            ) : (
              <Select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="h-10"
              >
                <option value="">Select AI employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} · {emp.role} ({emp.language || emp.language_code || 'Telugu'})
                  </option>
                ))}
              </Select>
            )}
            {selectedEmp && (
              <p className="flex items-center gap-1.5 text-xs text-primary font-medium">
                <Sparkles className="h-3 w-3" /> Dialing from: <span className="underline">{assignedPhone}</span>
              </p>
            )}
          </div>
        </div>

        {/* Concurrent Call Limit */}
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-semibold text-foreground">Concurrent Call Limit</Label>
              <p className="text-xs text-muted-foreground">How many simultaneous phone calls can run concurrently.</p>
            </div>
            <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              {concurrency} {concurrency === 1 ? 'call' : 'calls'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {[1, 2, 3, 5, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setConcurrency(num)}
                className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  concurrency === num
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background hover:bg-muted text-muted-foreground'
                }`}
              >
                {num} {num === 1 ? 'call' : 'calls'}
              </button>
            ))}
          </div>
        </div>

        {/* Calling Window & Do-Not-Call */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <Label className="font-semibold text-foreground">Calling window</Label>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
              <Input
                type="time"
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                className="h-9 font-mono text-xs w-full"
              />
              <span className="text-xs text-muted-foreground font-medium text-center">to</span>
              <Input
                type="time"
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
                className="h-9 font-mono text-xs w-full"
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Only dial between these hours (campaign timezone). Leave empty to dial anytime.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border bg-card p-4 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="font-semibold text-foreground">Skip opted-out numbers</Label>
                <p className="text-xs text-muted-foreground">Never dial numbers on your do-not-call list.</p>
              </div>
              <input
                type="checkbox"
                checked={skipOptedOut}
                onChange={(e) => setSkipOptedOut(e.target.checked)}
                className="mt-1 h-4 w-4 rounded accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-1 border-t pt-3">
              <Label className="text-xs font-semibold text-foreground">Skip recently-called numbers</Label>
              <p className="text-[11px] text-muted-foreground">
                Don&apos;t dial a number any of your campaigns already called in the last N days.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={skipRecentDays}
                  onChange={(e) => setSkipRecentDays(Number(e.target.value))}
                  className="h-8 w-20 text-center font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Calling Days & Holidays */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <Label className="font-semibold text-foreground">Calling days</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ALL_DAYS.map((d) => {
                const active = callingDays.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground font-medium">{callingDaysText}</p>
          </div>

          <div className="space-y-2 rounded-xl border bg-card p-4">
            <Label className="font-semibold text-foreground">Holidays — never call on</Label>
            <div className="flex items-center gap-2 pt-1">
              <Input
                type="date"
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
                className="h-8 text-xs"
              />
              <Button type="button" size="sm" variant="outline" onClick={handleAddHoliday} className="h-8 px-3 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {holidays.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 max-h-20 overflow-y-auto">
                {holidays.map((h) => (
                  <span
                    key={h}
                    className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                  >
                    {h}
                    <button
                      type="button"
                      onClick={() => setHolidays(holidays.filter((x) => x !== h))}
                      className="hover:opacity-75"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Contact List Header & Action Toolbar */}
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="h-4 w-4 text-primary" />
              <Label className="text-base font-bold text-foreground">Contact List *</Label>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {readyContacts.length} ready
              </span>
              {contacts.length > 0 && isFromDatabase && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  ⚡ Auto-loaded from database
                </span>
              )}
              {contacts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setContacts([]);
                    setIsFromDatabase(false);
                  }}
                  className="text-[11px] text-destructive hover:underline ml-1 font-medium cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => setShowAddContact(true)}
              >
                <Plus className="h-3.5 w-3.5 text-primary" /> Add Contact
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5 text-primary" /> Import CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => setShowPasteModal(true)}
              >
                Paste
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => {
                  if (selectedLeadIds.length === 0 && leadsData?.leads) {
                    setSelectedLeadIds(leadsData.leads.map((l) => l.id));
                  }
                  setShowLoadLeadsModal(true);
                }}
              >
                Load from list
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => setShowAddVarModal(true)}
              >
                + Add Variable
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={handleDownloadSample}
                title="Download Sample CSV Template"
              >
                <Download className="h-3.5 w-3.5" /> Sample CSV
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Phones in any format — bare 10-digit numbers are treated as India (+91); spaces/dashes/brackets ignored;
            duplicates skipped on launch.
          </p>

          {/* Search bar */}
          {contacts.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts by phone, name, or variable…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          )}

          {/* Contacts Table */}
          <div className="overflow-x-auto rounded-xl border bg-background">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Phone *</th>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  {customVariables.map((v) => (
                    <th key={v} className="px-3 py-2 text-left font-semibold capitalize">
                      {v.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + customVariables.length}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      <p className="mb-2">No contacts in campaign yet.</p>
                      {(leadsData?.leads ?? []).length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const formatted = (leadsData?.leads ?? []).map((l: any) => ({
                              id: `c_${l.id || Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                              phone: normalizePhone(l.phone || ''),
                              name: l.name || '',
                              variables: {
                                company: l.company || '',
                                purpose: l.purpose || '',
                                location: l.location || '',
                                email: l.email || '',
                                ...(l.variables || {}),
                              },
                            }));
                            setContacts(formatted);
                            setIsFromDatabase(true);
                            toast.success(`Loaded ${formatted.length} contacts from database`);
                          }}
                          className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Load all {(leadsData?.leads ?? []).length} saved contacts
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredContacts.slice(0, 50).map((item) => {
                    const pInfo = formatPhoneDisplay(item.phone);
                    return (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 select-none">
                              <span>🇮🇳</span>
                              <span>+91</span>
                            </span>
                            <span className="font-semibold text-foreground tracking-wide font-mono">
                              {pInfo.number || item.phone}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{item.name || '—'}</td>
                        {customVariables.map((v) => (
                          <td key={v} className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">
                            {item.variables[v] || '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeContact(item.id)}
                            className="text-muted-foreground hover:text-destructive cursor-pointer"
                            title="Remove contact"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {contacts.length > 50 && (
            <p className="text-right text-[11px] text-muted-foreground">
              Showing first 50 of {contacts.length} contacts
            </p>
          )}
        </div>

        {/* CAMPAIGN DISPATCH MODE: Immediate Call Campaign vs Scheduled Call Campaign */}
        <div className="space-y-3 rounded-2xl border border-border/80 bg-gradient-to-b from-card to-card/50 p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <Label className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Campaign Dispatch Mode *
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose whether this campaign dials immediately or starts on a designated schedule.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors self-start sm:self-auto ${
                dispatchMode === 'immediate'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
              }`}
            >
              {dispatchMode === 'immediate' ? (
                <>
                  <Zap className="h-3.5 w-3.5" /> Immediate Call Campaign
                </>
              ) : (
                <>
                  <Calendar className="h-3.5 w-3.5" /> Scheduled Call Campaign
                </>
              )}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            {/* Option 1: Immediate Call Campaign */}
            <div
              onClick={() => setDispatchMode('immediate')}
              className={`relative flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                dispatchMode === 'immediate'
                  ? 'border-emerald-500 bg-emerald-500/5 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                  : 'border-border/80 hover:border-border hover:bg-muted/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                      dispatchMode === 'immediate'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      Immediate Call Campaign
                    </h4>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      Dial Immediately Now
                    </p>
                  </div>
                </div>

                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    dispatchMode === 'immediate'
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-muted-foreground/30'
                  }`}
                >
                  {dispatchMode === 'immediate' && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Calls launch right away across your <strong>{concurrency} concurrent channel{concurrency === 1 ? '' : 's'}</strong>.
                AI employee will begin dialing leads consecutively with zero waiting.
              </p>

              <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-3 w-3" /> Live Dialing
                </span>
                <span>·</span>
                <span>Instant progress streaming</span>
              </div>
            </div>

            {/* Option 2: Scheduled Call Campaign */}
            <div
              onClick={() => setDispatchMode('scheduled')}
              className={`relative flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                dispatchMode === 'scheduled'
                  ? 'border-indigo-500 bg-indigo-500/5 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/20'
                  : 'border-border/80 hover:border-border hover:bg-muted/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                      dispatchMode === 'scheduled'
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      Scheduled Call Campaign
                    </h4>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                      Timed Future Launch
                    </p>
                  </div>
                </div>

                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    dispatchMode === 'scheduled'
                      ? 'border-indigo-500 bg-indigo-500 text-white'
                      : 'border-muted-foreground/30'
                  }`}
                >
                  {dispatchMode === 'scheduled' && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Schedule campaign to start on a designated date & time. Automated background engine will initiate the calls
                and respect your calling window.
              </p>

              <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                  <Clock className="h-3 w-3" /> Scheduled Engine
                </span>
                <span>·</span>
                <span>Optional repeat cycles</span>
              </div>
            </div>
          </div>

          {/* Scheduled Settings Panel (revealed when 'scheduled' is active) */}
          {dispatchMode === 'scheduled' && (
            <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3.5 animate-in fade-in-50 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-500/20 pb-2.5">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-semibold text-xs">
                  <Calendar className="h-4 w-4" />
                  <span>Scheduled Launch Date & Time</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Local Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Launch Date & Time *</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledDate}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="h-9 text-xs font-mono bg-background"
                  />
                  {/* Quick preset chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 30 * 60000);
                        setScheduledDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-background border hover:bg-muted text-muted-foreground font-medium"
                    >
                      +30 mins
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 60 * 60000);
                        setScheduledDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-background border hover:bg-muted text-muted-foreground font-medium"
                    >
                      +1 hour
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(10, 0, 0, 0);
                        setScheduledDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-background border hover:bg-muted text-muted-foreground font-medium"
                    >
                      Tomorrow 10:00 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(14, 30, 0, 0);
                        setScheduledDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-background border hover:bg-muted text-muted-foreground font-medium"
                    >
                      Tomorrow 2:30 PM
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Repeat Cadence</Label>
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    {(['One-time', 'Daily', 'Weekly'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setRepeatMode(mode)}
                        className={`h-9 rounded-lg border text-xs font-semibold transition-all ${
                          repeatMode === mode
                            ? 'border-indigo-500 bg-indigo-600 text-white shadow-xs'
                            : 'border-border bg-background hover:bg-muted text-muted-foreground'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    {repeatMode === 'One-time' && 'Runs once at the designated time until all contacts are dialed.'}
                    {repeatMode === 'Daily' && 'Re-queues uncompleted leads daily at the designated time.'}
                    {repeatMode === 'Weekly' && 'Repeats every week on the scheduled day.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Auto-Retry Option */}
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="font-semibold text-foreground">Auto-Retry for Unanswered Calls</Label>
              <p className="text-xs text-muted-foreground">
                Automatically retry contacts that don&apos;t pick up (busy / no-answer / failed).
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoRetry}
              onChange={(e) => setAutoRetry(e.target.checked)}
              className="mt-1 h-4 w-4 rounded accent-primary cursor-pointer"
            />
          </div>
          {autoRetry && (
            <div className="flex items-center gap-2 pt-2 text-xs">
              <span className="text-muted-foreground">Max retry attempts:</span>
              <Select
                value={String(retryCount)}
                onChange={(e) => setRetryCount(Number(e.target.value))}
                className="h-8 w-24 text-xs"
              >
                <option value="1">1 retry</option>
                <option value="2">2 retries</option>
                <option value="3">3 retries</option>
              </Select>
            </div>
          )}
        </div>

        {/* Consent Checkbox */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
            />
            <span className="text-xs leading-relaxed text-foreground">
              I confirm these contacts have consented to receive calls from us (e.g. they submitted a form, opted in, or
              are existing customers). Calling people who haven&apos;t consented may breach telemarketing rules.
            </span>
          </label>
        </div>
      </div>

      {/* Modal Footer */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t bg-muted/40 p-3 sm:px-6 sm:py-4">
        <Button variant="ghost" onClick={handleClose} disabled={launching} className="w-full sm:w-auto h-9 text-xs sm:text-sm">
          Cancel
        </Button>
        <Button
          onClick={handleLaunch}
          loading={launching}
          disabled={
            !name.trim() ||
            !employeeId ||
            readyContacts.length === 0 ||
            !consented ||
            (dispatchMode === 'scheduled' && !scheduledDate)
          }
          className={`w-full sm:w-auto h-9 px-5 sm:px-6 font-semibold text-xs sm:text-sm gap-2 transition-all shadow-sm ${
            dispatchMode === 'immediate'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {dispatchMode === 'immediate' ? (
            <>
              <Zap className="h-4 w-4" />
              Launch Immediate Campaign ({readyContacts.length} Contacts)
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4" />
              Schedule Campaign ({readyContacts.length} Contacts)
            </>
          )}
        </Button>
      </div>

      {/* Sub-Dialog 1: Add Single Contact */}
      {showAddContact && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">Add Contact</h3>
              <button onClick={() => setShowAddContact(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-xs font-semibold text-foreground">Phone Number *</Label>
                <div className="mt-1 flex rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary shadow-xs">
                  <div className="flex items-center gap-1 bg-muted/80 px-2.5 border-r border-border text-xs font-mono font-bold text-foreground select-none shrink-0">
                    <span className="text-sm">🇮🇳</span> +91
                  </div>
                  <Input
                    value={newContactPhone.replace(/^\+91/, '').trim()}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d+]/g, '');
                      setNewContactPhone(raw.startsWith('+91') ? raw : `+91${raw}`);
                    }}
                    placeholder="98765 43210"
                    className="h-8 border-0 focus-visible:ring-0 text-xs font-mono shadow-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Bare 10-digit numbers automatically convert to India (+91) format.
                </p>
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="e.g. Suresh Varma"
                  className="h-8 text-xs mt-1"
                />
              </div>
              {customVariables.map((v) => (
                <div key={v}>
                  <Label className="text-xs capitalize">{v.replace(/_/g, ' ')}</Label>
                  <Input
                    value={newContactVars[v] || ''}
                    onChange={(e) => setNewContactVars({ ...newContactVars, [v]: e.target.value })}
                    placeholder={`Enter ${v}`}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setShowAddContact(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddSingleContact}>
                Add to List
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog 2: Paste Numbers */}
      {showPasteModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">Paste Contacts</h3>
              <button onClick={() => setShowPasteModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste contacts one per line. Formats supported: <code>Phone, Name, Email</code> or just <code>Phone</code>.
            </p>
            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="9876543210, Ramesh Kumar, ramesh@example.com&#10;9812345678, Priya Sharma, priya@example.com&#10;+919845012345, Kiran Reddy, kiran@example.com"
              className="w-full rounded-md border bg-background p-3 font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-primary"
            />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setShowPasteModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleApplyPaste}>
                Process & Import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog 3: Load from Existing Leads */}
      {showLoadLeadsModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">Load from Saved Leads</h3>
              <button onClick={() => setShowLoadLeadsModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Select leads already present in your organization CRM to add to this campaign.
            </p>
            <div className="max-h-60 overflow-y-auto divide-y rounded-lg border">
              {(leadsData?.leads ?? []).length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">No existing leads found</p>
              ) : (
                (leadsData?.leads ?? []).map((lead) => {
                  const isChecked = selectedLeadIds.includes(lead.id);
                  return (
                    <label
                      key={lead.id}
                      className="flex items-center justify-between p-2.5 hover:bg-muted/40 text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedLeadIds((prev) =>
                              isChecked ? prev.filter((id) => id !== lead.id) : [...prev, lead.id]
                            );
                          }}
                          className="h-3.5 w-3.5 rounded accent-primary"
                        />
                        <div>
                          <p className="font-medium text-foreground">{lead.name || 'Lead'}</p>
                          <p className="text-muted-foreground font-mono">{lead.phone}</p>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{lead.company || lead.purpose || '—'}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  const allIds = (leadsData?.leads ?? []).map((l) => l.id);
                  setSelectedLeadIds(selectedLeadIds.length === allIds.length ? [] : allIds);
                }}
              >
                Toggle All
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowLoadLeadsModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleApplyLoadedLeads} disabled={selectedLeadIds.length === 0}>
                  Add Selected ({selectedLeadIds.length})
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog 4: Add Variable */}
      {showAddVarModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-xs rounded-xl border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">Add Pre-call Variable</h3>
              <button onClick={() => setShowAddVarModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add a column for custom script variables (e.g. `order_id`, `balance`, `product_name`).
            </p>
            <Input
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              placeholder="e.g. order_id"
              className="h-8 text-xs font-mono"
            />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button size="sm" variant="ghost" onClick={() => setShowAddVarModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddVariable}>
                Add Variable
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
