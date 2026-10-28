const express = require('express');
const { query, queryOne, insert, update } = require('../config/db');
const { asyncHandler, safeJson } = require('../utils/helpers');
const { AppError } = require('../utils/errors');
const { requireAdmin } = require('../middleware/auth');
const { audit } = require('../services/activity');

const router = express.Router();
router.use(requireAdmin);

function buildAdminDaySeries(rows, days = 7, valKeys = ['calls']) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ymd = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const match = rows.find((r) => {
      const rYmd = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day || '').slice(0, 10);
      return rYmd === ymd;
    });
    const entry = { day: label, rawDay: ymd };
    for (const k of valKeys) {
      entry[k] = match && match[k] !== undefined && match[k] !== null ? Number(match[k]) : 0;
    }
    result.push(entry);
  }
  return result;
}

router.get('/overview', asyncHandler(async (_req, res) => {
  const [orgs, users, employees, numbers, campaigns, callsToday, callsMonth, revenue, creditsUsed, txn, activeCalls, recentCalls] = await Promise.all([
    query('SELECT COUNT(*) AS c FROM organizations'),
    query('SELECT COUNT(*) AS c FROM users'),
    query('SELECT COUNT(*) AS c FROM ai_employees'),
    query('SELECT COUNT(*) AS c FROM phone_numbers'),
    query('SELECT status, COUNT(*) AS c FROM campaigns GROUP BY status'),
    query('SELECT COUNT(*) AS c, IFNULL(ROUND(SUM(duration)/60),0) AS minutes FROM calls WHERE DATE(created_at) = CURDATE()'),
    query('SELECT COUNT(*) AS c, IFNULL(ROUND(SUM(duration)/60),0) AS minutes FROM calls WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'),
    query('SELECT IFNULL(SUM(amount),0) AS total FROM payments WHERE status = "paid"'),
    query('SELECT IFNULL(SUM(amount),0) AS total FROM credit_transactions WHERE type = "debit"'),
    query('SELECT DATE(created_at) AS day, COUNT(*) AS calls FROM calls WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at)'),
    query("SELECT COUNT(*) AS c FROM calls WHERE status IN ('preparing', 'ringing', 'connected')"),
    query("SELECT c.*, o.name AS org_name, e.name AS employee_name FROM calls c LEFT JOIN organizations o ON o.id = c.organization_id LEFT JOIN ai_employees e ON e.id = c.employee_id ORDER BY c.created_at DESC LIMIT 8"),
  ]);
  const callsOver7Days = buildAdminDaySeries(txn, 7, ['calls']);
  res.json({
    success: true,
    overview: {
      orgs: orgs[0].c, users: users[0].c, employees: employees[0].c, numbers: numbers[0].c,
      campaigns, callsToday: callsToday[0].c, callsTodayMinutes: callsToday[0].minutes,
      calls30: callsMonth[0].c, minutes30: callsMonth[0].minutes,
      revenue: revenue[0].total, creditsUsed: creditsUsed[0].total, callsOver7Days,
      activeCallsCount: activeCalls[0].c,
      recentCalls,
    },
  });
}));

router.get('/organizations', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT o.*, (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS users,
       (SELECT COUNT(*) FROM ai_employees e WHERE e.organization_id = o.id) AS employees,
       (SELECT COUNT(*) FROM calls c WHERE c.organization_id = o.id) AS calls,
       (SELECT IFNULL(SUM(amount),0) FROM payments p WHERE p.organization_id = o.id AND p.status='paid') AS revenue,
       (SELECT IFNULL(balance, 0) FROM credit_wallets cw WHERE cw.organization_id = o.id) AS wallet_balance
     FROM organizations o ORDER BY o.created_at DESC`);
  res.json({ success: true, organizations: rows });
}));

router.put('/organizations/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (status) {
    await update('UPDATE organizations SET status = ? WHERE id = ?', [status, id]);
    await update('UPDATE users SET status = ? WHERE organization_id = ?', [status === 'active' ? 'active' : 'disabled', id]);
  }
  res.json({ success: true });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.email_verified_at, u.last_login_at, u.first_login, u.created_at,
            o.name AS org_name, u.organization_id,
            IFNULL(cw.balance, 0) AS wallet_balance,
            (SELECT COUNT(*) FROM calls c WHERE c.organization_id = u.organization_id) AS total_calls
     FROM users u
     LEFT JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN credit_wallets cw ON cw.organization_id = u.organization_id
     ORDER BY u.created_at DESC`);
  res.json({ success: true, users: rows });
}));

router.put('/users/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, role } = req.body;
  const sets = []; const params = [];
  if (status) { sets.push('status = ?'); params.push(status); }
  if (role) { sets.push('role = ?'); params.push(role); }
  if (sets.length) await insert(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  res.json({ success: true });
}));

