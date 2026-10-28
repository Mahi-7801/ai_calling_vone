const { VoBizProvider } = require('../providers/telephony/vobiz');
const config = require('../config/env');

/**
 * The app name registered with the carrier. VoBiz accepts only letters, digits,
 * "-" and "_" here, so the org name cannot be interpolated.
 */
const APP_NAME = 'telugu_ai_calling_answer';

/**
 * The publicly reachable base URL the carrier must call back on.
 *
 * The carrier cannot reach localhost, so an absent or unusable PUBLIC_WEBHOOK_URL
 * is a hard failure rather than a silently unreachable URL - that was the
 * reason inbound never worked when it was set by hand in the console.
 */
function resolvePublicBaseUrl() {
  const configured = (config.tunnelPublicUrl || process.env.PUBLIC_WEBHOOK_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return null;
  if (!/^https?:\/\//i.test(configured)) return null;
  if (/localhost|127\.0\.0\.1/i.test(configured)) return null;
  return configured;
}

function answerUrlFor(base) {
  return `${base}/api/telephony/inbound`;
}

/**
 * Make sure a VoBiz application exists whose answer URL points at /inbound.
 *
 * Idempotent: it lists first and reuses an existing application with the right
 * answer URL, so restarting the server does not pile up duplicate applications.
 * Returns null when there is no usable public URL - inbound cannot be registered
 * in that state, and saying so is more useful than registering a dead URL.
 */
async function ensureInboundApplication(vobiz) {
  const base = resolvePublicBaseUrl();
  if (!base) {
    return { ok: false, reason: 'NO_PUBLIC_URL', message: 'PUBLIC_WEBHOOK_URL is not set to a public https URL, so VoBiz cannot be given a reachable answer URL.' };
  }

  const answerUrl = answerUrlFor(base);

  let existing = [];
  try {
    existing = (await vobiz.listApplications()).objects || [];
  } catch (err) {
    // Listing is not always available; fall through and try to create.
    console.warn(`[inbound:provision] Could not list applications: ${err.message}`);
  }

  const match = existing.find((a) => a.answerUrl === answerUrl && a.enabled !== false);
  if (match?.appId) {
    return { ok: true, appId: match.appId, answerUrl, reused: true };
  }

  const created = await vobiz.createApplication({
    appName: APP_NAME,
    answerUrl,
    answerMethod: 'POST',
    hangupUrl: `${base}/api/telephony/inbound`,
    hangupMethod: 'POST',
    defaultNumberApp: true,
    enabled: true,
    applicationType: 'XML',
  });

  if (!created.appId) {
    return { ok: false, reason: 'NO_APP_ID', message: 'VoBiz accepted the application but returned no app_id.' };
  }
  return { ok: true, appId: created.appId, answerUrl, reused: false };
}

/**
 * Register one number for inbound calling: make sure the application exists,
 * then attach the number to it.
 *
 * Called after a number is purchased or assigned. Every failure is returned
 * rather than thrown, because failing to wire inbound must not lose the number
 * the customer just paid for - the number is still usable for outbound.
 */
async function provisionInboundForNumber(e164) {
  let vobiz;
  try {
    vobiz = new VoBizProvider();
  } catch (err) {
    return { ok: false, reason: 'VOBIZ_NOT_CONFIGURED', message: err.message };
  }

  try {
    const app = await ensureInboundApplication(vobiz);
    if (!app.ok) return app;

    const attached = await vobiz.attachNumberToApplication(app.appId, e164);
    return { ok: true, appId: app.appId, answerUrl: app.answerUrl, number: e164, attached: attached.message };
  } catch (err) {
    return { ok: false, reason: 'ATTACH_FAILED', message: err.message, appId: null };
  }
}

/**
 * Whether a number currently has inbound wired up, for display in the UI.
 */
async function getInboundStatus(e164) {
  try {
    const vobiz = new VoBizProvider();
    const base = resolvePublicBaseUrl();
    const apps = (await vobiz.listApplications()).objects || [];
    const answerUrl = base ? answerUrlFor(base) : null;
    const app = apps.find((a) => a.answerUrl === answerUrl) || apps[0] || null;
    return {
      publicUrlConfigured: Boolean(base),
      application: app
        ? { appId: app.appId, appName: app.appName, answerUrl: app.answerUrl, enabled: app.enabled }
        : null,
      numbers: e164 ? { number: e164, applicationId: null } : null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  APP_NAME,
  ensureInboundApplication,
  provisionInboundForNumber,
  getInboundStatus,
  resolvePublicBaseUrl,
};
