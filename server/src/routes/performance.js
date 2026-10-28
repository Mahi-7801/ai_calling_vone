const express = require('express');
const { query, queryOne } = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { requireOrg } = require('../middleware/auth');

const router = express.Router();
router.use(requireOrg);

// One broken sub-query used to 500 the whole endpoint, which blanked every panel on
// the dashboard at once and read as "no data anywhere". Each block now degrades to
// an empty default and names itself in `errors`, so a single bad query costs only
// its own panel. Connection failures still throw, because then nothing will work.
function makeSafeRunner() {
  const errors = new Set();

  const run = async (label, fn, fallback) => {
    try {
      return await fn();
    } catch (err) {
      if (err?.code === 'DB_UNAVAILABLE') throw err;
      console.error(`[performance] ${label} failed: ${err.message}`);
      errors.add(label);
      return fallback;
    }
  };

  return {
    errors,
    rows: (label, sql, params, fallback = []) => run(label, () => query(sql, params), fallback),
    one: (label, sql, params, fallback = null) => run(label, () => queryOne(sql, params), fallback),
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user.organization_id;
  // Optional per-employee view, used by the employee workspace Overview tab.
  // Scoped to the org so a caller cannot read another tenant's numbers.
  const employeeId = parseInt(req.query.employee_id, 10);
  const scopeEmployee = Number.isInteger(employeeId) && employeeId > 0 ? employeeId : null;
  const empFilter = scopeEmployee ? ' AND employee_id = ?' : '';
  const empParam = scopeEmployee ? [orgId, scopeEmployee] : [orgId];
  // Leads queries must qualify columns with `l` because some of them JOIN calls.
  // Match either directly assigned leads or leads contacted by this employee's calls.
  const leadEmpFilter = scopeEmployee
    ? ' AND (l.employee_id = ? OR l.id IN (SELECT c.lead_id FROM calls c WHERE c.employee_id = ? AND c.lead_id IS NOT NULL))'
    : '';
  const leadEmpParam = scopeEmployee ? [orgId, scopeEmployee, scopeEmployee] : [orgId];
  const db = makeSafeRunner();

  const totals = await db.one('totals',
    `SELECT COUNT(*) AS total_calls,
       SUM(CASE WHEN status IN ('ringing','connected') THEN 1 ELSE 0 END) AS answered_calls,
       SUM(CASE WHEN status = 'completed' AND duration > 0 THEN 1 ELSE 0 END) AS completed_calls,
       SUM(CASE WHEN status IN ('failed','busy','no_answer','wrong_number') THEN 1 ELSE 0 END) AS failed_calls,
       IFNULL(ROUND(AVG(CASE WHEN status='completed' THEN duration END)),0) AS avg_duration,
       SUM(CASE WHEN outcome IN ('interested','converted') THEN 1 ELSE 0 END) AS interested,
       SUM(CASE WHEN outcome IN ('interested','converted') THEN 1 ELSE 0 END) / GREATEST(1, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)) AS conversion,
       IFNULL(SUM(credits_used),0) AS credits_used,
       SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS calls_today,
       SUM(CASE WHEN DATE(created_at) = CURDATE() AND outcome IN ('interested','converted') THEN 1 ELSE 0 END) AS qualified_today,
       SUM(CASE WHEN outcome IN ('interested','converted','callback') AND COALESCE(next_action,'') <> '' THEN 1 ELSE 0 END) AS hot_leads
      FROM calls WHERE organization_id = ?${empFilter}`, empParam, {});

  // Median-ish "speed to lead": seconds between a call row being created and
  // the call being answered, averaged over calls that were answered.
  // GREATEST(0, ...) clamps rows written before the UTC/local fix, where
  // answered_at landed hours before created_at and dragged the average negative.
  const speedRow = await db.one('speedRow',
    `SELECT COALESCE(ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (answered_at - created_at))))), 0) AS avg_speed_seconds
      FROM calls
     WHERE organization_id = ?${empFilter} AND answered_at IS NOT NULL
       AND answered_at >= created_at
       AND answered_at <= (created_at + INTERVAL '1 hour')`, empParam, {});

  // The Overview tab's "Leads today" / "Qualified" / "Hot leads" cards count leads,
  // not calls, so they come off the leads table.
  const leadsRow = await db.one('leadsRow',
    `SELECT COUNT(*) AS leads_total,
       SUM(CASE WHEN DATE(l.created_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS leads_today,
       SUM(CASE WHEN DATE(l.created_at) = CURRENT_DATE AND (l.outcome IN ('interested','converted')
            OR l.status IN ('interested','callback_requested','converted')) THEN 1 ELSE 0 END) AS qualified_today,
       SUM(CASE WHEN l.outcome IN ('interested','converted')
            OR l.status IN ('interested','callback_requested','converted') THEN 1 ELSE 0 END) AS qualified_total,
       SUM(CASE WHEN l.status IN ('interested','callback_requested','follow_up') THEN 1 ELSE 0 END) AS hot_leads
      FROM leads l WHERE l.organization_id = ?${leadEmpFilter}`,
    leadEmpParam, {});

  // Yesterday, so the cards can show a real day-over-day delta instead of a bare number.
  const yesterdayRow = await db.one('yesterdayRow',
    `SELECT
       SUM(CASE WHEN DATE(l.created_at) = (CURRENT_DATE - INTERVAL '1 day') THEN 1 ELSE 0 END) AS leads_yesterday,
       SUM(CASE WHEN DATE(l.created_at) = (CURRENT_DATE - INTERVAL '1 day')
          AND (l.outcome IN ('interested','converted') OR l.status IN ('interested','callback_requested','converted'))
        THEN 1 ELSE 0 END) AS qualified_yesterday
      FROM leads l WHERE l.organization_id = ?${leadEmpFilter}`, leadEmpParam, {});

  // True speed to lead: lead submitted -> that lead's call answered. Falls back to
  // the call-only number above when leads have not been linked to calls yet.
  // Capped at one hour: a lead that sat for days and was only reached on a later
  // retry is a stale lead, not a speed-to-lead measurement, and including it
  // dragged the average into the hundreds of thousands of seconds.
  const leadSpeedRow = await db.one('leadSpeedRow',
    `SELECT COALESCE(ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (c.answered_at - l.created_at))))), 0) AS avg_speed_seconds
      FROM leads l JOIN calls c ON (c.id = l.last_call_id OR (c.lead_id = l.id AND c.answered_at IS NOT NULL))
      WHERE l.organization_id = ?${leadEmpFilter} AND c.answered_at IS NOT NULL
        AND c.answered_at >= l.created_at
        AND c.answered_at <= (l.created_at + INTERVAL '1 hour')`,
    leadEmpParam, {});

  function buildDaySeries(rows, days = 14, valKeys = ['calls', 'minutes']) {
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

  const perDayRows = await db.rows('perDay',
    `SELECT DATE(created_at) AS day, COUNT(*) AS calls,
       IFNULL(ROUND(SUM(duration)/60,1),0) AS minutes
     FROM calls WHERE organization_id = ?${empFilter} AND created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
     GROUP BY DATE(created_at) ORDER BY day ASC`, empParam
  );
  const perDay = buildDaySeries(perDayRows, 14, ['calls', 'minutes']);

  const employeeComparisonRaw = scopeEmployee
    ? []
    : await db.rows('employeeComparison',
      `SELECT e.id, e.name, e.role, e.status,
         COUNT(c.id) AS calls,
         SUM(CASE WHEN c.status='completed' AND c.duration>0 THEN 1 ELSE 0 END) AS successful,
         IFNULL(ROUND(AVG(CASE WHEN c.status='completed' THEN c.duration END)),0) AS avg_duration,
         SUM(CASE WHEN c.outcome IN ('interested','converted') THEN 1 ELSE 0 END) AS interested
       FROM ai_employees e
       LEFT JOIN calls c ON c.employee_id = e.id
       WHERE e.organization_id = ?
       GROUP BY e.id ORDER BY calls DESC`, [orgId]
    );

  const employeeComparison = employeeComparisonRaw.map((e) => {
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

  // The two lists behind the "Hot leads" and "Needs attention" quick actions, so
  // those buttons show the leads they claim to instead of doing nothing.
  const hotLeadList = await db.rows('hotLeadList',
    `SELECT l.id, l.name, l.phone, l.status, l.outcome, l.company, l.location, l.created_at
       FROM leads l
      WHERE l.organization_id = ?${leadEmpFilter}
        AND l.status IN ('interested','callback_requested','follow_up')
      ORDER BY (CASE l.status WHEN 'interested' THEN 1 WHEN 'callback_requested' THEN 2 WHEN 'follow_up' THEN 3 ELSE 4 END), l.created_at DESC
      LIMIT 6`, leadEmpParam
  );

  const needsAttentionList = await db.rows('needsAttentionList',
    `SELECT l.id, l.name, l.phone, l.status, l.created_at,
            (SELECT c.outcome FROM calls c WHERE c.lead_id = l.id ORDER BY c.id DESC LIMIT 1) AS last_outcome,
            (SELECT c.status FROM calls c WHERE c.lead_id = l.id ORDER BY c.id DESC LIMIT 1) AS last_call_status
       FROM leads l
      WHERE l.organization_id = ?${leadEmpFilter}
        AND (l.status = 'new' OR EXISTS (
              SELECT 1 FROM calls c WHERE c.lead_id = l.id
                AND c.status IN ('failed','busy','no_answer')
                AND c.outcome IS NULL))
      ORDER BY l.created_at ASC LIMIT 6`, leadEmpParam
  );

  const outcomeDistribution = await db.rows('outcomeDistribution',
    `SELECT outcome, COUNT(*) AS c FROM calls
     WHERE organization_id = ?${empFilter} AND outcome IS NOT NULL GROUP BY outcome`, empParam
  );

  const OUTCOME_LABELS = {
    interested: 'Interested',
    not_interested: 'Not Interested',
    follow_up: 'Follow Up',
    callback: 'Callback',
    converted: 'Converted',
    dnd: 'DND',
    wrong_number: 'Wrong Number',
    no_answer: 'No Answer',
    busy: 'Busy',
    failed: 'Failed',
  };

  const outcomeTotal = outcomeDistribution.reduce((s, o) => s + Number(o.c || 0), 0);
  const outcomes = outcomeDistribution
    .map((o) => ({
      outcome: o.outcome,
      label: OUTCOME_LABELS[o.outcome] || o.outcome,
      c: Number(o.c || 0),
      percent: outcomeTotal ? Math.round((Number(o.c || 0) / outcomeTotal) * 100) : 0,
    }))
    .sort((a, b) => b.c - a.c);

  const leadSpeed = Number(leadSpeedRow?.avg_speed_seconds || 0);
  const fallbackSpeed = Number(speedRow?.avg_speed_seconds || 0);
  const effectiveSpeed = leadSpeed > 0 ? leadSpeed : (fallbackSpeed > 0 ? fallbackSpeed : null);

  // If leadsRow returned 0 leads because no separate lead record was created,
  // fall back to the call totals so all employees with call activity show their real numbers
  const leadsTotal = Number(leadsRow?.leads_total || 0) || Number(totals?.total_calls || 0);
  const leadsToday = Number(leadsRow?.leads_today || 0) || Number(totals?.calls_today || 0);
  const qualifiedTotal = Number(leadsRow?.qualified_total || 0) || Number(totals?.interested || 0);
  const qualifiedToday = Number(leadsRow?.qualified_today || 0) || Number(totals?.qualified_today || 0);
  const hotLeads = Number(leadsRow?.hot_leads || 0) || Number(totals?.hot_leads || 0);

  res.json({
    success: true,
    performance: {
      totals: totals || { total_calls: 0 },
      leads: {
        leads_today: leadsToday,
        qualified_today: qualifiedToday,
        qualified_total: qualifiedTotal,
        hot_leads: hotLeads,
        leads_total: leadsTotal,
        leads_yesterday: Number(yesterdayRow?.leads_yesterday || 0),
        qualified_yesterday: Number(yesterdayRow?.qualified_yesterday || 0),
      },
      hotLeadList,
      needsAttentionList,
      perDay,
      employeeComparison,
      outcomeDistribution: outcomes,
      outcomeTotal,
      // Effective speed: preferred lead-to-answer speed, falling back to call duration to answer
      speedToLeadSeconds: effectiveSpeed,
      speedToLeadFallbackSeconds: fallbackSpeed > 0 ? fallbackSpeed : null,
      employeeId: scopeEmployee,
      // Non-empty only when a sub-query failed, so the UI can say "this panel is
      // unavailable" instead of rendering a confident all-zeros.
      errors: [...db.errors],
    },
  });
}));

module.exports = router;