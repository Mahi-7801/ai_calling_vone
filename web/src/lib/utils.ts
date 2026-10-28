import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeAgo(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function formatCurrencyINR(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

export function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length > 10 && !digits.startsWith('+')) return `+${digits}`;
  return digits;
}

export function formatPhoneDisplay(phone?: string | null): { countryCode: string; number: string; formatted: string; isIndian: boolean } {
  if (!phone) return { countryCode: '+91', number: '', formatted: '—', isIndian: true };
  const clean = String(phone).trim();
  const digits = clean.replace(/\D/g, '');

  if (clean.startsWith('+91') || digits.length === 10 || (digits.length === 11 && digits.startsWith('0')) || (digits.length === 12 && digits.startsWith('91'))) {
    let mainDigits = digits;
    if (digits.length === 12 && digits.startsWith('91')) mainDigits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) mainDigits = digits.slice(1);
    
    if (mainDigits.length === 10) {
      return {
        countryCode: '+91',
        number: `${mainDigits.slice(0, 5)} ${mainDigits.slice(5)}`,
        formatted: `+91 ${mainDigits.slice(0, 5)} ${mainDigits.slice(5)}`,
        isIndian: true,
      };
    }
    return { countryCode: '+91', number: mainDigits, formatted: `+91 ${mainDigits}`, isIndian: true };
  }

  return { countryCode: '', number: clean, formatted: clean, isIndian: false };
}

export function initials(name?: string | null): string {
  if (!name) return 'AI';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function titleCase(value?: string | null): string {
  if (!value) return '';
  return value
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatCredits(n: number): string {
  const v = Number(n || 0);
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v));
}