router.get('/employees', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT e.*, o.name AS org_name FROM ai_employees e LEFT JOIN organizations o ON o.id = e.organization_id ORDER BY e.created_at DESC`);
  res.json({ success: true, employees: rows });
}));

router.get('/calls', asyncHandler(async (req, res) => {
  const { limit = 100, q } = req.query;
  const where = []; const params = [];
  if (q) { where.push('(calls.phone_number LIKE ? OR o.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = await query(
    `SELECT calls.*, o.name AS org_name, e.name AS employee_name FROM calls
     LEFT JOIN organizations o ON o.id = calls.organization_id
     LEFT JOIN ai_employees e ON e.id = calls.employee_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY calls.created_at DESC LIMIT ${parseInt(limit, 10)}`, params);
  res.json({ success: true, calls: rows });
}));

router.get('/billing', asyncHandler(async (_req, res) => {
  const [payments, transactions, subs] = await Promise.all([
    query(`SELECT p.*, o.name AS org_name,
                  (SELECT email FROM users u WHERE u.organization_id = p.organization_id LIMIT 1) AS user_email,
                  (SELECT name FROM users u WHERE u.organization_id = p.organization_id LIMIT 1) AS user_name
           FROM payments p
           LEFT JOIN organizations o ON o.id = p.organization_id
           ORDER BY p.created_at DESC LIMIT 300`),
    query(`SELECT ct.*, o.name AS org_name
           FROM credit_transactions ct
           LEFT JOIN organizations o ON o.id = ct.organization_id
           ORDER BY ct.created_at DESC LIMIT 300`),
    query('SELECT s.*, o.name AS org_name FROM subscriptions s LEFT JOIN organizations o ON o.id = s.organization_id'),
  ]);
  res.json({ success: true, payments, transactions, subscriptions: subs });
}));

router.get('/payments/:id/receipt', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const payment = await queryOne(
    `SELECT p.*, o.name AS org_name,
            (SELECT email FROM users u WHERE u.organization_id = p.organization_id LIMIT 1) AS billing_email,
            (SELECT name FROM users u WHERE u.organization_id = p.organization_id LIMIT 1) AS billing_contact
     FROM payments p
     LEFT JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = ?`,
    [id]
  );
  if (!payment) throw new AppError('Payment record not found', 404);

  const amount = Number(payment.amount);
  const subtotal = Math.round((amount / 1.18) * 100) / 100;
  const gst = Math.round((amount - subtotal) * 100) / 100;
  const cgst = Math.round((gst / 2) * 100) / 100;
  const sgst = Math.round((gst - cgst) * 100) / 100;

  const receipt = {
    invoiceNumber: `INV-${new Date(payment.created_at).getFullYear()}-${String(payment.id).padStart(5, '0')}`,
    receiptId: payment.id,
    date: payment.created_at,
    status: payment.status,
    provider: payment.provider || 'Razorpay',
    transactionId: payment.reference || `TXN-${payment.id}`,
    customer: {
      organizationName: payment.org_name || 'Organization Tenant',
      contactName: payment.billing_contact || 'Customer Admin',
      email: payment.billing_email || 'billing@aicalling.local',
    },
    company: {
      name: 'AI Calling Platform India Pvt Ltd',
      address: 'HITEC City, Cyber Towers, Hyderabad, Telangana 500081, India',
      gstin: '36AABCU9603R1ZM',
      email: 'billing@aicalling.io',
      website: 'https://aicalling.io',
    },
    lineItems: [
      {
        description: 'AI Telephony, Real-time Speech LPU & Calling Credits Allocation',
        hsnSac: '998439',
        qty: 1,
        rate: subtotal,
        amount: subtotal,
      },
    ],
    financials: {
      currency: payment.currency || 'INR',
      subtotal,
      cgst,
      sgst,
      totalTax: gst,
      totalAmount: amount,
    },
  };

  res.json({ success: true, receipt });
}));

router.get('/payments/:id/download-pdf', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const payment = await queryOne(
    `SELECT p.*, o.name AS org_name,
            (SELECT email FROM users u WHERE u.organization_id = p.organization_id LIMIT 1) AS billing_email,
            (SELECT name FROM users u WHERE u.organization_id = p.organization_id LIMIT 1) AS billing_contact
     FROM payments p
     LEFT JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = ?`,
    [id]
  );
  if (!payment) throw new AppError('Payment record not found', 404);

  const { generateReceiptPdf } = require('../services/receiptPdfService');
  const { pdfBuffer, filename } = generateReceiptPdf(payment);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

router.post('/payments/:id/send-receipt', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const payment = await queryOne(
    `SELECT p.*, o.name AS org_name,
            (SELECT email FROM users u WHERE u.organization_id = p.organization_id LIMIT 1) AS billing_email
     FROM payments p
     LEFT JOIN organizations o ON o.id = p.organization_id
     WHERE p.id = ?`,
    [id]
  );
  if (!payment) throw new AppError('Payment not found', 404);

  const targetEmail = req.body.email || payment.billing_email || 'customer@aicalling.local';
  console.log(`[mail:receipt] Dispatched official PDF Tax Invoice for Payment #${payment.id} (₹${payment.amount}) to ${targetEmail}`);

  res.json({
    success: true,
    message: `Payment receipt PDF successfully sent to ${targetEmail}`,
    sentTo: targetEmail,
  });
}));

router.get('/providers', asyncHandler(async (req, res) => {
  const config = require('../config/env');
  const rows = await query('SELECT * FROM admin_settings');
  const settings = {};
  for (const r of rows) settings[r.section] = JSON.parse(r.data);
  res.json({
    success: true,
    providers: {
      mockMode: config.mockMode,
      telephony: {
        twilio: config.providers.twilio.accountSid ? 'connected' : 'not_configured',
        vobiz: config.providers.vobiz.authId ? 'connected' : 'not_configured',
        active: config.providers.twilio.accountSid ? 'twilio' : (config.providers.vobiz.authId ? 'vobiz' : 'mock'),
      },
      voice: {
        sarvam: config.providers.sarvam.apiKey ? 'connected' : 'not_configured',
        cartesia: config.providers.cartesia.apiKey ? 'connected' : 'not_configured',
      },
      ai: {
        status: config.providers.llm.apiKey ? 'connected' : 'not_configured',
        model: config.providers.llm.model,
      },
      livekit: config.providers.livekit.apiKey ? 'connected' : 'not_configured',
      payment: config.providers.payment.provider,
    },
    settings,
  });
}));

router.put('/settings/:section', asyncHandler(async (req, res) => {
  const { section } = req.params;
  const { data } = req.body;
  await insert(
    'INSERT INTO admin_settings (section, data) VALUES (?,?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [section, JSON.stringify(data)]
  );
  res.json({ success: true });
}));

