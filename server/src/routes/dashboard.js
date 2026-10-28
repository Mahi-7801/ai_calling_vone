const express = require('express');
const { query, queryOne, update, insert } = require('../config/db');
const { asyncHandler, safeJson } = require('../utils/helpers');
const { requireOrg } = require('../middleware/auth');
const { getWallet } = require('../services/credits');
const { buildSystemPrompt } = require('../services/systemPrompt');
const { audit } = require('../services/activity');

const router = express.Router();
router.use(requireOrg);

router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const org = req.organization;

  // onboarding: complete when org has >=1 employee and a phone number
  const [employees, employeeCount, numbers, campaigns, leads, deletedRows] = await Promise.all([
    query('SELECT * FROM ai_employees WHERE organization_id = ? ORDER BY created_at DESC', [orgId]),
    query('SELECT COUNT(*) AS c FROM ai_employees WHERE organization_id = ?', [orgId]),
    query('SELECT * FROM phone_numbers WHERE organization_id = ?', [orgId]),
    query('SELECT status, COUNT(*) AS c FROM campaigns WHERE organization_id = ? GROUP BY status', [orgId]),
    query('SELECT status, COUNT(*) AS c FROM leads WHERE organization_id = ? GROUP BY status', [orgId]),
    query('SELECT employee_id FROM deleted_employees WHERE organization_id = ?', [orgId]).catch(() => []),
  ]);
  const deletedEmpSet = new Set((deletedRows || []).map((r) => String(r.employee_id)));
  const activeEmployees = employees.filter((e) => !deletedEmpSet.has(String(e.id)));

  const onboarding = {
    company_set: !!(org.name && org.business_type),
    employee_created: activeEmployees.length > 0,
    phone_configured: numbers.length > 0,
    demo_done: !req.user.first_login || false,
  };
  const done = onboarding.employee_created && onboarding.company_set;
  if (done && req.user.first_login) {
    await update('UPDATE users SET first_login = 0 WHERE id = ?', [req.user.id]);
    req.user.first_login = 0;
  }

  const counts = {};
  const __op = require('../services/outperoService');
  let __opEmployees = null;
  if (__op.isConfigured()) {
    try {
      const allOp = await __op.listEmployees();
      __opEmployees = allOp.filter((e) => !deletedEmpSet.has(String(e.id)));
    } catch {
      __opEmployees = [];
    }
  }
  counts.employees = __opEmployees ? __opEmployees.length : activeEmployees.length;
  for (const n of numbers) counts.numbers = numbers.length;
  for (const c of leads) counts[`leads_${c.status}`] = c.c;
  const campaignCounts = {};
  for (const c of campaigns) campaignCounts[c.status] = c.c;

  const stats = await queryOne(
    `SELECT COUNT(*) AS calls_today,
            COALESCE(ROUND(SUM(CASE WHEN status='completed' THEN duration END)/60,1),0) AS minutes_used,
            SUM(CASE WHEN status='completed' AND duration>0 THEN 1 ELSE 0 END) AS successful_calls,
            COALESCE(SUM(credits_used),0) AS credits_used_total
     FROM calls WHERE organization_id = ? AND DATE(created_at) = CURRENT_DATE`,
    [orgId]
  );
  const allStats = await queryOne(
    `SELECT COUNT(*) AS total_calls,
            COALESCE(SUM(CASE WHEN status='completed' AND duration>0 THEN 1 ELSE 0 END),0) AS successful_calls,
            COALESCE(ROUND(AVG(CASE WHEN status='completed' THEN duration END)),0) AS avg_duration,
            COALESCE(SUM(credits_used),0) AS credits_used_total
     FROM calls WHERE organization_id = ?`,
    [orgId]
  );

  const interestedLeads = await queryOne(
    `SELECT COUNT(*) AS c FROM leads WHERE organization_id = ? AND (outcome IN ('interested','converted') OR status IN ('interested','callback_requested'))`,
    [orgId]
  );
  const contactedLeads = await queryOne(
    `SELECT COUNT(*) AS c FROM leads WHERE organization_id = ? AND status NOT IN ('new')`,
    [orgId]
  );
  const totalLeads = await queryOne('SELECT COUNT(*) AS c FROM leads WHERE organization_id = ?', [orgId]);
  const wallet = await getWallet(orgId);

