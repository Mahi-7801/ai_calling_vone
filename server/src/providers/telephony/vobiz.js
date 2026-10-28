const crypto = require('crypto');
const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

// =============================================================================
// Vobiz voice API
// Reference: https://vobiz.ai/docs
//
// Base URL  : https://api.vobiz.ai/api/v1
// Auth      : X-Auth-ID + X-Auth-Token headers
// Callbacks : application/x-www-form-urlencoded, HTTP 200 within 3s, retried
//             up to 3 times, so every handler here must be idempotent.
// =============================================================================

// Escape hatch for local carrier mocks / a tunnel exposed some other way.
// Off by default: a localhost answer_url always means a silent, billable call.
function allowLocalAnswerUrl() {
  return String(process.env.ALLOW_LOCAL_ANSWER_URL || '').toLowerCase() === 'true';
}

// hangup_source enum from the Call object.
const HANGUP_SOURCES = new Set(['Caller', 'Callee', 'Vobiz', 'API Request', 'Answer XML', 'Error', 'Unknown']);

// hangup_cause values the CDR docs call "common".
const CDR_HANGUP_CAUSES = [
  'NORMAL_CLEARING', 'USER_BUSY', 'NO_ANSWER', 'ORIGINATOR_CANCEL', 'CALL_REJECTED',
  'REJECTED', 'INVALID_NUMBER', 'UNALLOCATED_NUMBER', 'SERVICE_UNAVAILABLE',
  'SERVER_ERROR', 'MEDIA_TIMEOUT', 'PROTOCOL_ERROR', 'NETWORK_OUT_OF_ORDER',
  'DESTINATION_OUT_OF_ORDER', 'NORMAL_TEMPORARY_FAILURE', 'SWITCH_CONGESTION', 'UNKNOWN',
];

// Documented machine-detection ranges. Values outside these are rejected, so
// each is clamped rather than passed through.
const AMD_RANGES = {
  machine_detection_time: [2000, 10000],
  machine_detection_initial_silence: [2000, 10000],
  machine_detection_maximum_speech_length: [1000, 6000],
  machine_detection_maximum_words: [2, 10],
  machine_detection_initial_greeting: [1000, 5000],
};

// The documented AMD profiles, offered as ready-made presets.
const AMD_PROFILES = {
  balanced: {
    machine_detection: 'true',
    machine_detection_time: 4000,
    machine_detection_initial_silence: 4000,
    machine_detection_initial_greeting: 2500,
    machine_detection_maximum_words: 5,
    machine_detection_maximum_speech_length: 4000,
  },
  accuracy: {
    machine_detection: 'hangup',
    machine_detection_time: 8000,
    machine_detection_initial_silence: 8000,
    machine_detection_initial_greeting: 3000,
    machine_detection_maximum_words: 10,
    machine_detection_maximum_speech_length: 6000,
  },
  low_latency: {
    machine_detection: 'true',
    machine_detection_time: 2500,
    machine_detection_initial_silence: 2500,
    machine_detection_initial_greeting: 1500,
    machine_detection_maximum_words: 3,
    machine_detection_maximum_speech_length: 2500,
  },
};

/**
 * Nonces seen in the last five minutes, so a replayed callback is rejected.
 * The docs state the nonces are random rather than time-based, which is exactly
 * why they must be remembered.
 */
const seenNonces = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000;

function rememberNonce(nonce) {
  const now = Date.now();
  for (const [key, ts] of seenNonces) {
    if (now - ts > NONCE_TTL_MS) seenNonces.delete(key);
  }
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, now);
  return true;
}

/**
 * The signature covers the URL and the nonce, never the body. Voice callbacks
 * are form-encoded, so hashing a JSON body can never verify.
 *
 *   V2: base64(HMAC-SHA256(authToken, baseURL + nonce))
 *   V3: base64(HMAC-SHA256(authToken, baseURL + "." + nonce))
 *
 * baseURL is the callback URL with every query parameter stripped.
 */
function computeVobizSignature(version, authToken, baseUrl, nonce) {
  const msg = version === 'v2' ? `${baseUrl}${nonce}` : `${baseUrl}.${nonce}`;
  return crypto.createHmac('sha256', authToken).update(msg).digest('base64');
}

/** Constant-time comparison; a plain === leaks the prefix length. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function stripQuery(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return String(url || '').split('?')[0];
  }
}

/**
 * The inventory endpoint is undocumented, so its `type`/`series` wording is
 * free-form. The inventory UI drives a fixed tab vocabulary, so the carrier
 * value is normalised onto it rather than passed through as an unknown string.
 */
function inventoryType(item) {
  const raw = `${item.type || ''} ${item.number_type || ''} ${item.series || ''}`.toLowerCase();
  if (raw.includes('toll')) return 'tollfree';
  if (raw.includes('mobile') || raw.includes('cell')) return 'mobile';
  if (raw.includes('shared')) return 'shared';
  if (raw.includes('national')) return 'national';
  return 'local';
}

/**
 * Only capabilities the carrier actually reports are labelled. The previous
 * `capabilities?.voice ? 'Voice' : 'Voice'` returned the same string either
 * way, which made the "Supported Features" column decorative. No capabilities
 * reported means null - the caller shows that instead of inventing "Voice".
 */
function inventoryFeatures(capabilities) {
  if (!capabilities || typeof capabilities !== 'object') return null;
  const labels = ['voice', 'sms', 'mms', 'fax']
    .filter((cap) => capabilities[cap])
    .map((cap) => `${cap.charAt(0).toUpperCase()}${cap.slice(1)}`);
  return labels.length ? labels.join(', ') : null;
}

class VoBizProvider {
  constructor() {
    this.baseUrl = (config.providers.vobiz.baseUrl || 'https://api.vobiz.ai/api/v1').replace(/\/+$/, '');
    this.authId = config.providers.vobiz.authId || '';
    this.authToken = config.providers.vobiz.authToken;
    // No default account: a hardcoded fallback id silently buys, bills and
    // releases numbers on somebody else's carrier account when our own
    // credential is missing. Match config/env.js and fail loudly instead.
    if (!this.authId || !this.authToken) {
      throw new AppError(
        'VoBiz credentials are not configured (VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN). ' +
          'Refusing to fall back to a default carrier account.',
        500,
        'VOBIZ_NOT_CONFIGURED'
      );
    }
    this.webhookSecret = config.providers.vobiz.webhookSecret;
    this.active = new Map();
    this._recent = new Map(); // `${to}:${from}` -> recent dial guard (prevents duplicate calls)
  }