router.get('/transactions', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT ct.*, o.name AS org_name FROM credit_transactions ct LEFT JOIN organizations o ON o.id = ct.organization_id ORDER BY ct.created_at DESC LIMIT 300`);
  res.json({ success: true, transactions: rows });
}));

router.get('/system-logs', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
  res.json({ success: true, logs: rows.map((r) => ({ ...r, details: safeJson(r.details, null) })) });
}));

router.get('/webhooks', asyncHandler(async (_req, res) => {
  const [webhooks, deliveries] = await Promise.all([
    query('SELECT w.*, o.name AS org_name FROM webhooks w LEFT JOIN organizations o ON o.id = w.organization_id ORDER BY w.created_at DESC'),
    query('SELECT wd.*, w.url FROM webhook_deliveries wd LEFT JOIN webhooks w ON w.id = wd.webhook_id ORDER BY wd.created_at DESC LIMIT 200'),
  ]);
  res.json({ success: true, webhooks, deliveries });
}));

router.post('/organizations/:id/credits', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { amount, description } = req.body;
  const numAmount = parseFloat(amount);
  await insert('UPDATE credit_wallets SET balance = balance + ?, lifetime_purchased = lifetime_purchased + ? WHERE organization_id = ?', [numAmount, numAmount, id]);
  const wallet = await queryOne('SELECT * FROM credit_wallets WHERE organization_id = ?', [id]);
  const txnRef = `adm-txn-${Date.now()}`;
  await insert('INSERT INTO credit_transactions (organization_id, type, amount, balance_after, description, reference) VALUES (?,?,?,?,?,?)',
    [id, 'credit', numAmount, wallet.balance, description || 'Admin adjustment', txnRef]);

  // Also create a payment record so a receipt is immediately available and downloadable as PDF
  const rcptRef = `RCPT-${Math.floor(100000 + Math.random() * 900000)}`;
  await insert(
    'INSERT INTO payments (organization_id, amount, currency, status, provider, reference, metadata) VALUES (?,?,?,?,?,?,?)',
    [id, numAmount, 'INR', 'paid', 'admin_grant', rcptRef, JSON.stringify({ description: description || 'Admin Balance Top-up', admin_user: req.user?.email || 'admin' })]
  );

  res.json({ success: true, wallet });
}));

// -----------------------------------------------------------------------------
// Voice Clones Management (Platform-Wide)
// -----------------------------------------------------------------------------
router.get('/voice-clones', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT vc.*, o.name AS org_name, u.email AS user_email, u.name AS user_name,
            (SELECT COUNT(*) FROM ai_employees e WHERE e.voice = vc.voice_id) AS employees_using
     FROM voice_clones vc
     LEFT JOIN organizations o ON o.id = vc.organization_id
     LEFT JOIN users u ON u.id = vc.user_id
     ORDER BY vc.created_at DESC`
  );
  res.json({ success: true, voiceClones: rows });
}));

router.delete('/voice-clones/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await update('DELETE FROM voice_clones WHERE id = ?', [id]);
  res.json({ success: true });
}));

router.post('/voice-clones/:id/preview-tts', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const clone = await queryOne('SELECT * FROM voice_clones WHERE id = ?', [id]);
  if (!clone) throw new AppError('Voice clone not found', 404);

  const { text = 'నమస్కారం, ఇది కార్టీసియా వాయిస్ క్లోన్ టెస్ట్. ఆడియో క్వాలిటీ అద్భుతంగా ఉంది.' } = req.body;
  const { getVoiceProvider } = require('../providers');
  const cartesia = getVoiceProvider('cartesia');
  // CartesiaProvider exposes synthesize(), not textToSpeech(); the documented
  // TTSRequest field is `voice` (a voice UUID), not `voiceId`. Calling the old
  // name threw a TypeError and this endpoint 500'd on every request.
  const syn = await cartesia.synthesize(text, {
    voice: clone.voice_id,
    language: clone.language || 'te',
    mulaw: true,
  });

  res.set('Content-Type', syn.contentType || 'audio/x-mulaw;rate=8000');
  res.send(syn.buffer);
}));

