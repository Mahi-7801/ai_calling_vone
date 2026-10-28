/**
 * InsForge server-side client for the Vone AI Calling Platform
 * Uses the service key (never expose to the browser).
 * @insforge/sdk is ESM-only so we use dynamic import().
 */
require('dotenv').config();

let _insforge = null;
let _loading = null;

async function getInsforge() {
  if (_insforge) return _insforge;
  if (_loading) return _loading;

  const insforgeUrl = process.env.INSFORGE_URL;
  const insforgeKey = process.env.INSFORGE_SERVICE_KEY || process.env.INSFORGE_ANON_KEY;

  if (!insforgeUrl || !insforgeKey) {
    console.warn('[InsForge] INSFORGE_URL or INSFORGE_SERVICE_KEY not set. InsForge features disabled.');
    return null;
  }

  _loading = (async () => {
    const { createClient, createAdminClient } = await import('@insforge/sdk');
    const serviceKey = process.env.INSFORGE_SERVICE_KEY || process.env.INSFORGE_API_KEY;
    if (serviceKey) {
      _insforge = createAdminClient({ baseUrl: insforgeUrl, apiKey: serviceKey });
    } else {
      _insforge = createClient({ baseUrl: insforgeUrl, anonKey: insforgeKey });
    }
    _loading = null;
    return _insforge;
  })();

  return _loading;
}

module.exports = { getInsforge };
