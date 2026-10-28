import { createClient } from '@insforge/sdk';

// InsForge client for the Vone AI Calling Platform
// Credentials are read from VITE_ env vars (safe for frontend)
const insforgeUrl = import.meta.env.VITE_INSFORGE_URL as string;
const insforgeAnonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string;

if (!insforgeUrl || !insforgeAnonKey) {
  console.warn('[InsForge] VITE_INSFORGE_URL or VITE_INSFORGE_ANON_KEY not set. InsForge features will be disabled.');
}

export const insforge = createClient({
  baseUrl: insforgeUrl || '',
  anonKey: insforgeAnonKey || '',
});

export default insforge;