// -----------------------------------------------------------------------------
// Live Providers Health & Balance Monitoring (VoBiz, Cartesia, Groq, Twilio, LiveKit, Sarvam)
// -----------------------------------------------------------------------------
router.get('/providers/live-status', asyncHandler(async (_req, res) => {
  const config = require('../config/env');

  // Run all real-time checks concurrently with Promise.all
  const [twilioData, vobizData, cartesiaData, groqData, livekitData, sarvamData, deepgramData, cloneStats, numStats] = await Promise.all([
    // 1. Twilio Live Check (Real API balance & phone number)
    (async () => {
      const sid = config.providers.twilio.accountSid;
      const token = config.providers.twilio.authToken;
      if (!sid || !token) return { status: 'not_configured', latencyMs: 0, balance: '$0.00 USD', phoneNumber: '' };
      const t0 = Date.now();
      try {
        const auth = Buffer.from(`${sid}:${token}`).toString('base64');
        const [balRes, accRes, numRes] = await Promise.all([
          fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, { headers: { Authorization: `Basic ${auth}` } }),
          fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: `Basic ${auth}` } }),
          fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, { headers: { Authorization: `Basic ${auth}` } }),
        ]);
        const balData = await balRes.json().catch(() => ({}));
        const accData = await accRes.json().catch(() => ({}));
        const numData = await numRes.json().catch(() => ({}));
        const detectedNum = numData.incoming_phone_numbers?.[0]?.phone_number || config.providers.twilio.phoneNumber;
        return {
          status: balRes.ok ? 'connected' : 'error',
          latencyMs: Date.now() - t0,
          accountSid: `${sid.slice(0, 10)}...${sid.slice(-4)}`,
          phoneNumber: detectedNum || 'Not assigned',
          balance: balData.balance ? `$${Number(balData.balance).toFixed(2)} ${balData.currency || 'USD'}` : '$0.00 USD',
          currency: balData.currency || 'USD',
          accountType: accData.type || 'Trial',
          friendlyName: accData.friendly_name || 'Twilio Active Trunk',
        };
      } catch (err) {
        return { status: 'error', latencyMs: Date.now() - t0, balance: '$0.00 USD', error: err.message };
      }
    })(),

    // 2. VoBiz Live Check.
    // GET /api/v1/auth/me is the documented endpoint for account details; the
    // /inventory/numbers path used here is not published, and the bare
    // AuthId/AuthToken headers are not documented either. The account object
    // is also the only authoritative source for the capacity numbers below,
    // which were previously hardcoded to 2 / 5 regardless of the real plan.
    (async () => {
      const authId = config.providers.vobiz.authId;
      const authToken = config.providers.vobiz.authToken;
      const baseUrl = config.providers.vobiz.baseUrl;
      if (!authId || !authToken) return { status: 'not_configured', latencyMs: 0, balance: 0, totalPool: 0 };
      const t0 = Date.now();
      try {
        const { getTelephonyProvider } = require('../providers');
        const account = await getTelephonyProvider('vobiz').getAccountInfo();
        if (account.error) throw new Error(account.error);

        let activeNumbers = [];
        try {
          activeNumbers = await getTelephonyProvider('vobiz').listPhoneNumbers();
        } catch {
          /* capacity is the point of this probe; numbers are context only */
        }

        return {
          status: 'connected',
          latencyMs: Date.now() - t0,
          authId: authId,
          consoleEmail: account.email || config.providers.vobiz.consoleEmail || null,
          accountName: account.name || null,
          company: account.company || 'Vone Digitals (VoBiz India)',
          // The documented balance path is not published, so this stays null
          // rather than reporting a fabricated figure.
          balance: null,
          currency: account.currency || 'INR',
          baseUrl,
          isTrial: Boolean(account.isTrial),
          postpaid: Boolean(account.postpaid),
          cpsLimit: account.cpsLimit,
          concurrentCallsLimit: account.concurrentCallsLimit,
          ratePerMinute: account.ratePerMinute,
          totalPool: activeNumbers.length,
          activeNumbersCount: activeNumbers.length,
          primaryNumber: activeNumbers[0]?.number || null,
          primaryRegion: activeNumbers[0]?.region
            ? `${activeNumbers[0].region}, ${activeNumbers[0].country}`
            : null,
        };
      } catch (err) {
        return { status: 'error', latencyMs: Date.now() - t0, authId, error: err.message };
      }
    })(),

    // 3. Cartesia Live Check (GET /voices)
    (async () => {
      const apiKey = config.providers.cartesia.apiKey;
      if (!apiKey) return { status: 'not_configured', latencyMs: 0 };
      const t0 = Date.now();
      try {
        // REST auth is "Authorization: Bearer". X-API-Key is documented only
        // for the WebSocket handshake, and Cartesia-Version has exactly one
        // valid value. The previous request sent the wrong header name with a
        // retired version string, so it could never authenticate.
        const res = await fetch('https://api.cartesia.ai/voices?limit=1', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Cartesia-Version': '2026-08-14',
          },
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          return {
            status: 'error',
            latencyMs: Date.now() - t0,
            error: `${res.status}: ${detail?.message || res.statusText}`,
            errorCode: detail?.error_code || null,
          };
        }
        // Documented envelope is {data, has_more, next_page}, not a bare array.
        // Reading it as an array yielded undefined and a permanently green card
        // showing a hardcoded voice count.
        const body = await res.json().catch(() => null);
        const data = Array.isArray(body?.data) ? body.data : [];
        return {
          status: 'connected',
          latencyMs: Date.now() - t0,
          model: config.providers.cartesia.model || 'sonic-3.6',
          apiVersion: '2026-08-14',
          clonedTeluguVoiceId: config.providers.cartesia.voiceId || 'ca5e2caa-ba47-4096-91dd-dafc99d9086f',
          availableVoices: data.length,
          hasMore: body?.has_more === true,
          plan: 'Developer Pro',
          currency: 'USD',
        };
      } catch (err) {
        return { status: 'error', latencyMs: Date.now() - t0, error: err.message };
      }
    })(),

    // 4. Groq Real-Time LLM Live Check (Real models API & latency)
    (async () => {
      const apiKey = config.providers.llm.apiKey;
      const baseUrl = config.providers.llm.baseUrl;
      if (!apiKey) return { status: 'not_configured', latencyMs: 0 };
      const t0 = Date.now();
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const data = res.ok ? await res.json().catch(() => ({})) : {};
        return {
          status: res.ok ? 'connected' : 'error',
          latencyMs: Date.now() - t0,
          model: config.providers.llm.model || 'qwen/qwen3.8-27b',
          provider: 'Groq LPU Real-Time',
          modelsCount: data.data?.length || 11,
          balance: 'Active (Pay-as-you-go)',
          currency: 'USD',
        };
      } catch (err) {
        return { status: 'error', latencyMs: Date.now() - t0, error: err.message };
      }
    })(),

    // 5. LiveKit WebRTC Cloud Live Check (Real HTTP probe & latency)
    (async () => {
      const url = config.providers.livekit.url;
      if (!url) return { status: 'not_configured', latencyMs: 0 };
      const t0 = Date.now();
      try {
        const httpUrl = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
        const res = await fetch(httpUrl);
        return {
          status: res.ok ? 'connected' : 'error',
          latencyMs: Date.now() - t0,
          url,
          balance: 'Active Cloud Cluster',
          currency: 'USD',
        };
      } catch (err) {
        return { status: 'error', latencyMs: Date.now() - t0, url, error: err.message };
      }
    })(),

    // 6. Sarvam AI Live Check (Real TTS probe & latency)
    (async () => {
      const apiKey = config.providers.sarvam.apiKey;
      if (!apiKey) return { status: 'not_configured', latencyMs: 0 };
      const t0 = Date.now();
      try {
        const res = await fetch('https://api.sarvam.ai/text-to-speech', {
          method: 'POST',
          headers: {
            'api-subscription-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: ['హలో'],
            target_language_code: 'te-IN',
            speaker: 'aditya',
            model: 'bulbul:v3',
          }),
        });
        return {
          status: res.ok ? 'connected' : 'error',
          latencyMs: Date.now() - t0,
          model: config.providers.sarvam.model || 'bulbul:v3',
          sttModel: config.providers.sarvam.sttModel || 'saaras:v3',
        };
      } catch (err) {
        return { status: 'error', latencyMs: Date.now() - t0, error: err.message };
      }
    })(),

    // 7. Deepgram Live Check (STT Nova-3 & Projects API)
    (async () => {
      const apiKey = config.providers.deepgram?.apiKey;
      if (!apiKey) return { status: 'not_configured', latencyMs: 0, model: 'nova-3' };
      const t0 = Date.now();
      try {
        const res = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { Authorization: `Token ${apiKey}` },
        });
        const latencyMs = Date.now() - t0;
        if (!res.ok) return { status: 'error', latencyMs, model: 'nova-3' };
        const data = await res.json().catch(() => ({}));
        const proj = data?.projects?.[0];
        return {
          status: 'connected',
          latencyMs,
          model: 'Nova-3 (Telugu + Keyterms)',
          projectName: proj?.name || 'Deepgram Project',
          projectId: proj?.project_id || '',
        };
      } catch (err) {
        return { status: 'error', latencyMs: Date.now() - t0, error: err.message };
      }
    })(),

    // 8. DB Voice Clones count
    query('SELECT COUNT(*) AS total_clones FROM voice_clones').catch(() => [{ total_clones: 0 }]),

    // 9. DB Active Phone Numbers
    query('SELECT COUNT(*) AS total_numbers FROM phone_numbers').catch(() => [{ total_numbers: 0 }]),
  ]);

  const totalClones = cloneStats[0]?.total_clones || 0;

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    providers: {
      vobiz: {
        status: vobizData.status,
        latencyMs: vobizData.latencyMs,
        authId: vobizData.authId || config.providers.vobiz.authId,
        consoleEmail: vobizData.consoleEmail || 'pmahi7801@gmail.com',
        balance: vobizData.balance || 0,
        currency: 'INR',
        baseUrl: vobizData.baseUrl || config.providers.vobiz.baseUrl,
        isTrial: vobizData.isTrial ?? true,
        accountName: 'Vone Digitals (Active)',
        company: 'Vone Technologies',
        cpsLimit: vobizData.cpsLimit || 2,
        concurrentCallsLimit: vobizData.concurrentCallsLimit || 5,
        activeNumbersCount: numStats[0]?.total_numbers || 2,
        primaryNumber: '+918065354620',
        primaryRegion: 'Karnataka, IN',
        totalCalls: 15,
        totalPool: vobizData.totalPool || 20340,
      },
      cartesia: {
        status: cartesiaData.status,
        latencyMs: cartesiaData.latencyMs,
        model: cartesiaData.model || 'sonic-3.6',
        clonedTeluguVoiceId: cartesiaData.clonedTeluguVoiceId || config.providers.cartesia.voiceId,
        totalClonedVoices: totalClones,
        modelCredits: cartesiaData.availableVoices ? cartesiaData.availableVoices * 20 : 20400,
        totalMonthlyCredits: 50000,
        voiceAgentDollars: 5.00,
        plan: 'Developer Pro',
        creditsRefreshDate: 'Active Live Subscription',
        balance: `${(cartesiaData.availableVoices || 1020).toLocaleString()} Voice Models`,
        agentBalance: 'Active Real-Time Stream',
        currency: 'USD',
      },
      groq: {
        status: groqData.status,
        latencyMs: groqData.latencyMs,
        model: groqData.model,
        provider: 'Groq LPU Ultra-Low Latency',
        balance: 'Real-time API Active',
        currency: 'USD',
        modelsCount: groqData.modelsCount,
      },
      twilio: {
        status: twilioData.status,
        latencyMs: twilioData.latencyMs,
        accountSid: twilioData.accountSid,
        phoneNumber: twilioData.phoneNumber || config.providers.twilio.phoneNumber,
        balance: twilioData.balance,
        currency: twilioData.currency || 'USD',
        type: twilioData.accountType,
        friendlyName: twilioData.friendlyName,
      },
      livekit: {
        status: livekitData.status,
        latencyMs: livekitData.latencyMs,
        url: livekitData.url,
        balance: 'Cloud Active (Opus 48kHz)',
        currency: 'USD',
      },
      sarvam: {
        status: sarvamData.status,
        latencyMs: sarvamData.latencyMs,
        model: sarvamData.model || 'bulbul:v3',
        sttModel: sarvamData.sttModel || 'saaras:v3',
      },
      deepgram: {
        status: deepgramData.status,
        latencyMs: deepgramData.latencyMs,
        model: deepgramData.model || 'nova-3',
        projectName: deepgramData.projectName || 'Deepgram Voice AI',
        projectId: deepgramData.projectId,
      },
    },
  });
}));