  async #resolveCallerId(target) {
    // Prefer a number that can reach the destination: use an IN number when
    // calling an Indian mobile, otherwise fall back to the account's number.
    const defaultInNumber = config.providers?.vobiz?.phoneNumber || '+918065354620';
    try {
      const nums = await this.listPhoneNumbers();
      if (!nums.length) return defaultInNumber;
      const to = String(target || '');
      const needIn = /^\+91/.test(to);
      const match = needIn
        ? nums.find((n) => /^\+91/.test(n.number)) || defaultInNumber
        : nums[0]?.number || defaultInNumber;
      return typeof match === 'string' ? match : (match?.number || defaultInNumber);
    } catch {
      return defaultInNumber;
    }
  }

  /**
   * Single entry point for every documented endpoint.
   *
   * The docs are inconsistent about the error envelope: some endpoints return
   * {status, error:{code, message, details}} and others a flat {api_id, error}
   * or {error, message}. All three are parsed so a failure names the real cause.
   */
  async #request(path, options = {}) {
    if (!this.authId || !this.authToken) {
      throw new AppError('VoBiz credentials not configured in .env (VOBIZ_AUTH_ID, VOBIZ_AUTH_TOKEN)', 500, 'VOBIZ_NOT_CONFIGURED');
    }
    const fullPath = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 2;

    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(fullPath, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-ID': this.authId,
          'X-Auth-Token': this.authToken,
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      // 204 No Content is a documented success on hangup and stream stop.
      if (res.status === 204) return {};

      const text = await res.text().catch(() => '');
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }

      if (!res.ok) {
        const err = data?.error;
        const message = (err && typeof err === 'object' ? err.message : err) || data?.message || text || res.statusText;
        const code = (err && typeof err === 'object' ? err.code : null) || data?.code || `VOBIZ_HTTP_${res.status}`;
        const details = (err && typeof err === 'object' ? err.details : null) || data?.details || null;

        // The docs say to retry 429 and 503 with exponential backoff and to
        // honour Retry-After when present. `retryable` was set on the error and
        // then never consumed, so one throttle turned into a failed call.
        const retryable = [429, 500, 502, 503].includes(res.status);
        if (retryable && attempt < maxRetries) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 8000)
            : Math.min(1000 * 2 ** attempt, 8000);
          console.warn(`[vobiz] ${res.status} (${code}) on ${path}; retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // Preserve the documented status instead of collapsing everything to
        // 502 - 402 (insufficient balance) and 429 are actionable for the
        // caller and were indistinguishable from a gateway fault.
        const appError = new AppError(`VoBiz error ${res.status} (${code}): ${message}`, res.status, code);
        appError.status = res.status;
        appError.providerCode = code;
        appError.details = details;
        appError.retryable = retryable;
        throw appError;
      }

      return data ?? {};
    }
  }

  /**
   * POST /Account/{auth_id}/Call/
   *
   * Required: from, to, answer_url. answer_method is documented as optional with
   * a POST default but is listed as required by the OpenAPI block, so it is
   * always sent explicitly. `to` accepts up to 1000 destinations separated by
   * `<` - a comma is treated as part of one destination and routing fails.
   */
  async makeCall({
    to,
    from,
    employee,
    callId,
    callbackUrl = null,
    ringUrl = null,
    fallbackUrl = null,
    machineDetectionUrl = null,
    machineDetection = null,
    machineDetectionProfile = null,
    callerName = null,
    timeLimit = null,
    hangupOnRing = null,
  }) {
    const { getPublicUrl, getTunnelStatus, isTunnelAvailable } = require('../../services/tunnelService');
    // getPublicUrl() returns a full origin ("https://host"), but callbackUrl may
    // be a bare host or a full URL. Normalize to a bare host once here: the old
    // code prefixed the tunnel value with "https://" a second time and sent
    // "https://https://host/...", which VoBiz rejects with
    // "answer_url parameter is not valid" and no call is ever placed.
    const rawPublic = callbackUrl || (await getPublicUrl()) || '';
    const publicHost = String(rawPublic).replace(/^https?:\/\//, '').split('/')[0].trim();

    // The media stream for EVERY call (inbound and outbound) is fetched by the
    // carrier from answer_url, and hangup_url carries the status webhook. Both
    // must be publicly reachable. Dialling with a localhost answer_url burns
    // real per-minute money and delivers pure silence, so refuse instead.
    if (!isTunnelAvailable() && !callbackUrl && !allowLocalAnswerUrl()) {
      const t = getTunnelStatus();
      throw new AppError(
        t.rateLimited
          ? 'Cannot place calls: Cloudflare is rate limiting quick tunnels (HTTP 429), so there is no public URL for the carrier to reach. ' +
            'Outbound and inbound calls will be silent until a tunnel is available. ' +
            'Create a free named tunnel (see server/.env.example) or wait for the quota window to reset.'
          : 'Cannot place calls: no public tunnel URL is available, so the carrier cannot fetch the media stream. ' +
            'Set up a named tunnel (see server/.env.example) or set PUBLIC_WEBHOOK_URL.',
        503,
        'NO_PUBLIC_TUNNEL'
      );
    }

    // host is a bare host, so prepend the scheme exactly once.
    const serverBase = publicHost
      ? `https://${publicHost}`
      : `${config.frontendUrl.replace(/:\d+$/, ':5000')}`;
    const defaultStreamUrl = `${serverBase}/api/telephony/vobiz/stream/${encodeURIComponent(callId)}/${employee?.id || 3}`;
    const answerUrl = callbackUrl || employee?.callbackUrl || defaultStreamUrl;
    let cleanTo = String(to || '').trim().replace(/[^\d+]/g, '');
    if (/^[6-9]\d{9}$/.test(cleanTo)) {
      cleanTo = `+91${cleanTo}`;
    } else if (/^91[6-9]\d{9}$/.test(cleanTo)) {
      cleanTo = `+${cleanTo}`;
    }

    const defaultCaller = config.providers?.vobiz?.phoneNumber || '+918065354620';
    const callerId = from || (await this.#resolveCallerId(cleanTo)) || defaultCaller;

    // Prevent duplicate dials: if the same (to, from) was just called within
    // the last 10 seconds, return the existing in-flight call instead of
    // ringing the customer a second time.
    const dialKey = `${cleanTo}:${callerId}`;
    const recent = this._recent.get(dialKey);
    if (recent && Date.now() - recent.ts < 10000) {
      console.warn(`[vobiz] Suppressing duplicate dial to ${cleanTo} (last call ${Date.now() - recent.ts}ms ago)`);
      return { providerCallId: recent.providerCallId, status: 'ringing', duplicate: true, raw: recent.raw };
    }

    const payload = {
      to: cleanTo,
      from: callerId,
      answer_url: answerUrl,
      answer_method: 'POST',
      hangup_url: `${serverBase}/api/telephony/webhook`,
      hangup_method: 'POST',
    };

    if (ringUrl) {
      payload.ring_url = ringUrl;
      payload.ring_method = 'POST';
    }
    // Invoked when answer_url fails after 3 retries or a 60s timeout.
    if (fallbackUrl) {
      payload.fallback_url = fallbackUrl;
      payload.fallback_method = 'POST';
    }
    if (callerName) payload.caller_name = String(callerName).slice(0, 50);
    if (timeLimit && timeLimit > 0) payload.time_limit = Math.floor(Number(timeLimit));
    if (hangupOnRing && hangupOnRing > 0) payload.hangup_on_ring = Math.floor(Number(hangupOnRing));

    Object.assign(payload, this.#buildMachineDetection(machineDetection, machineDetectionProfile, machineDetectionUrl, serverBase));

    const data = await this.#request(`/Account/${this.authId}/Call/`, {
      method: 'POST',
      body: payload,
    });

    // request_uuid doubles as call_uuid. A response without any id is not a
    // usable call reference, so treat it as a failure rather than inventing one.
    const providerCallId = data.request_uuid || data.call_uuid || data.data?.callId;
    if (!providerCallId) {
      throw new AppError(
        `VoBiz accepted the request but returned no call id: ${JSON.stringify(data).slice(0, 200)}`,
        502,
        'VOBIZ_NO_CALL_ID'
      );
    }
    this.active.set(providerCallId, { callId, status: 'ringing', to, from: callerId });
    this._recent.set(dialKey, { ts: Date.now(), providerCallId, raw: data }); // guard against immediate re-dial
    // A 200 means accepted and queued, not answered.
    return { providerCallId, status: 'ringing', raw: data };
  }

  /**
   * Build the machine-detection parameters documented on the call endpoint.
   *
   * machine_detection is a string: "true" continues the call, "hangup" ends it.
   * Supplying machine_detection_url switches the result to the asynchronous
   * mode, where the verdict POSTs back as {Machine, IfMachine, Event,
   * CallStatus, CallUUID, ...}.
   */
  #buildMachineDetection(machineDetection, profile, machineDetectionUrl, serverBase) {
    const out = {};
    const amdEnabled = Boolean(machineDetection) || Boolean(profile);
    if (!amdEnabled) return out;

    if (profile) {
      const preset = AMD_PROFILES[profile] || AMD_PROFILES[profile.toLowerCase?.()];
      if (!preset) {
        throw new AppError(
          `Unknown machine-detection profile "${profile}". Use one of: ${Object.keys(AMD_PROFILES).join(', ')}.`,
          400,
          'VOBIZ_AMD_PROFILE_UNKNOWN'
        );
      }
      Object.assign(out, preset);
    }
    if (machineDetection) out.machine_detection = machineDetection === true ? 'true' : String(machineDetection);

    for (const [field, range] of Object.entries(AMD_RANGES)) {
      if (out[field] === undefined) continue;
      out[field] = Math.min(range[1], Math.max(range[0], Math.floor(Number(out[field]))));
    }

    if (machineDetectionUrl) {
      out.machine_detection_url = machineDetectionUrl;
      out.machine_detection_method = 'POST';
    } else if (out.machine_detection) {
      // Async mode is what makes the verdict available; without it the result
      // is only applied inline.
      out.machine_detection_url = `${serverBase}/api/telephony/webhook`;
      out.machine_detection_method = 'POST';
    }

    return out;
  }

  /**
   * Dial many destinations in ONE request.
   *
   * `to` accepts up to 1000 destinations separated by `<`. A comma is treated as
   * part of a single destination and routing fails, so the separator is
   * non-negotiable. For a bulk dial the response carries a single request_uuid
   * for the whole batch; each destination is given its own call_uuid, which
   * arrives only on the answer and hangup callbacks, so callers must correlate
   * on `To` (for outbound) until the callback lands.
   *
   * A 200 means accepted and queued, not answered.
   */
  async makeBulkCall({
    to,
    from,
    employee,
    campaignId = null,
    callbackUrl = null,
    ringUrl = null,
    hangupUrl = null,
    fallbackUrl = null,
    machineDetection = null,
    machineDetectionProfile = null,
    callerName = null,
    timeLimit = null,
    hangupOnRing = null,
  }) {
    const destinations = (Array.isArray(to) ? to : [to]).map((n) => String(n || '').trim()).filter(Boolean);
    if (destinations.length === 0) {
      throw new AppError('makeBulkCall requires at least one destination.', 400, 'VOBIZ_BULK_EMPTY');
    }
    if (destinations.length > 1000) {
      throw new AppError(
        `VoBiz accepts at most 1000 destinations per bulk request; received ${destinations.length}.`,
        400,
        'VOBIZ_BULK_TOO_LARGE'
      );
    }

    const { getPublicUrl, getTunnelStatus, isTunnelAvailable } = require('../../services/tunnelService');
    const rawPublic = callbackUrl || (await getPublicUrl()) || '';
    const publicHost = String(rawPublic).replace(/^https?:\/\//, '').split('/')[0].trim();
    if (!isTunnelAvailable() && !callbackUrl && !allowLocalAnswerUrl()) {
      const t = getTunnelStatus();
      throw new AppError(
        'Cannot place calls: no public tunnel URL is available, so the carrier cannot fetch the media stream. ' +
          'Set up a named tunnel (see server/.env.example) or set PUBLIC_WEBHOOK_URL.',
        503,
        'NO_PUBLIC_TUNNEL'
      );
    }

    const serverBase = publicHost ? `https://${publicHost}` : `${config.frontendUrl.replace(/:\d+$/, ':5000')}`;

    // One shared answer_url serves the whole batch, so the per-call context is
    // resolved from the `To` field the carrier echoes back on the callback.
    const answerUrl = callbackUrl
      || employee?.callbackUrl
      || (campaignId
        ? `${serverBase}/api/telephony/vobiz/bulk-stream/${encodeURIComponent(campaignId)}`
        : `${serverBase}/api/telephony/vobiz/stream/bulk/${employee?.id || 3}`);

    const defaultBulkCaller = config.providers?.vobiz?.phoneNumber || '+918065354620';
    const callerId = from || (await this.#resolveCallerId(destinations[0])) || defaultBulkCaller;

    const payload = {
      to: destinations.join('<'),
      from: callerId,
      answer_url: answerUrl,
      answer_method: 'POST',
      hangup_url: hangupUrl || `${serverBase}/api/telephony/webhook`,
      hangup_method: 'POST',
    };
    if (ringUrl) {
      payload.ring_url = ringUrl;
      payload.ring_method = 'POST';
    }
    if (fallbackUrl) {
      payload.fallback_url = fallbackUrl;
      payload.fallback_method = 'POST';
    }
    if (callerName) payload.caller_name = String(callerName).slice(0, 50);
    if (timeLimit && timeLimit > 0) payload.time_limit = Math.floor(Number(timeLimit));
    if (hangupOnRing && hangupOnRing > 0) payload.hangup_on_ring = Math.floor(Number(hangupOnRing));

    Object.assign(payload, this.#buildMachineDetection(machineDetection, machineDetectionProfile, null, serverBase));

    const data = await this.#request(`/Account/${this.authId}/Call/`, { method: 'POST', body: payload });
    const requestUuid = data.request_uuid || data.call_uuid || null;
    if (!requestUuid) {
      throw new AppError(
        `VoBiz accepted the bulk request but returned no request_uuid: ${JSON.stringify(data).slice(0, 200)}`,
        502,
        'VOBIZ_NO_CALL_ID'
      );
    }

    return {
      requestUuid,
      count: destinations.length,
      destinations,
      callerId,
      answerUrl,
      // Each destination is queued under its own call_uuid, delivered on its
      // callbacks. Until then a batch row is matched on the To field.
      raw: data,
    };
  }

  /**
   * DELETE /Account/{auth_id}/Call/{call_uuid}/ - documented as 204 No Content.
   * The resulting CDR carries hangup_source "API Request" and cause code 16.
   *
   * There is no documented leg-selection parameter, so the leg is not chosen
   * here; the previous /call/disconnect fallback was not a documented endpoint.
   */
  async hangupCall(providerCallId) {
    try {
      await this.#request(`/Account/${this.authId}/Call/${providerCallId}/`, { method: 'DELETE' });
    } catch (err) {
      // A call that already completed cannot be hung up; that is not an error.
      if (err.status && err.status !== 404) {
        console.warn(`[vobiz] hangup ${providerCallId} failed: ${err.message}`);
      }
    }
    this.active.delete(providerCallId);
    return { status: 'hungup' };
  }

  /**
   * GET /Account/{auth_id}/Call/{call_uuid}/?status=live
   *
   * Every field on this response is snake_case: call_status, call_uuid, from,
   * to, direction, session_start, stir_attestation, stir_verification. The old
   * parser read `status` and `call_state`, which never exist, so live calls
   * always reported "unknown".
   */
  async getCallStatus(providerCallId) {
    try {
      const data = await this.#request(`/Account/${this.authId}/Call/${providerCallId}/?status=live`);
      const rawStatus = String(data.call_status || data.status || 'unknown').toLowerCase();
      const statusMap = {
        ringing: 'ringing',
        'in-ring': 'ringing',
        'in-progress': 'connected',
        completed: 'completed',
        busy: 'busy',
        'no-answer': 'no_answer',
        failed: 'failed',
        canceled: 'failed',
      };
      return {
        status: statusMap[rawStatus] || rawStatus,
        rawStatus,
        duration: 0, // A live call has no duration yet; the CDR carries it.
        direction: data.direction || null,
        from: data.from || null,
        to: data.to || null,
        sessionStart: data.session_start || null,
        stirAttestation: data.stir_attestation || null,
        stirVerification: data.stir_verification || null,
        recordingUrl: null,
        raw: data,
      };
    } catch (err) {
      return { status: 'unknown', duration: 0, recordingUrl: null, error: err.message, raw: null };
    }
  }

  /** GET /api/v1/auth/me - the documented account/credential endpoint. */
  async getAccountInfo() {
    try {
      const data = await this.#request('/auth/me');
      return {
        authId: data.auth_id || this.authId,
        accountId: data.auth_id || this.authId,
        name: data.name || null,
        company: data.company || null,
        email: data.email || null,
        phone: data.phone || null,
        country: data.country || null,
        timezone: data.timezone || null,
        accountType: data.account_type || null,
        // postpaid is the authoritative billing-model flag.
        postpaid: data.postpaid === true,
        isTrial: data.is_trial_account === true,
        enabled: data.enabled === true,
        autoRecharge: data.auto_recharge === true,
        creditLimit: data.credit_limit ?? 0,
        cpsLimit: data.cps_limit ?? null,
        concurrentCallsLimit: data.concurrent_calls_limit ?? null,
        baseCpsLimit: data.base_cps_limit ?? null,
        baseConcurrentCallsLimit: data.base_concurrent_calls_limit ?? null,
        purchasedCps: data.purchased_cps ?? 0,
        purchasedConcurrentCalls: data.purchased_concurrent_calls ?? 0,
        ratePerMinute: data.pricing_tier?.rate_per_minute ?? null,
        currency: data.pricing_tier?.currency || null,
        configured: true,
        baseUrl: this.baseUrl,
        raw: data,
      };
    } catch (err) {
      return {
        authId: this.authId,
        accountId: this.authId,
        configured: Boolean(this.authId && this.authToken),
        baseUrl: this.baseUrl,
        error: err.message,
      };
    }
  }

  /**
   * GET /Account/{auth_id}/balance/{currency}
   *
   * This endpoint IS documented - the earlier comment claiming otherwise was
   * wrong, and getBalance() consequently returned null forever. Real figures
   * matter here: a fabricated balance makes the admin console look funded when
   * it is not, and the documented 402 INSUFFICIENT_BALANCE on call creation is
   * the first thing an operator needs to see coming.
   */
  async getCarrierBalance(currency = 'INR') {
    const data = await this.#request(`/Account/${this.authId}/balance/${encodeURIComponent(currency)}`);
    return {
      currency: data.currency || currency,
      balance: data.balance ?? null,
      reservedFunds: data.reserved_funds ?? null,
      promotionalBalance: data.promotional_balance ?? null,
      availableBalance: data.available_balance ?? null,
      creditLimit: data.credit_limit ?? null,
      isPostpaid: data.is_postpaid ?? null,
      creditLimitType: data.credit_limit_type ?? null,
      lowBalanceThreshold: data.low_balance_threshold ?? null,
      status: data.status ?? null,
      raw: data,
    };
  }

  /**
   * Account balance plus the account object's limits and billing mode.
   *
   * A balance lookup failure must not blank the limits, so the two are fetched
   * independently and the balance is reported as unavailable rather than zero.
   */
  async getBalance() {
    const account = await this.getAccountInfo();
    if (!account.configured || account.error) {
      return { configured: Boolean(this.authId && this.authToken), balance: null, currency: account.currency || null };
    }

    let balance = null;
    let balanceError = null;
    try {
      balance = await this.getCarrierBalance(account.currency || 'INR');
    } catch (err) {
      balanceError = err.message;
    }

    let numbers = [];
    try {
      numbers = await this.listPhoneNumbers();
    } catch {
      /* numbers are optional context, not a reason to fail the whole call */
    }

    return {
      configured: true,
      balance: balance?.balance ?? null,
      availableBalance: balance?.availableBalance ?? null,
      reservedFunds: balance?.reservedFunds ?? null,
      lowBalanceThreshold: balance?.lowBalanceThreshold ?? null,
      balanceAvailable: Boolean(balance?.balance !== null && balance?.balance !== undefined),
      ...(balanceError ? { balanceError } : {}),
      currency: balance?.currency || account.currency || null,
      authId: this.authId,
      status: account.enabled === false ? 'disabled' : 'active',
      isTrial: Boolean(account.isTrial),
      postpaid: Boolean(account.postpaid),
      consoleEmail: account.email || null,
      accountName: account.name || null,
      company: account.company || null,
      cpsLimit: account.cpsLimit,
      concurrentCallsLimit: account.concurrentCallsLimit,
      activeNumbersCount: numbers.length,
      primaryNumber: numbers[0]?.number || null,
      primaryRegion: numbers[0] ? `${numbers[0].country}, ${numbers[0].region}` : null,
      ratePerMinute: account.ratePerMinute,
    };
  }

  async ping() {
    const t0 = Date.now();
    if (!this.authId || !this.authToken) {
      return { status: 'not_configured', latencyMs: 0 };
    }
    try {
      const account = await this.getAccountInfo();
      if (account.error) {
        return { status: 'error', latencyMs: Date.now() - t0, authId: this.authId, message: account.error };
      }
      return {
        status: 'connected',
        latencyMs: Date.now() - t0,
        authId: this.authId,
        carrier: 'VoBiz',
        consoleEmail: account.email || null,
        cpsLimit: account.cpsLimit,
        concurrentCallsLimit: account.concurrentCallsLimit,
      };
    } catch (err) {
      return { status: 'error', latencyMs: Date.now() - t0, authId: this.authId, carrier: 'VoBiz', message: err.message };
    }
  }

  /**
   * GET /Account/{auth_id}/numbers
   *
   * Pagination is page/per_page (per_page default 25); `limit` and `offset` do
   * not control it. URLSearchParams already percent-encodes, so `+91...` goes
   * out as %2B91...; encoding by hand here would send %252B and match nothing.
   */
  async listPhoneNumbers({ search = '', page = 1, perPage = 25 } = {}) {
    if (!this.authId || !this.authToken) return [];

    try {
      const params = new URLSearchParams();
      params.set('page', String(Math.max(1, page)));
      params.set('per_page', String(Math.max(1, perPage)));
      if (search) params.set('search', search);

      const data = await this.#request(`/Account/${this.authId}/numbers?${params.toString()}`);
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data.data) ? data.data : [];
      return items.map((item) => this.#mapNumber(item));
    } catch (err) {
      console.warn('VoBiz listPhoneNumbers error:', err.message);
      return [];
    }
  }

  #mapNumber(item) {
    return {
      id: item.id || null,
      number: item.e164,
      provider: 'vobiz',
      country: item.country || null,
      region: item.region || null,
      capabilities: item.capabilities || {},
      status: item.status || 'active',
      monthly_cost: item.monthly_fee ?? 0,
      setup_fee: item.setup_fee ?? 0,
      currency: item.currency || null,
      account_id: item.account_id || item.auth_id || this.authId,
      type: item.is_trial_number ? 'trial' : 'local',
      is_trial: item.is_trial_number ?? false,
      voice_enabled: item.voice_enabled ?? true,
      application_id: item.application_id || null,
      trunk_group_id: item.trunk_group_id || null,
      source: item.source || null,
      purchased_at: item.purchased_at || null,
      minimum_commitment_months: item.minimum_commitment_months ?? null,
    };
  }

  /**
   * POST /Account/{auth_id}/numbers/purchase-from-inventory
   *
   * The number must be in inventory with status "active" and auth_id null.
   * A successful response is {message, number: PhoneNumber}.
   *
   * The previous implementation caught its own failure and returned
   * success: true anyway, so a purchase that never happened looked complete.
   */
  async purchaseNumberFromInventory({ e164, currency = 'INR' }) {
    const body = { e164 };
    if (currency) body.currency = currency;

    try {
      const data = await this.#request(`/Account/${this.authId}/numbers/purchase-from-inventory`, {
        method: 'POST',
        body,
      });
      const purchased = data.number || null;
      return {
        success: true,
        number: purchased?.e164 || e164,
        carrierOrderId: data.api_id || data.order_id || null,
        message: data.message || 'Number purchased successfully',
        raw: data,
      };
    } catch (err) {
      // A 404 means the number is not in inventory; a 500 means the balance
      // debit failed and the purchase was rolled back. Both are real failures.
      console.warn('VoBiz purchase-from-inventory failed:', err.message);
      throw new AppError(
        err.message,
        err.status === 404 ? 404 : 502,
        err.providerCode || 'VOBIZ_PURCHASE_FAILED'
      );
    }
  }

  /**
   * DELETE /Account/{auth_id}/numbers/{e164}?immediate=
   *
   * The response includes cooldown_ends_at, release_fee and a cancel_url. A
   * standard release sits in pending_release for 24 hours before it is
   * quarantined for 45 days; immediate=true skips the cancellable window.
   */
  async releaseNumber(e164, { immediate = false } = {}) {
    const encoded = encodeURIComponent(e164);
    const data = await this.#request(
      `/Account/${this.authId}/numbers/${encoded}?immediate=${immediate ? 'true' : 'false'}`,
      { method: 'DELETE' }
    );
    return {
      success: true,
      number: e164,
      status: data.status || 'pending_release',
      cancelUrl: data.cancel_url || null,
      cooldownEndsAt: data.cooldown_ends_at || null,
      releaseFee: data.release_fee ?? null,
      note: data.note || null,
      message: data.message || 'number release initiated',
      raw: data,
    };
  }

  /**
   * GET /Account/{auth_id}/inventory/numbers
   *
   * Documented parameters are country, search, exclude, page and per_page. An
   * earlier comment here claimed the endpoint was unpublished, which was wrong -
   * the path was right but `exclude` was never sent and `region`/`type` were,
   * neither of which the carrier documents. Those are kept because they are
   * harmless when ignored and useful when supported.
   *
   * `limit` is accepted as an alias for `perPage` because both callers name the
   * page size `limit`; reading only `perPage` discarded it and pinned every
   * page to 20 rows.
   */
  async getNumbersInventory({ country, region, type, q, search, exclude, page = 1, perPage = 20, limit = null } = {}) {
    const perPageNum = Math.max(1, parseInt(limit ?? perPage, 10) || 20);
    const params = new URLSearchParams();
    if (country) params.set('country', country);
    if (region && region !== 'Any') params.set('region', region);
    if (type) params.set('type', type);
    // URLSearchParams encodes the value itself; pre-encoding with
    // encodeURIComponent produced %252B for a leading "+" and matched nothing.
    const searchTerm = q || search;
    if (searchTerm) params.set('search', searchTerm);
    if (exclude) params.set('exclude', exclude);
    params.set('page', String(page));
    params.set('per_page', String(perPageNum));

    try {
      const data = await this.#request(`/Account/${this.authId}/inventory/numbers?${params.toString()}`);
      const items = Array.isArray(data.items) ? data.items : [];
      return {
        items: items.map((item) => ({
          id: item.id || item.e164,
          e164: item.e164,
          // Normalised from the carrier's own wording so the buyer stores a
          // value the phone_numbers type vocabulary accepts.
          type: inventoryType(item),
          country: item.country || 'IN',
          region: item.region || null,
          features: inventoryFeatures(item.capabilities),
          series: item.series || null,
          monthly_fee: item.monthly_fee ?? null,
          setup_fee: item.setup_fee ?? null,
          release_fee: item.release_fee ?? null,
          currency: item.currency || 'INR',
        })),
        total: typeof data.total === 'number' ? data.total : items.length,
        page: data.page || page,
        per_page: data.per_page || perPageNum,
        carrier: 'VoBiz',
        authId: this.authId,
      };
    } catch (err) {
      throw new AppError(
        `VoBiz inventory listing is not available on this account: ${err.message}`,
        err.status === 404 ? 404 : 502,
        err.providerCode || 'VOBIZ_INVENTORY_UNAVAILABLE'
      );
    }
  }

  async checkAdminPurchasingReadiness() {
    const account = await this.getAccountInfo();
    return {
      isReady: Boolean(account.configured && account.enabled !== false),
      carrier: 'VoBiz',
      isTrial: Boolean(account.isTrial),
      postpaid: Boolean(account.postpaid),
    };
  }

  // ---------------------------------------------------------------------------
  // Audio Streams (WebSocket media over REST)
  // ---------------------------------------------------------------------------

  /**
   * POST /Account/{auth_id}/Call/{call_uuid}/Stream/
   *
   * `bidirectional` MUST be the string "true"; a JSON boolean silently yields a
   * one-way stream. When bidirectional, audio_track has to be "inbound".
   */
  async startAudioStream(callUuid, {
    serviceUrl,
    audioTrack = 'both',
    bidirectional = false,
    contentType = 'audio/x-mulaw;rate=8000',
    streamTimeout = 86400,
    statusCallbackUrl = null,
    statusCallbackMethod = 'POST',
    extraHeaders = null,
  } = {}) {
    if (!serviceUrl) {
      throw new AppError('service_url is required to start a Vobiz audio stream.', 400, 'VOBIZ_STREAM_NO_URL');
    }
    const isBidirectional = bidirectional === true || bidirectional === 'true';
    const track = isBidirectional ? 'inbound' : audioTrack;

    const body = {
      service_url: serviceUrl,
      audio_track: track,
      bidirectional: isBidirectional ? 'true' : 'false',
      content_type: contentType,
      stream_timeout: Math.floor(Number(streamTimeout) || 86400),
    };
    if (statusCallbackUrl) {
      body.status_callback_url = statusCallbackUrl;
      body.status_callback_method = statusCallbackMethod === 'GET' ? 'GET' : 'POST';
    }
    if (extraHeaders) body.extra_headers = String(extraHeaders).slice(0, 512);

    const data = await this.#request(`/Account/${this.authId}/Call/${callUuid}/Stream/`, {
      method: 'POST',
      body,
    });
    if (!data.stream_id) {
      throw new AppError('VoBiz started a stream but returned no stream_id.', 502, 'VOBIZ_STREAM_NO_ID');
    }
    return { streamId: data.stream_id, message: data.message || 'audio streaming started', raw: data };
  }

  /** GET .../Call/{call_uuid}/Stream/{stream_id}/ - documented Stream object. */
  async getAudioStream(callUuid, streamId) {
    return this.#request(`/Account/${this.authId}/Call/${callUuid}/Stream/${streamId}/`);
  }

  /** GET .../Call/{call_uuid}/Stream/ - {page, per_page, total, objects}. */
  async listAudioStreams(callUuid, { limit = 20, offset = 0 } = {}) {
    const data = await this.#request(
      `/Account/${this.authId}/Call/${callUuid}/Stream/?limit=${limit}&offset=${offset}`
    );
    return {
      objects: Array.isArray(data.objects) ? data.objects : [],
      page: data.page ?? null,
      per_page: data.per_page ?? null,
      total: data.total ?? null,
      raw: data,
    };
  }

  /** DELETE .../Stream/{stream_id}/ - 204, idempotent. Stops stream billing. */
  async stopAudioStream(callUuid, streamId) {
    await this.#request(`/Account/${this.authId}/Call/${callUuid}/Stream/${streamId}/`, { method: 'DELETE' });
    return { status: 'stopped', streamId };
  }

  /** DELETE .../Stream/ - stops every stream on the call. 204, idempotent. */
  async stopAllAudioStreams(callUuid) {
    await this.#request(`/Account/${this.authId}/Call/${callUuid}/Stream/`, { method: 'DELETE' });
    return { status: 'stopped', callUuid };
  }

  // ---------------------------------------------------------------------------
  // Call Detail Records
  // ---------------------------------------------------------------------------

  /**
   * GET /Account/{auth_id}/cdr  (lowercase, no trailing slash)
   *
   * Response is {account_id, count, data[], pagination{page, per_page, total,
   * pages, has_next, has_prev}, summary{...}}. start_date and end_date must be
   * supplied together as YYYY-MM-DD.
   */
  async getCdr({
    fromNumber,
    toNumber,
    startDate,
    endDate,
    callDirection,
    minDuration,
    page = 1,
    perPage = 20,
  } = {}) {
    const params = new URLSearchParams();
    if (fromNumber) params.set('from_number', fromNumber);
    if (toNumber) params.set('to_number', toNumber);
    // Either date requires the other.
    if (startDate && endDate) {
      params.set('start_date', startDate);
      params.set('end_date', endDate);
    }
    if (callDirection === 'inbound' || callDirection === 'outbound') params.set('call_direction', callDirection);
    if (Number.isFinite(Number(minDuration))) params.set('min_duration', String(Math.floor(Number(minDuration))));
    params.set('page', String(page));
    params.set('per_page', String(Math.min(100, Math.max(1, perPage))));

    const data = await this.#request(`/Account/${this.authId}/cdr?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    return {
      accountId: data.account_id || null,
      count: data.count ?? (Array.isArray(data.data) ? data.data.length : 0),
      data: Array.isArray(data.data) ? data.data.map((r) => this.#mapCdrRow(r)) : [],
      pagination: data.pagination || null,
      summary: data.summary || null,
      raw: data,
    };
  }

  /** GET /Account/{auth_id}/cdr/recent - returns only `data`, no pagination. */
  async getRecentCdr(limit = 20) {
    const data = await this.#request(`/Account/${this.authId}/cdr/recent?limit=${limit}`, {
      headers: { Accept: 'application/json' },
    });
    const rows = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    return rows.map((r) => this.#mapCdrRow(r));
  }

  /** GET /Account/{auth_id}/cdr/{call_id} - one CDR row. */
  async getCdrByCall(callId) {
    const data = await this.#request(`/Account/${this.authId}/cdr/${callId}`, {
      headers: { Accept: 'application/json' },
    });
    const row = Array.isArray(data.data) ? data.data[0] : data.data || data;
    return row && typeof row === 'object' ? this.#mapCdrRow(row) : null;
  }

  #mapCdrRow(r) {
    return {
      id: r.id ?? null,
      uuid: r.uuid || null,
      accountId: r.account_id || null,
      direction: r.call_direction || null,
      callerIdName: r.caller_id_name || null,
      callerIdNumber: r.caller_id_number || null,
      destinationNumber: r.destination_number || null,
      // duration is ring+talk, billsec is talk only and is what gets charged.
      duration: r.duration ?? 0,
      billsec: r.billsec ?? 0,
      ringTime: r.ring_time ?? 0,
      answerTime: r.answer_time || null,
      startTime: r.start_time || null,
      endTime: r.end_time || null,
      cost: r.cost ?? 0,
      totalCost: r.total_cost ?? 0,
      streamingCost: r.streaming_cost ?? 0,
      currency: r.currency || null,
      hangupCause: r.hangup_cause || null,
      hangupCauseCode: r.hangup_cause_code ?? null,
      hangupCauseName: r.hangup_cause_name || null,
      hangupDisposition: r.hangup_disposition || null,
      hangupSource: r.hangup_source || null,
      failureCode: r.failure_code || null,
      failureReason: r.failure_reason || null,
      codec: r.codec || null,
      mos: r.mos ?? null,
      jitter: r.jitter ?? null,
      packetLoss: r.packet_loss ?? null,
      region: r.region || null,
      trunkId: r.trunk_id || null,
      raw: r,
    };
  }

  // ---------------------------------------------------------------------------
  // Recordings
  // ---------------------------------------------------------------------------

  /**
   * GET /Account/{auth_id}/Recording/  (PascalCase and case-sensitive)
   *
   * Pagination is limit/offset (limit default 20, max 100), not page-based.
   * An empty result is a 200 with objects: [] and meta.total_count 0, not a 404.
   */
  async listRecordings({ callUuid, recordingType, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams();
    params.set('limit', String(Math.min(100, Math.max(1, limit))));
    params.set('offset', String(Math.max(0, offset)));
    if (callUuid) params.set('call_uuid', callUuid);
    if (recordingType) params.set('recording_type', recordingType);

    const data = await this.#request(`/Account/${this.authId}/Recording/?${params.toString()}`);
    return {
      objects: (Array.isArray(data.objects) ? data.objects : []).map((r) => this.#mapRecording(r)),
      meta: data.meta || null,
      raw: data,
    };
  }

  /** GET /Account/{auth_id}/Recording/{recording_id}/ - flat Recording object. */
  async getRecording(recordingId) {
    const data = await this.#request(`/Account/${this.authId}/Recording/${recordingId}/`);
    return this.#mapRecording(data);
  }

  /** DELETE /Account/{auth_id}/Recording/{recording_id}/ - 204. */
  async deleteRecording(recordingId) {
    await this.#request(`/Account/${this.authId}/Recording/${recordingId}/`, { method: 'DELETE' });
    return { deleted: true, recordingId };
  }

  /**
   * Download a recording.
   *
   * recording_url is NOT a public link: it requires X-Auth-ID + X-Auth-Token.
   * The docs also warn that recording_format and the file extension can both be
   * wrong, so the container is detected from the magic bytes on our side.
   */
  async downloadRecording(recordingUrl) {
    const res = await fetch(recordingUrl, {
      headers: { 'X-Auth-ID': this.authId, 'X-Auth-Token': this.authToken },
    });
    if (!res.ok) {
      throw new AppError(`VoBiz recording download failed (${res.status})`, 502, 'VOBIZ_RECORDING_DOWNLOAD_FAILED');
    }
    return Buffer.from(await res.arrayBuffer());
  }

  #mapRecording(r) {
    return {
      recordingId: r.recording_id || null,
      recordingUrl: r.recording_url || null,
      recordingFormat: r.recording_format || null,
      callUuid: r.call_uuid || null,
      conferenceName: r.conference_name || null,
      recordingType: r.recording_type || null,
      addTime: r.add_time || null,
      startMs: r.recording_start_ms || null,
      endMs: r.recording_end_ms || null,
      // The documented field is recording_duration_ms. `rounding_duration_ms`
      // does not exist, so this previously read undefined and fell through to
      // the rounded seconds value, reporting a minutes figure as milliseconds.
      durationMs: r.recording_duration_ms ?? null,
      // Billing rounds to the nearest 60s and bills anything under 60s as 60s.
      billedSeconds: r.rounded_recording_duration ?? null,
      fromNumber: r.from_number || null,
      toNumber: r.to_number || null,
      storageDays: r.recording_storage_duration ?? null,
      storageRate: r.recording_storage_rate ?? null,
      storageAmount: r.monthly_recording_storage_amount ?? null,
      raw: r,
    };
  }

  // ---------------------------------------------------------------------------
  // Applications (webhook endpoints VoBiz fetches when a call arrives)
  // ---------------------------------------------------------------------------

  /**
   * POST /Account/{auth_id}/Application/
   *
   * app_name accepts letters, digits, - and _ only. answer_method is required.
   * Note the field is fallback_answer_url here, but fallback_url on the call
   * endpoint; both spellings appear in the docs.
   */
  async createApplication({
    appName,
    answerUrl,
    answerMethod = 'POST',
    hangupUrl = null,
    hangupMethod = 'POST',
    fallbackAnswerUrl = null,
    fallbackMethod = 'POST',
    messageUrl = null,
    messageMethod = 'POST',
    defaultNumberApp = false,
    defaultApp = false,
    enabled = true,
    publicUri = false,
    applicationType = 'XML',
    subAccount = null,
  }) {
    if (!appName) throw new AppError('app_name is required to create a Vobiz application.', 400, 'VOBIZ_APP_NO_NAME');
    if (!answerUrl) throw new AppError('answer_url is required to create a Vobiz application.', 400, 'VOBIZ_APP_NO_ANSWER_URL');
    if (!/^[A-Za-z0-9_-]+$/.test(appName)) {
      throw new AppError('app_name may only contain letters, digits, "-" and "_".', 400, 'VOBIZ_APP_BAD_NAME');
    }

    const body = {
      app_name: appName,
      answer_url: answerUrl,
      answer_method: answerMethod === 'GET' ? 'GET' : 'POST',
      application_type: applicationType,
      enabled,
      default_number_app: Boolean(defaultNumberApp),
      default_app: Boolean(defaultApp),
      public_uri: Boolean(publicUri),
    };
    if (hangupUrl) {
      body.hangup_url = hangupUrl;
      body.hangup_method = hangupMethod === 'GET' ? 'GET' : 'POST';
    }
    if (fallbackAnswerUrl) {
      body.fallback_answer_url = fallbackAnswerUrl;
      body.fallback_method = fallbackMethod === 'GET' ? 'GET' : 'POST';
    }
    if (messageUrl) {
      body.message_url = messageUrl;
      body.message_method = messageMethod === 'GET' ? 'GET' : 'POST';
    }
    if (subAccount) body.sub_account = subAccount;

    const data = await this.#request(`/Account/${this.authId}/Application/`, { method: 'POST', body });
    if (!data.app_id) {
      throw new AppError('VoBiz created the application but returned no app_id.', 502, 'VOBIZ_APP_NO_ID');
    }
    return { appId: data.app_id, apiId: data.api_id || null, message: data.message || 'created', raw: data };
  }

  /**
   * POST /Account/{auth_id}/Application/{app_id}/Number/{number}/
   *
   * Attaching a number to an application is what makes inbound calling work at
   * all - until this is called, VoBiz has no idea which URL to fetch when the
   * number rings. Creating the application alone is not enough.
   */
  async attachNumberToApplication(appId, number) {
    if (!appId) throw new AppError('app_id is required to attach a number.', 400, 'VOBIZ_APP_NO_ID');
    const e164 = String(number || '').trim();
    if (!e164) throw new AppError('A number is required to attach.', 400, 'VOBIZ_NO_NUMBER');
    const data = await this.#request(
      `/Account/${this.authId}/Application/${encodeURIComponent(appId)}/Number/${encodeURIComponent(e164)}/`,
      { method: 'POST', body: {} }
    );
    return { appId, number: e164, message: data?.message || 'attached', raw: data };
  }

  /** DELETE /Account/{auth_id}/Application/{app_id}/Number/{number}/ */
  async detachNumberFromApplication(appId, number) {
    const e164 = String(number || '').trim();
    const data = await this.#request(
      `/Account/${this.authId}/Application/${encodeURIComponent(appId)}/Number/${encodeURIComponent(e164)}/`,
      { method: 'DELETE' }
    );
    return { appId, number: e164, message: data?.message || 'detached', raw: data };
  }

  /** GET /Account/{auth_id}/Application/ - list, when the account exposes it. */
  async listApplications() {
    const data = await this.#request(`/Account/${this.authId}/Application/`);
    const objects = Array.isArray(data.objects) ? data.objects : Array.isArray(data) ? data : [];
    return {
      objects: objects.map((a) => ({
        appId: a.app_id || null,
        appName: a.app_name || null,
        answerUrl: a.answer_url || null,
        hangupUrl: a.hangup_url || null,
        applicationType: a.application_type || null,
        enabled: a.enabled ?? null,
        defaultNumberApp: a.default_number_app ?? null,
        sipUri: a.sip_uri || null,
        createdAt: a.created_at || null,
        raw: a,
      })),
      meta: data.meta || null,
      raw: data,
    };
  }

  // ---------------------------------------------------------------------------
  // Callback signature verification
  // ---------------------------------------------------------------------------

  /**
   * Verify an incoming callback signature.
   *
   * The headers are only present when auth credentials are configured on the
   * callback URL, so their absence is not treated as a failure here - the caller
   * decides whether an unsigned callback is acceptable.
   *
   * Returns {verified, present, version, reason}.
   */
  verifyWebhookSignature(req, { baseUrl } = {}) {
    const headers = req?.headers || {};
    const v3 = headers['x-vobiz-signature-v3'];
    const v3Nonce = headers['x-vobiz-signature-v3-nonce'];
    const v2 = headers['x-vobiz-signature-v2'];
    const v2Nonce = headers['x-vobiz-signature-v2-nonce'];

    if (!v3 && !v2) {
      return { verified: false, present: false, reason: 'no_signature_header' };
    }
    if (!this.authToken) {
      return { verified: false, present: true, reason: 'no_auth_token_to_verify_against' };
    }

    // baseURL is the callback URL with every query parameter stripped.
    const url = baseUrl || `${req.protocol || 'https'}://${req.get?.('host') || headers.host || ''}${req.originalUrl || req.url || ''}`;
    const base = stripQuery(url);

    const attempts = [];
    if (v3 && v3Nonce) attempts.push({ version: 'v3', signature: v3, nonce: v3Nonce });
    if (v2 && v2Nonce) attempts.push({ version: 'v2', signature: v2, nonce: v2Nonce });

    for (const attempt of attempts) {
      if (!rememberNonce(attempt.nonce)) {
        // A nonce is never reused, so a repeat is a replay.
        return { verified: false, present: true, version: attempt.version, reason: 'replayed_nonce' };
      }
      const expected = computeVobizSignature(attempt.version, this.authToken, base, attempt.nonce);
      if (safeEqual(expected, attempt.signature)) {
        return { verified: true, present: true, version: attempt.version };
      }
    }

    return { verified: false, present: true, reason: 'signature_mismatch' };
  }

  /** Constant-time string compare, exported for tests and reuse. */
  verifyWebhookSecret(secretHeader) {
    if (!this.webhookSecret) return true; // No secret configured
    return safeEqual(secretHeader, this.webhookSecret);
  }
}

module.exports = {
  VoBizProvider,
  computeVobizSignature,
  stripQuery,
  AMD_PROFILES,
  CDR_HANGUP_CAUSES,
  HANGUP_SOURCES,
};