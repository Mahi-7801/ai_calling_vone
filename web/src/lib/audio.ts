import { authStore } from './api';

export const isRemoteUrl = (url: string) => /^https?:\/\//i.test(url);

/**
 * Audio samples for cloned voices are served from an authenticated API route,
 * so we must fetch them with the Bearer token and hand back a blob: URL.
 * data: URLs pass through untouched.
 */
export async function fetchAudioObjectUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  const headers: Record<string, string> = {};
  const token = authStore.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load audio (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function triggerAudioDownload(objectUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function slugifyFileName(name: string, fallback = 'voice') {
  const slug = String(name || '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return slug || fallback;
}