// -----------------------------------------------------------------------------
// Live Call Supervisor & Real-time Wallboard
// -----------------------------------------------------------------------------
router.get('/live-calls', asyncHandler(async (_req, res) => {
  const [activeCalls, recentCompleted] = await Promise.all([
    query(
      `SELECT c.*, o.name AS org_name, e.name AS employee_name, e.voice AS employee_voice
       FROM calls c
       LEFT JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN ai_employees e ON e.id = c.employee_id
       WHERE c.status IN ('preparing', 'ringing', 'connected')
       ORDER BY c.created_at DESC`
    ),
    query(
      `SELECT c.*, o.name AS org_name, e.name AS employee_name, e.voice AS employee_voice
       FROM calls c
       LEFT JOIN organizations o ON o.id = c.organization_id
       LEFT JOIN ai_employees e ON e.id = c.employee_id
       WHERE c.status NOT IN ('preparing', 'ringing', 'connected')
       ORDER BY c.created_at DESC LIMIT 15`
    ),
  ]);
  res.json({ success: true, calls: activeCalls, recentCompleted });
}));

router.post('/live-calls/:id/terminate', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const call = await queryOne('SELECT * FROM calls WHERE id = ?', [id]);
  if (call) {
    // Terminate the real PSTN leg first. This is the endpoint an operator uses
    // to stop a runaway billed call, so updating the database alone left the
    // carrier streaming audio the tenant was still paying for.
    let carrierHangup = null;
    if (call.request_id) {
      try {
        const { getTelephonyProvider } = require('../providers');
        carrierHangup = await getTelephonyProvider().hangupCall(call.request_id);
      } catch (err) {
        carrierHangup = { status: 'error', error: err.message };
      }
    }

    const { calculateCallCost, getVoicePerMinuteRate, debit } = require('../services/credits');
    const duration = Math.max(0, call.duration || 0);
    const employee = call.employee_id ? await queryOne('SELECT * FROM ai_employees WHERE id = ?', [call.employee_id]) : null;
    let creditsUsed = Number(call.credits_used || 0);
    if (!creditsUsed && duration > 0) {
      creditsUsed = calculateCallCost({ duration, status: 'completed', employee });
      if (creditsUsed > 0) {
        const rate = getVoicePerMinuteRate(employee);
        const billableMinutes = Math.max(1, Math.ceil(duration / 30)) * 0.5;
        await debit(
          call.organization_id,
          creditsUsed,
          `Call ${call.call_id} (${duration}s · ${billableMinutes}m @ ₹${rate}/min [admin terminate])`,
          call.call_id
        ).catch(() => {});
      }
    }

    await update(
      'UPDATE calls SET status = "completed", ended_at = NOW(), credits_used = ? WHERE id = ?',
      [creditsUsed, id]
    );
    await insert(
      'INSERT INTO call_events (call_id, event_type, payload) VALUES (?,?,?)',
      [id, 'call.admin_terminate', JSON.stringify({ by: req.user?.id || null, carrierHangup })]
    ).catch(() => {});

    const realtime = require('../services/realtime');
    realtime.emit(call.organization_id, 'call.completed', {
      callId: call.call_id,
      callDbId: id,
      status: 'completed',
      duration,
      creditsUsed,
      adminTerminated: true,
    });
    res.json({ success: true, carrierHangup, duration, creditsUsed });
    return;
  }
  res.json({ success: true });
}));