function buildDaySeries(rows, days = 7, valKeys = ['calls', 'minutes']) {
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

  // charts: calls over time (7 days)
  const callsOverTimeRows = await query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS calls, COALESCE(ROUND(SUM(duration)/60,1),0) AS minutes
     FROM calls WHERE organization_id = ? AND created_at >= (CURRENT_DATE - INTERVAL '7 days')
     GROUP BY DATE(created_at) ORDER BY day ASC`,
    [orgId]
  );
  const callsOverTime = buildDaySeries(callsOverTimeRows, 7, ['calls', 'minutes']);

  // charts: credit usage over time (7 days)
  let creditUsageRows = await query(
    `SELECT DATE(created_at) AS day, COALESCE(ROUND(SUM(amount), 2), 0) AS credits
     FROM credit_transactions
     WHERE organization_id = ? AND type = 'debit' AND created_at >= (CURRENT_DATE - INTERVAL '7 days')
     GROUP BY DATE(created_at) ORDER BY day ASC`,
    [orgId]
  );
  if (!creditUsageRows || creditUsageRows.length === 0) {
    creditUsageRows = await query(
      `SELECT DATE(created_at) AS day, COALESCE(ROUND(SUM(credits_used), 2), 0) AS credits
       FROM calls
       WHERE organization_id = ? AND created_at >= (CURRENT_DATE - INTERVAL '7 days')
       GROUP BY DATE(created_at) ORDER BY day ASC`,
      [orgId]
    );
  }
  const creditUsage = buildDaySeries(creditUsageRows, 7, ['credits']);

  const byOutcome = await query(
    `SELECT outcome, COUNT(*) AS c FROM calls WHERE organization_id = ? AND outcome IS NOT NULL GROUP BY outcome`,
    [orgId]
  );
  const employeePerfRaw = await query(
    `SELECT e.id, e.name, e.role, e.status,
       COUNT(c.id) AS calls,
       SUM(CASE WHEN c.status='completed' AND c.duration>0 THEN 1 ELSE 0 END) AS successful,
       COALESCE(ROUND(AVG(CASE WHEN c.status='completed' THEN c.duration END)),0) AS avg_duration,
       SUM(CASE WHEN c.outcome IN ('interested','converted') THEN 1 ELSE 0 END) AS interested
     FROM ai_employees e
     LEFT JOIN calls c ON c.employee_id = e.id
     WHERE e.organization_id = ?
     GROUP BY e.id, e.name, e.role, e.status ORDER BY calls DESC`,
    [orgId]
  );

  const employeePerf = employeePerfRaw.map((e) => {
    const totalCalls = Number(e.calls || 0);
    const successCalls = Number(e.successful || 0);
    return {
      id: e.id,
      name: e.name,
      role: e.role,
      status: e.status,
      calls: totalCalls,
      total: totalCalls,
      successful: successCalls,
      success: successCalls,
      avg_duration: Number(e.avg_duration || 0),
      interested: Number(e.interested || 0),
    };
  });

  const conversionPct = allStats.successful_calls && allStats.total_calls
    ? Math.round((interestedLeads.c / Math.max(1, allStats.successful_calls)) * 100)
    : 0;

  res.json({
    success: true,
    dashboard: {
      onboarding,
      stats: {
        credits: wallet.balance,
        calls_today: stats.calls_today || 0,
        minutes_used: stats.minutes_used || 0,
        successful_calls: stats.successful_calls || 0,
        total_calls: allStats.total_calls || 0,
        avg_duration: allStats.avg_duration || 0,
        credits_used_total: allStats.credits_used_total || 0,
      },
      leads: {
        total: totalLeads.c,
        contacted: contactedLeads.c,
        interested: interestedLeads.c,
        conversion_pct: conversionPct,
      },
      counts: {
        employees: employeeCount[0].c || 0,
        numbers: numbers.length,
        active_campaigns: campaignCounts.calling || 0,
        employee_perf: employeePerf,
      },
      charts: { callsOverTime, byOutcome, employeePerf, creditUsage },
      recentCalls: [],
      recentEmployees: [
        ...activeEmployees.map((e) => ({
          ...e,
          cartesia_agent_url: e.cartesia_agent_id ? `https://play.cartesia.ai/agents/${e.cartesia_agent_id}` : null,
        })),
        ...(__opEmployees ? __opEmployees.map((e) => ({
          id: e.id,
          organization_id: orgId,
          name: e.name,
          avatar_url: null,
          role: e.role,
          description: e.role,
          language: String(e.language || 'te-IN').slice(0, 2).toUpperCase() === 'TE' ? 'Telugu' : 'English',
          language_code: e.language || 'te-IN',
          status: e.status === 'active' ? 'active' : (e.status === 'paused' ? 'paused' : 'training'),
          max_call_duration: e.max_call_duration_seconds || 600,
          voice_provider: e.voice_tier === 'Value' ? 'sarvam' : 'cartesia',
          voice: e.voice_tier || 'Premium',
          voice_speed: 1,
          total_calls: 0,
          successful_calls: 0,
          avg_duration: 0,
          created_at: e.created_at,
          updated_at: e.created_at,
        })) : []),
      ].slice(0, 6),
      recentCampaigns: await query(
        `SELECT c.*, e.name AS employee_name FROM campaigns c LEFT JOIN ai_employees e ON e.id = c.employee_id
         WHERE c.organization_id = ? ORDER BY c.created_at DESC LIMIT 5`, [orgId]),
      recentLeads: await query('SELECT * FROM leads WHERE organization_id = ? ORDER BY created_at DESC LIMIT 5', [orgId]),
    },
  });
}));

router.post('/onboarding', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  const { step, data } = req.body;
  const org = req.organization;

  if (step === 1) {
    await update('UPDATE organizations SET name = ? WHERE id = ?', [data.name, orgId]);
  } else if (step === 2) {
    await update('UPDATE organizations SET business_type = ? WHERE id = ?', [data.business_type, orgId]);
  } else if (step === 3) {
    await update('UPDATE organizations SET calling_purpose = ? WHERE id = ?', [data.calling_purpose, orgId]);
  } else if (step === 4) {
    await update('UPDATE organizations SET preferred_language = ? WHERE id = ?', [data.language, orgId]);
  } else if (step === 5) {
    const { name, role, description, language, language_code, personality, instructions } = data;
    const dummy = { name, role, language, language_code: language_code || 'te-IN' };
    const system_prompt = buildSystemPrompt({ id: 0, ...dummy, personality, instructions }, org);
    const r = await insert(
      'INSERT INTO ai_employees (organization_id, name, role, description, language, language_code, personality, instructions, status, system_prompt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [orgId, name, role || 'Sales Assistant', description || null, language || 'Telugu', language_code || 'te-IN', personality || null, instructions || null, 'active', system_prompt]
    );
    return res.json({ success: true, employeeId: r.insertId });
  } else if (step === 6) {
    await update('UPDATE users SET first_login = 0 WHERE id = ?', [req.user.id]);
    req.user.first_login = 0;
  }

  await audit(req, `onboarding.step_${step}`);
  res.json({ success: true });
}));

module.exports = router;