import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  Users,
  Plus,
  Upload,
  Download,
  Search,
  Trash2,
  Phone,
  PhoneCall,
  Megaphone,
  Copy,
  Edit,
  Clipboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useLeads, useEmployees } from '@/hooks/queries';
import { formatDate, formatPhoneDisplay } from '@/lib/utils';
import type { Lead } from '@/types';

interface ContactListManagerProps {
  onLaunchCampaign?: (selectedContacts?: Lead[]) => void;
  showCampaignButton?: boolean;
}

export function ContactListManager({
  onLaunchCampaign,
  showCampaignButton = true,
}: ContactListManagerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: leadsData, isLoading, refetch } = useLeads({ limit: 500 });
  const { data: empData } = useEmployees();

  const leads: Lead[] = leadsData?.leads ?? [];

  // Table selection & search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [customVariables, setCustomVariables] = useState<string[]>([]);

  // Modals state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showAddVarModal, setShowAddVarModal] = useState(false);
  const [showQuickCallModal, setShowQuickCallModal] = useState<Lead | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Add Single Contact Form State
  const [formData, setFormData] = useState({
    phone: '',
    name: '',
    company: '',
    purpose: '',
    location: '',
    email: '',
    custom_message: '',
  });

  // Paste Text State
  const [pasteText, setPasteText] = useState('');
  const [newVarName, setNewVarName] = useState('');

  // CSV Import Drag/Drop State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    phone: '',
    name: '',
    company: '',
    purpose: '',
    location: '',
    email: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Call State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isCalling, setIsCalling] = useState(false);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads;
    const q = searchQuery.toLowerCase();
    return leads.filter((l) =>
      (l.phone && l.phone.toLowerCase().includes(q)) ||
      (l.name && l.name.toLowerCase().includes(q)) ||
      (l.company && l.company.toLowerCase().includes(q)) ||
      (l.purpose && l.purpose.toLowerCase().includes(q)) ||
      (l.location && l.location.toLowerCase().includes(q))
    );
  }, [leads, searchQuery]);

  // Handle Download Sample CSV
  const handleDownloadSample = () => {
    const sample =
      'Phone,Name,Email\n' +
      '9876543210,Ramesh Kumar,ramesh@example.com\n' +
      '9812345678,Priya Sharma,priya@apex.com\n' +
      '+919845012345,Kiran Reddy,kiran@retail.in\n' +
      '09890123456,Suresh Varma,suresh@builders.com\n';

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_contacts.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Sample CSV template downloaded');
  };

  // Add / Edit Single Contact
  const handleSaveContact = async () => {
    if (!formData.phone.trim()) {
      toast.error('Phone number is required');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingLead) {
        await api.put(`/leads/${editingLead.id}`, formData);
        toast.success('Contact updated');
      } else {
        await api.post('/leads', formData);
        toast.success('Contact added to list');
      }
      setShowAddModal(false);
      setEditingLead(null);
      setFormData({ phone: '', name: '', company: '', purpose: '', location: '', email: '', custom_message: '' });
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Paste handler
  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    setIsSubmitting(true);
    try {
      const lines = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parsedContacts: any[] = [];

      for (const line of lines) {
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        if (parts.length >= 1) {
          const phone = parts[0];
          const name = parts[1] || 'Lead';
          const email = parts[2] || '';
          parsedContacts.push({ phone, name, email });
        }
      }

      if (parsedContacts.length === 0) {
        toast.error('No valid contact lines found');
        return;
      }

      const res = await api.post<{ success: boolean; imported: number; skipped: number }>(
        '/leads/import',
        { contacts: parsedContacts }
      );
      toast.success(
        `Imported ${res.imported} contacts!`,
        res.skipped > 0 ? `${res.skipped} duplicates or invalid rows skipped` : undefined
      );
      setPasteText('');
      setShowPasteModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import pasted contacts');
    } finally {
      setIsSubmitting(false);
    }
  };

  // CSV File Upload & Parsing
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      preview: 5,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setImportHeaders(headers);
        setImportPreview(results.data);

        // Auto map columns to Phone, Name, Email
        const mapping: Record<string, string> = {
          phone: '',
          name: '',
          email: '',
        };

        headers.forEach((h) => {
          const lower = h.toLowerCase().trim();
          if (lower.includes('phone') || lower.includes('mobile') || lower.includes('number') || lower.includes('contact')) {
            if (!mapping.phone) mapping.phone = h;
          } else if (lower.includes('name') || lower.includes('customer') || lower.includes('lead')) {
            if (!mapping.name) mapping.name = h;
          } else if (lower.includes('email') || lower.includes('mail')) {
            if (!mapping.email) mapping.email = h;
          }
        });

        setColumnMapping(mapping);
        setShowImportModal(true);
      },
      error: () => {
        toast.error('Failed to parse CSV file');
      },
    });

    if (e.target) e.target.value = '';
  };

  // Execute CSV Import
  const handleConfirmCsvImport = async () => {
    if (!importFile) return;
    setIsSubmitting(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', importFile);
      formDataUpload.append('mapping', JSON.stringify(columnMapping));

      const res = await api.post<{ success: boolean; imported: number; skipped: number }>(
        '/leads/import',
        formDataUpload
      );
      toast.success(
        `Imported ${res.imported} contacts!`,
        res.skipped > 0 ? `${res.skipped} duplicates or invalid rows skipped` : undefined
      );
      setShowImportModal(false);
      setImportFile(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'CSV Import failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} selected contacts?`)) return;
    try {
      await api.post('/leads/bulk-delete', { ids: selectedIds });
      toast.success(`Deleted ${selectedIds.length} contacts`);
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete contacts');
    }
  };

  // Quick Call
  const handleTriggerQuickCall = async () => {
    if (!showQuickCallModal) return;
    const empId = selectedEmployeeId || (empData?.employees?.[0]?.id ? String(empData.employees[0].id) : '3');
    setIsCalling(true);
    try {
      await api.post('/calls/instant', {
        employee_id: empId,
        phone: showQuickCallModal.phone,
        customer_name: showQuickCallModal.name || 'Contact',
        purpose: showQuickCallModal.purpose || 'Direct Contact Call',
      });
      toast.success(`Dialing ${showQuickCallModal.phone}... Check call status`);
      setShowQuickCallModal(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to place call');
    } finally {
      setIsCalling(false);
    }
  };

  // Add Variable Column
  const handleAddVariable = () => {
    const v = newVarName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v) return;
    if (!customVariables.includes(v)) {
      setCustomVariables([...customVariables, v]);
      toast.success(`Column variable "${v}" added`);
    }
    setNewVarName('');
    setShowAddVarModal(false);
  };

  const isAllSelected = filteredLeads.length > 0 && selectedIds.length === filteredLeads.length;

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-3.5 sm:p-5 shadow-xs">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm sm:text-base font-bold text-foreground">Contact List *</h2>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {leads.length} ready
          </span>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              setEditingLead(null);
              setFormData({ phone: '', name: '', company: '', purpose: '', location: '', email: '', custom_message: '' });
              setShowAddModal(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 text-primary" /> Add Contact
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 text-primary" /> Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelect}
          />

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowPasteModal(true)}
          >
            <Clipboard className="h-3.5 w-3.5 text-muted-foreground" /> Paste
          </Button>

          {showCampaignButton && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5 font-medium"
              onClick={() => {
                const contactsToPass = selectedIds.length > 0
                  ? leads.filter((l) => selectedIds.includes(l.id))
                  : leads;
                if (contactsToPass.length === 0) {
                  toast.error('No contacts available to load. Add or import contacts first.');
                  return;
                }
                toast.success(`Loading ${contactsToPass.length} contact${contactsToPass.length === 1 ? '' : 's'} into campaign`);
                if (onLaunchCampaign) onLaunchCampaign(contactsToPass);
                else navigate('/calling/campaigns');
              }}
            >
              <Megaphone className="h-3.5 w-3.5" /> Load in campaign {selectedIds.length > 0 ? `(${selectedIds.length})` : leads.length > 0 ? `(${leads.length})` : ''}
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowAddVarModal(true)}
          >
            + Add Variable
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={handleDownloadSample}
            title="Download Sample CSV Template"
          >
            <Download className="h-3.5 w-3.5" /> Sample CSV
          </Button>
        </div>
      </div>

      {/* Indian Number & CSV Guidance Card */}
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-background to-primary/5 p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background border border-emerald-500/30 shadow-xs shrink-0 text-lg select-none">
            🇮🇳
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-bold text-foreground">
                Indian Mobile Numbers (+91) Supported
              </h4>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                Auto-Format Active
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Standard 10-digit mobile numbers (e.g. <strong className="text-foreground font-mono">9876543210</strong>) or with <strong className="text-foreground font-mono">+91</strong> / <strong className="text-foreground font-mono">0</strong>. Spaces, hyphens, and brackets are cleaned automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg border">
            <span>CSV Format:</span>
            <span className="font-mono font-semibold text-foreground">Phone, Name, Email</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5 font-semibold"
            onClick={handleDownloadSample}
          >
            <Download className="h-3.5 w-3.5" /> Sample CSV
          </Button>
        </div>
      </div>

      {/* Search & Bulk Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts by phone, name, or email…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 bg-muted/60 px-3 py-1 rounded-lg text-xs">
            <span className="font-semibold text-foreground">{selectedIds.length} selected</span>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="h-7 text-xs px-2 gap-1">
              <Trash2 className="h-3 w-3" /> Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Contacts Table */}
      <div className="overflow-x-auto rounded-xl border border-border/60 bg-background">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="w-9 px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={() => {
                    if (isAllSelected) setSelectedIds([]);
                    else setSelectedIds(filteredLeads.map((l) => l.id));
                  }}
                  className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-semibold text-foreground">Phone *</th>
              <th className="px-3 py-2.5 text-left font-semibold text-foreground">Name</th>
              <th className="px-3 py-2.5 text-left font-semibold text-foreground">Email</th>
              {customVariables.map((v) => (
                <th key={v} className="px-3 py-2.5 text-left font-semibold capitalize text-foreground">
                  {v}
                </th>
              ))}
              <th className="px-3 py-2.5 text-left font-semibold text-foreground">Added</th>
              <th className="px-3 py-2.5 text-right font-semibold text-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {isLoading ? (
              <tr>
                <td colSpan={5 + customVariables.length} className="p-8 text-center">
                  <TableSkeleton rows={4} cols={6} />
                </td>
              </tr>
            ) : filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={5 + customVariables.length} className="p-10 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center justify-center space-y-3">
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-primary/10 to-primary/5 border border-primary/20 shadow-xs">
                      <Users className="h-7 w-7 text-primary" />
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border shadow-xs text-[11px] select-none">
                        🇮🇳
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        No contacts yet in your list
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                        Upload your CSV with <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold">Phone, Name, Email</code>, copy-paste numbers, or add single contacts manually.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 text-xs gap-1.5 font-semibold shadow-xs"
                      >
                        <Upload className="h-3.5 w-3.5" /> Import CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPasteModal(true)}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Clipboard className="h-3.5 w-3.5 text-muted-foreground" /> Paste Numbers
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingLead(null);
                          setFormData({ phone: '', name: '', company: '', purpose: '', location: '', email: '', custom_message: '' });
                          setShowAddModal(true);
                        }}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5 text-primary" /> Add Contact
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleDownloadSample}
                        className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" /> Sample CSV
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const isChecked = selectedIds.includes(lead.id);
                const pInfo = formatPhoneDisplay(lead.phone);
                return (
                  <tr
                    key={lead.id}
                    className={`hover:bg-muted/30 transition-colors ${isChecked ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedIds((prev) =>
                            isChecked ? prev.filter((id) => id !== lead.id) : [...prev, lead.id]
                          );
                        }}
                        className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 select-none">
                          <span>🇮🇳</span>
                          <span>+91</span>
                        </span>
                        <span className="font-semibold text-foreground tracking-wide font-mono">
                          {pInfo.number || lead.phone}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(lead.phone);
                            toast.success('Phone copied');
                          }}
                          className="text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 p-0.5"
                          title="Copy number"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{lead.name || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{lead.email || '—'}</td>
                    {customVariables.map((v) => (
                      <td key={v} className="px-3 py-2.5 text-muted-foreground">
                        —
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {lead.created_at ? formatDate(lead.created_at) : 'Recent'}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowQuickCallModal(lead)}
                          className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                          title="Call this contact"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingLead(lead);
                            setFormData({
                              phone: lead.phone,
                              name: lead.name || '',
                              company: lead.company || '',
                              purpose: lead.purpose || '',
                              location: lead.location || '',
                              email: lead.email || '',
                              custom_message: lead.custom_message || '',
                            });
                            setShowAddModal(true);
                          }}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="Edit contact"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm(`Delete contact ${lead.phone}?`)) return;
                            try {
                              await api.del(`/leads/${lead.id}`);
                              toast.success('Contact deleted');
                              refetch();
                            } catch (err: any) {
                              toast.error(err?.message || 'Failed to delete contact');
                            }
                          }}
                          className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          title="Delete contact"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <p>
          Showing <span className="font-semibold text-foreground">{filteredLeads.length}</span> of <span className="font-semibold text-foreground">{leads.length}</span> contacts in database
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="text-xs">🇮🇳</span>
          <span>Indian numbers (+91) formatted automatically</span>
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT CONTACT */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLead ? 'Edit Contact' : 'Add New Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2 text-xs">
            <div>
              <Label className="text-xs font-semibold text-foreground">Phone Number *</Label>
              <div className="mt-1 flex rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary shadow-xs">
                <div className="flex items-center gap-1 bg-muted/80 px-2.5 border-r border-border text-xs font-mono font-bold text-foreground select-none shrink-0">
                  <span className="text-sm">🇮🇳</span> +91
                </div>
                <Input
                  value={formData.phone.replace(/^\+91/, '').trim()}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d+]/g, '');
                    setFormData({ ...formData, phone: raw.startsWith('+91') ? raw : `+91${raw}` });
                  }}
                  placeholder="98765 43210"
                  className="h-9 border-0 focus-visible:ring-0 text-xs font-mono shadow-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enter 10-digit Indian mobile number. +91 country prefix applied automatically.
              </p>
            </div>

            <div>
              <Label className="text-xs font-semibold">Contact / Customer Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Ramesh Kumar"
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Email Address</Label>
              <Input
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="e.g. user@domain.com"
                className="mt-1 h-9 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveContact} disabled={isSubmitting}>
              {editingLead ? 'Update Contact' : 'Save Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: PASTE CONTACTS */}
      <Dialog open={showPasteModal} onOpenChange={setShowPasteModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste Contacts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste phone numbers line-by-line, or comma/tab separated (<span className="font-semibold text-foreground">Phone, Name, Email</span>):
              <br />
              <code className="text-primary font-mono text-[11px] block mt-1.5 bg-muted p-2 rounded">
                9876543210, Ramesh Kumar, ramesh@example.com<br />
                +919812345678, Priya Sharma, priya@example.com<br />
                9845012345, Kiran Reddy
              </code>
            </p>
            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste phone numbers and contact details here..."
              className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono"
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setShowPasteModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handlePasteSubmit} disabled={!pasteText.trim() || isSubmitting}>
              Import Pasted Contacts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: CSV IMPORT & MAPPING */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import Contacts from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-xs">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="font-semibold text-foreground">File: {importFile?.name}</p>
              <p className="text-muted-foreground mt-0.5">
                Found {importHeaders.length} columns in file. Please confirm column mapping:
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Phone Column * (Required)</Label>
                <select
                  value={columnMapping.phone}
                  onChange={(e) => setColumnMapping({ ...columnMapping, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs"
                >
                  <option value="">-- Select Column --</option>
                  {importHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Name Column</Label>
                <select
                  value={columnMapping.name}
                  onChange={(e) => setColumnMapping({ ...columnMapping, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs"
                >
                  <option value="">-- (Optional) --</option>
                  {importHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Company Column</Label>
                <select
                  value={columnMapping.company}
                  onChange={(e) => setColumnMapping({ ...columnMapping, company: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs"
                >
                  <option value="">-- (Optional) --</option>
                  {importHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Purpose / Service Column</Label>
                <select
                  value={columnMapping.purpose}
                  onChange={(e) => setColumnMapping({ ...columnMapping, purpose: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs"
                >
                  <option value="">-- (Optional) --</option>
                  {importHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview of rows */}
            {importPreview.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase">
                  Data Preview (First {importPreview.length} rows)
                </Label>
                <div className="overflow-x-auto rounded-lg border max-h-32 text-[11px]">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        {importHeaders.slice(0, 4).map((h) => (
                          <th key={h} className="p-1.5 text-left font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((row, i) => (
                        <tr key={i} className="border-t">
                          {importHeaders.slice(0, 4).map((h) => (
                            <td key={h} className="p-1.5 font-mono">
                              {String(row[h] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmCsvImport}
              disabled={!columnMapping.phone || isSubmitting}
            >
              {isSubmitting ? 'Importing...' : 'Confirm & Import All Contacts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: ADD VARIABLE */}
      <Dialog open={showAddVarModal} onOpenChange={setShowAddVarModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Pre-Call Variable</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Add a column for custom variables (like budget, property_type, discount_code) to use in AI call scripts.
            </p>
            <div>
              <Label className="text-xs font-semibold">Variable Name</Label>
              <Input
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                placeholder="e.g. budget, loan_amount"
                className="mt-1 h-9 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setShowAddVarModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddVariable} disabled={!newVarName.trim()}>
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: QUICK CALL */}
      <Dialog open={!!showQuickCallModal} onOpenChange={() => setShowQuickCallModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Instant AI Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2 text-xs">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                Calling: {showQuickCallModal?.name || 'Contact'} ({showQuickCallModal?.phone})
              </p>
              <p className="text-muted-foreground mt-0.5">
                Purpose: {showQuickCallModal?.purpose || 'Direct Contact Call'}
              </p>
            </div>

            <div>
              <Label className="text-xs font-semibold">Select AI Employee to Dial</Label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs font-medium"
              >
                {(empData?.employees ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role}) · {emp.language_code || 'Telugu'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setShowQuickCallModal(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleTriggerQuickCall}
              disabled={isCalling}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              {isCalling ? 'Initiating Call...' : 'Call Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