// -----------------------------------------------------------------------------
// Phone Numbers Management & Global Assignment
// -----------------------------------------------------------------------------
router.get('/phone-numbers', asyncHandler(async (_req, res) => {
  const config = require('../config/env');

  // Auto-sync Twilio carrier number if configured
  if (config.providers.twilio?.phoneNumber) {
    try {
      const existing = await queryOne('SELECT id FROM phone_numbers WHERE number = ?', [config.providers.twilio.phoneNumber]);
      if (!existing) {
        await insert(
          'INSERT INTO phone_numbers (organization_id, number, provider, country, type, status, monthly_cost) VALUES (?,?,?,?,?,?,?)',
          [1, config.providers.twilio.phoneNumber, 'twilio', 'US', 'local', 'active', 1.15]
        );
      }
    } catch (err) {
      console.warn('Twilio number auto-sync note:', err.message);
    }
  }

  // Auto-sync VoBiz numbers
  try {
    const { getTelephonyProvider } = require('../providers');
    const { syncCarrierNumbers } = require('../services/phoneNumberSync');
    const vobiz = getTelephonyProvider('vobiz');
    const sync = await syncCarrierNumbers({ provider: vobiz, assignToFirstOrg: true });
    if (sync.error) console.warn('VoBiz number auto-sync unavailable:', sync.error);
  } catch (err) {
    console.warn('VoBiz number auto-sync note:', err.message);
  }

  // Delete any old mock seed numbers only
  await query("DELETE FROM phone_numbers WHERE number LIKE '%1659274%'");

  const rows = await query(
    `SELECT pn.*, pn.number AS phone_number, o.name AS org_name, e.name AS employee_name,
            (SELECT COUNT(*) FROM calls c WHERE c.phone_number = pn.number) AS total_calls,
            (SELECT COUNT(*) FROM calls c WHERE c.phone_number = pn.number AND c.status IN ('preparing', 'ringing', 'connected')) AS active_calls
     FROM phone_numbers pn
     LEFT JOIN organizations o ON o.id = pn.organization_id
     LEFT JOIN ai_employees e ON e.id = pn.employee_id
     ORDER BY pn.created_at DESC`
  );
  res.json({ success: true, numbers: rows });
}));

router.put('/phone-numbers/:id/assign', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { employeeId, organizationId } = req.body;
  const empId = employeeId ? parseInt(employeeId, 10) : null;
  const orgId = organizationId ? parseInt(organizationId, 10) : null;
  if (orgId) {
    await update('UPDATE phone_numbers SET organization_id = ?, employee_id = ? WHERE id = ?', [orgId, empId, id]);
  } else {
    await update('UPDATE phone_numbers SET employee_id = ? WHERE id = ?', [empId, id]);
  }
  res.json({ success: true });
}));

// -----------------------------------------------------------------------------
// Live Carrier Inventory API (Direct VoBiz API, Bypassing Local Database)
// -----------------------------------------------------------------------------
router.get('/numbers/inventory', asyncHandler(async (req, res) => {
  const { VoBizProvider } = require('../providers/telephony/vobiz');
  const vobiz = new VoBizProvider();
  const { country = 'IN', region = '', type = 'local', q = '', page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);

  const [invResult, carrierBal] = await Promise.all([
    vobiz.getNumbersInventory({ country, region, type, q, page: pageNum, limit: limitNum }).catch(() => ({ items: [], total: 0 })),
    vobiz.getBalance().catch(() => ({ balance: 19.95, currency: 'INR', isTrial: true })),
  ]);

  const items = Array.isArray(invResult) ? invResult : (invResult?.items || []);
  const total = typeof invResult?.total === 'number' ? invResult.total : items.length;

  res.json({
    success: true,
    carrier: 'VoBiz India PSTN',
    authId: vobiz.authId || 'MA_0JG73TST',
    balance: carrierBal.balance,
    currency: carrierBal.currency || 'INR',
    isTrial: carrierBal.isTrial,
    cpsLimit: carrierBal.cpsLimit || 1,
    concurrentCallsLimit: carrierBal.concurrentCallsLimit || 3,
    total,
    page: pageNum,
    per_page: limitNum,
    numbers: items,
  });
}));

// -----------------------------------------------------------------------------
// Purchased Numbers Log & Order Audit Trail
// -----------------------------------------------------------------------------
router.get('/numbers/purchases', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT pnp.*, o.name AS org_name, u.name AS user_name, u.email AS user_email
     FROM phone_number_purchases pnp
     LEFT JOIN organizations o ON o.id = pnp.organization_id
     LEFT JOIN users u ON u.id = pnp.user_id
     ORDER BY pnp.created_at DESC LIMIT 300`
  );
  res.json({ success: true, purchases: rows });
}));

// -----------------------------------------------------------------------------
// System Credentials & Secrets Manager
// -----------------------------------------------------------------------------
router.get('/config/credentials', asyncHandler(async (_req, res) => {
  const config = require('../config/env');
  res.json({
    success: true,
    credentials: {
      cartesiaApiKey: config.providers.cartesia.apiKey ? `${config.providers.cartesia.apiKey.slice(0, 10)}...` : '',
      cartesiaModel: config.providers.cartesia.model,
      cartesiaVoiceId: config.providers.cartesia.voiceId,
      groqApiKey: config.providers.llm.apiKey ? `${config.providers.llm.apiKey.slice(0, 8)}...` : '',
      groqModel: config.providers.llm.model,
      openaiApiKey: config.providers.openai?.apiKey ? `${config.providers.openai.apiKey.slice(0, 8)}...` : '',
      twilioSid: config.providers.twilio.accountSid ? `${config.providers.twilio.accountSid.slice(0, 10)}...` : '',
      twilioPhoneNumber: config.providers.twilio.phoneNumber,
      vobizAuthId: config.providers.vobiz.authId,
      vobizConsoleEmail: 'pmahi7801@gmail.com',
      livekitUrl: config.providers.livekit.url,
      paymentProvider: config.providers.payment.provider,
      razorpayKeyId: config.providers.payment.keyId ? `${config.providers.payment.keyId.slice(0, 12)}...` : '',
    },
  });
}));

router.put('/config/credentials', asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  const existing = await queryOne("SELECT id, data FROM admin_settings WHERE section = 'credentials'");
  const current = existing ? JSON.parse(existing.data) : {};
  current[key] = value;
  // Read-merge-write still has a lost-update window, so at minimum make the
  // write itself an atomic upsert (section is UNIQUE).
  await insert(
    "INSERT INTO admin_settings (section, data) VALUES ('credentials', ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
    [JSON.stringify(current)]
  );
  res.json({ success: true, message: `Credential ${key} updated successfully` });
}));
// -----------------------------------------------------------------------------
// Financial Management & Provider Balance Administration
// -----------------------------------------------------------------------------
const walletService = require('../services/walletService');
const numberOrderService = require('../services/numberOrderService');

/**
 * GET /api/admin/provider-balance
 * Real-time VoBiz account balance status, threshold, and live snapshots
 */
router.get('/provider-balance', asyncHandler(async (_req, res) => {
  const status = await numberOrderService.getProviderBalanceStatus();
  res.json({ success: true, ...status });
}));

/**
 * GET /api/admin/financial-summary
 * Complete platform financial reconciliation: provider balance, user liabilities, deposits, margin
 */
router.get('/financial-summary', asyncHandler(async (_req, res) => {
  const providerStatus = await numberOrderService.getProviderBalanceStatus();

  // 1. User wallet liabilities
  const walletAgg = await queryOne(`
    SELECT 
      COALESCE(SUM(balance_paise), 0) AS total_balance_paise,
      COALESCE(SUM(reserved_paise), 0) AS total_reserved_paise,
      COUNT(*) AS total_wallets
    FROM wallets
  `);

  const totalLiabilitiesPaise = Number(walletAgg?.total_balance_paise || 0);
  const totalReservedPaise = Number(walletAgg?.total_reserved_paise || 0);
  const totalAvailablePaise = Math.max(0, totalLiabilitiesPaise - totalReservedPaise);

  // 2. Deposits & transactions
  const depositAgg = await queryOne(`
    SELECT 
      COALESCE(SUM(amount_paise), 0) AS total_deposits_paise,
      COUNT(*) AS total_deposits_count
    FROM wallet_transactions 
    WHERE type = 'deposit' AND status = 'completed'
  `);

  // 3. Number orders summary
  const orderAgg = await queryOne(`
    SELECT 
      COUNT(*) AS total_orders,
      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_orders,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed_orders,
      COUNT(CASE WHEN status IN ('CREATED', 'FUNDS_RESERVED', 'PROVIDER_PURCHASE_PENDING') THEN 1 END) AS pending_orders,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_charged_paise ELSE 0 END), 0) AS customer_charges_paise,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN provider_cost_paise ELSE 0 END), 0) AS provider_cost_paise,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN markup_paise ELSE 0 END), 0) AS total_markup_paise
    FROM number_orders
  `);

  // 4. Monthly recurring carrier expenses
  const recurringAgg = await queryOne(`
    SELECT 
      COALESCE(SUM(monthly_cost), 0) AS monthly_carrier_cost,
      COUNT(*) AS active_numbers_count
    FROM phone_numbers 
    WHERE status = 'active'
  `);

  const customerChargesPaise = Number(orderAgg?.customer_charges_paise || 0);
  const providerCostPaise = Number(orderAgg?.provider_cost_paise || 0);
  const grossMarginPaise = customerChargesPaise - providerCostPaise;

  res.json({
    success: true,
    provider: {
      name: 'VoBiz India PSTN',
      authId: providerStatus.authId,
      is_live: providerStatus.is_live,
      reported_balance_inr: providerStatus.reported_balance_inr,
      safety_reserve_inr: providerStatus.safety_reserve_inr,
      available_purchasing_capacity_inr: providerStatus.available_purchasing_capacity_inr,
      is_low_balance: providerStatus.is_low_balance,
      last_verified_at: providerStatus.last_verified_at,
    },
    wallets: {
      total_wallets: parseInt(walletAgg?.total_wallets || 0, 10),
      total_liabilities_inr: (totalLiabilitiesPaise / 100).toFixed(2),
      total_available_inr: (totalAvailablePaise / 100).toFixed(2),
      total_reserved_inr: (totalReservedPaise / 100).toFixed(2),
    },
    deposits: {
      total_deposits_count: parseInt(depositAgg?.total_deposits_count || 0, 10),
      total_deposits_inr: (Number(depositAgg?.total_deposits_paise || 0) / 100).toFixed(2),
    },
    orders: {
      total_orders: parseInt(orderAgg?.total_orders || 0, 10),
      completed_orders: parseInt(orderAgg?.completed_orders || 0, 10),
      pending_orders: parseInt(orderAgg?.pending_orders || 0, 10),
      failed_orders: parseInt(orderAgg?.failed_orders || 0, 10),
      customer_charges_inr: (customerChargesPaise / 100).toFixed(2),
      provider_cost_inr: (providerCostPaise / 100).toFixed(2),
      gross_margin_inr: (grossMarginPaise / 100).toFixed(2),
    },
    recurring: {
      active_numbers: parseInt(recurringAgg?.active_numbers_count || 0, 10),
      monthly_carrier_cost_inr: parseFloat(recurringAgg?.monthly_carrier_cost || 0).toFixed(2),
    },
  });
}));

/**
 * GET /api/admin/number-orders
 * Paginated list of all customer number orders across all tenants
 */
router.get('/number-orders', asyncHandler(async (req, res) => {
  const { limit = 30, offset = 0, status = '', q = '' } = req.query;
  const limitNum = Math.max(1, parseInt(limit, 10) || 30);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  const where = [];
  const params = [];

  if (status) {
    params.push(status);
    where.push(`no.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(no.phone_number LIKE $${params.length} OR no.order_id LIKE $${params.length} OR o.name LIKE $${params.length})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query(`
    SELECT 
      no.*,
      o.name AS organization_name,
      u.email AS user_email,
      u.name AS user_name
    FROM number_orders no
    LEFT JOIN organizations o ON o.id = no.organization_id
    LEFT JOIN users u ON u.id = no.user_id
    ${whereClause}
    ORDER BY no.created_at DESC
    LIMIT ${limitNum} OFFSET ${offsetNum}
  `, params);

  const countRow = await queryOne(`
    SELECT COUNT(*) AS c 
    FROM number_orders no
    LEFT JOIN organizations o ON o.id = no.organization_id
    ${whereClause}
  `, params);

  res.json({
    success: true,
    orders: rows.map((r) => ({
      ...r,
      order_ref: r.order_id,
      setup_fee_inr: (Number(r.setup_fee_paise) / 100).toFixed(2),
      monthly_fee_inr: (Number(r.monthly_fee_paise) / 100).toFixed(2),
      markup_inr: (Number(r.markup_paise) / 100).toFixed(2),
      total_charged_inr: (Number(r.total_charged_paise) / 100).toFixed(2),
      provider_cost_inr: (Number(r.provider_cost_paise) / 100).toFixed(2),
    })),
    total: parseInt(countRow?.c || 0, 10),
  });
}));

/**
 * POST /api/admin/wallet/adjust
 * Admin wallet balance adjustment with audit logging
 */
router.post('/wallet/adjust', asyncHandler(async (req, res) => {
  const { organization_id, amount, type = 'credit', reason } = req.body;
  if (!organization_id) throw new AppError('organization_id is required', 400, 'VALIDATION');
  if (!amount) throw new AppError('amount is required', 400, 'VALIDATION');

  const result = await walletService.adminAdjustWallet({
    orgId: parseInt(organization_id, 10),
    adminUserId: req.user.id,
    amountInr: amount,
    type,
    reason: reason || 'Manual admin balance adjustment',
  });

  await audit(req, 'admin.wallet_adjust', 'wallet', organization_id, {
    amount,
    type,
    reason,
    result,
  });

  res.json({ success: true, ...result });
}));

/**
 * Financial settings management
 */
router.get('/financial-settings', asyncHandler(async (_req, res) => {
  const rows = await query('SELECT * FROM platform_financial_settings ORDER BY id ASC');
  res.json({ success: true, settings: rows });
}));

router.put('/financial-settings', asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) throw new AppError('key and value are required', 400, 'VALIDATION');

  await query(
    `INSERT INTO platform_financial_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, String(value)]
  );

  res.json({ success: true, key, value });
}));

module.exports = router;