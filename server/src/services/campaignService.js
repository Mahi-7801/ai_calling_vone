const config = require('../config/env');
const { insert, query, queryOne, update } = require('../config/db');
const { AppError } = require('../utils/errors');
const realtime = require('./realtime');
const { executeCall, getEmployeeContext } = require('./callService');
const { sendCampaignCompleteEmail } = require('./mail');
const { getWallet } = require('./credits');

let redis = null;
let Queue = null;
let Worker = null;
let queue = null;
let worker = null;

const activeCampaigns = new Map();

async function getRedis() {
  if (redis || !config.redisUrl) return redis;
  const IORedis = require('ioredis');
  redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const BullMQ = require('bullmq');
  Queue = BullMQ.Queue;
  Worker = BullMQ.Worker;
  return redis;
}

// ---- locks ----
const memoryLocks = new Map();

async function acquirePhoneLock(orgId, phone, ttlMs = 30000) {
  const key = `${orgId}:${phone}`;
  if (memoryLocks.has(key)) return false;
  memoryLocks.set(key, Date.now() + ttlMs);
  setTimeout(() => memoryLocks.delete(key), ttlMs);
  return true;
}

function releasePhoneLock(orgId, phone) {
  memoryLocks.delete(`${orgId}:${phone}`);
}

// ---- working hours check ----
function isWithinWorkingHours(campaign) {
  if (!campaign.schedule) return true;
  let sched = campaign.schedule;
  if (typeof sched === 'string') {
    try { sched = JSON.parse(sched); } catch { return true; }
  }

  const now = new Date();
  // Check day of week
  const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
  if (sched.days && Array.isArray(sched.days) && sched.days.length > 0) {
    const activeDays = sched.days.map((d) => String(d).toLowerCase().slice(0, 3));
    if (!activeDays.includes(dayName)) return false;
  }

  // Check working hours (e.g. "09:00" to "19:00")
  const start = sched.startTime || sched.working_hours_start || '09:00';
  const end = sched.endTime || sched.working_hours_end || '20:00';

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  const startMinutes = (startH || 9) * 60 + (startM || 0);
  const endMinutes = (endH || 20) * 60 + (endM || 0);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// ---- campaign lifecycle ----
async function startCampaign(orgId, campaignId) {
  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = ? AND organization_id = ?', [campaignId, orgId]);
  if (!campaign) throw new AppError('Campaign not found', 404, 'NOT_FOUND');
  if (campaign.status === 'calling') return campaign;

  await update('UPDATE campaigns SET status = "calling", started_at = NOW() WHERE id = ?', [campaignId]);
  const trigger = config.redisUrl ? processViaBullMQ : processViaMemory;
  activeCampaigns.set(campaignId, { orgId, status: 'calling', cancel: false });
  trigger(orgId, campaignId).catch((err) => console.error('[campaign] Engine error:', err));

  realtime.emit(orgId, 'campaign.started', { campaignId, name: campaign.name, status: 'calling' });
  return { ...campaign, status: 'calling' };
}

async function pauseCampaign(orgId, campaignId) {
  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = ? AND organization_id = ?', [campaignId, orgId]);
  if (!campaign) throw new AppError('Campaign not found', 404, 'NOT_FOUND');
  await update('UPDATE campaigns SET status = "paused", paused_at = NOW() WHERE id = ?', [campaignId]);
  if (activeCampaigns.has(campaignId)) activeCampaigns.get(campaignId).cancel = true;
  realtime.emit(orgId, 'campaign.paused', { campaignId, name: campaign.name });
  return { ...campaign, status: 'paused' };
}

async function getNextLeads(orgId, campaignId, limit = 10) {
  const rows = await query(
    `SELECT cl.id AS cl_id, cl.status, cl.attempt_count, l.*
     FROM campaign_leads cl
     JOIN leads l ON l.id = cl.lead_id
     WHERE cl.campaign_id = ? AND cl.status IN ('pending','retry') AND l.organization_id = ?
     ORDER BY cl.id ASC
     LIMIT ?`,
    [campaignId, orgId, limit]
  );
  return rows;
}

/**
 * Resolve how many calls this account may place at once.
 *
 * The authoritative source is the account object from GET /api/v1/auth/me,
 * which reports cps_limit (calls per second) and concurrent_calls_limit. The
 * campaign's own concurrency column is client-supplied and unbounded, so
 * without this clamp a campaign set to 500 would fire 500 simultaneous
 * POST /Call/ requests and be rejected by the carrier.
 */
async function resolveCapacity(orgId, requested) {
  const wanted = Math.max(1, Number(requested) || 3);
  let cpsLimit = null;
  let concurrentLimit = null;
  let cpsRemaining = null;

  try {
    const { getTelephonyProvider } = require('../providers');
    const account = await getTelephonyProvider().getAccountInfo();
    if (!account.error) {
      cpsLimit = Number.isFinite(account.cpsLimit) ? account.cpsLimit : null;
      concurrentLimit = Number.isFinite(account.concurrentCallsLimit) ? account.concurrentCallsLimit : null;
    }
  } catch (err) {
    console.warn('[campaign] Could not read carrier capacity, falling back to the requested concurrency:', err.message);
  }

  try {
    const wallet = await getWallet(orgId);
    if (wallet) cpsRemaining = Number.isFinite(wallet.cps_limit) ? wallet.cps_limit : null;
  } catch {
    /* wallet limits are optional */
  }

  // Never exceed what the carrier allows; when the account is prepaid the
  // effective limit is whichever of the two is smaller.
  let effective = wanted;
  const ceilings = [concurrentLimit, cpsRemaining].filter((n) => Number.isFinite(n) && n > 0);
  if (ceilings.length) effective = Math.min(effective, ...ceilings);

  return {
    effective,
    cpsLimit,
    concurrentLimit,
    cpsRemaining,
    throttled: effective < wanted,
  };
}

/**
 * Place a batch of campaign leads with a single documented bulk request.
 *
 * Vobiz accepts up to 1000 destinations in one POST, separated by `<`. Each
 * destination gets its own call_uuid, delivered on its callbacks, so the
 * matching calls rows are created up front and reconciled on the `To` field
 * by /vobiz/bulk-stream. Returns the per-lead outcome rows.
 */
async function dialBulkBatch({ orgId, campaignId, campaign, employee, leads, from }) {
  const { getTelephonyProvider } = require('../providers');
  const telephony = getTelephonyProvider();

  if (typeof telephony.makeBulkCall !== 'function') {
    throw new Error('The configured telephony provider does not support bulk dialling.');
  }

  // One calls row per destination, created before the dial so the answer
  // callback can join on the destination number.
  const rows = [];
  for (const lead of leads) {
    const { callId, row } = await createCampaignCall({ orgId, campaignId, employee, lead, from });
    rows.push({ lead, callId, row });
  }

  const result = await telephony.makeBulkCall({
    to: leads.map((l) => l.phone),
    from,
    employee,
    campaignId,
    callerName: campaign.name || employee.name,
  });

  // Store the single batch request_uuid against every row; the per-destination
  // call_uuid arrives on the callbacks and is written to carrier_call_uuid.
  for (const { row } of rows) {
    await update('UPDATE calls SET request_id = ? WHERE id = ?', [result.requestUuid, row.id]);
    await update('UPDATE campaign_leads SET status = "calling" WHERE campaign_id = ? AND lead_id = ?', [campaignId, row.lead.id]);
  }
  await update('UPDATE campaigns SET processed_leads = processed_leads + ? WHERE id = ?', [rows.length, campaignId]);

  console.log(
    `[campaign] Bulk dial fired for campaign ${campaignId}: ${result.count} destinations in one request ` +
      `(request_uuid=${result.requestUuid})`
  );

  return { rows, requestUuid: result.requestUuid, count: result.count };
}

async function processViaMemory(orgId, campaignId) {
  const state = activeCampaigns.get(campaignId);
  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = ? AND organization_id = ?', [campaignId, orgId]);
  if (!campaign) return;
  const { employee } = await getEmployeeContext(orgId, campaign.employee_id).catch(() => ({ employee: null }));
  if (!employee) {
    await update('UPDATE campaigns SET status = "failed" WHERE id = ?', [campaignId]);
    return;
  }

  const capacity = await resolveCapacity(orgId, campaign.concurrency);
  const concurrency = capacity.effective;
  if (capacity.throttled) {
    console.log(
      `[campaign] Campaign ${campaignId} requested concurrency ${campaign.concurrency}, clamped to ${concurrency} ` +
        `by carrier capacity (cps_limit=${capacity.cpsLimit}, concurrent_calls_limit=${capacity.concurrentLimit}).`
    );
    await update('UPDATE campaigns SET concurrency = ? WHERE id = ?', [concurrency, campaignId]).catch(() => {});
  }
  const maxRetries = employee.retry_attempts || 2;
  const phoneNumbers = await query('SELECT * FROM phone_numbers WHERE organization_id = ? AND status = "active"', [orgId]);
  const from = phoneNumbers[0]?.number || '+14165550177';

  // batch loop
  while (state && !state.cancel) {
    // Enforce operating hours
    if (!isWithinWorkingHours(campaign)) {
      console.log(`[campaign] Outside operating hours for campaign ${campaignId}. Pausing run until schedule window.`);
      await update('UPDATE campaigns SET status = "scheduled" WHERE id = ?', [campaignId]);
      break;
    }

    const leads = await getNextLeads(orgId, campaignId, concurrency * 3);
    if (!leads.length) break;

    const slots = leads.filter((lead) => acquirePhoneLock(orgId, lead.phone)).slice(0, concurrency);
    if (!slots.length) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // Bulk path: one documented POST /Call/ for the whole batch.
    // Falls back to the per-lead loop on any provider or transport failure so a
    // campaign is never blocked by the optimisation.
    if (slots.length > 1 && process.env.CAMPAIGN_BULK_DIAL !== 'false') {
      try {
        await dialBulkBatch({ orgId, campaignId, campaign, employee, leads: slots, from });
        slots.forEach((lead) => releasePhoneLock(orgId, lead.phone));
        // The calls are now in flight; the answer/hangup callbacks reconcile the
        // rows, so give the carrier time to ring out before pulling more.
        await new Promise((r) => setTimeout(r, Math.max(1000, slots.length * 500)));
        continue;
      } catch (bulkErr) {
        console.warn(
          `[campaign] Bulk dial failed for campaign ${campaignId} (${bulkErr.message}); retrying this batch one at a time.`
        );
      }
    }

    await Promise.all(slots.map(async (lead) => {
      try {
        const { callId, row } = await createCampaignCall({ orgId, campaignId, employee, lead, from });
        await executeCall({
          org: { id: orgId, name: campaign.name },
          employee,
          phoneNumber: lead.phone,
          from,
          campaignId,
          leadId: lead.id,
          callDbId: row.id,
          callId,
        });

        // Reaching this point means the carrier accepted the call. Its outcome
        // is reported later by the status callback, not here: executeCall
        // returns "ringing" the moment the carrier answers the REST request, so
        // treating anything other than "completed" as a failure marked every
        // lead failed while it was still ringing and immediately re-dialled it.
        // The lead stays "calling" until routes/telephony.js resolves it.
        await update(
          'UPDATE campaign_leads SET status = "calling", called_at = NOW() WHERE campaign_id = ? AND lead_id = ?',
          [campaignId, lead.id]
        );
        await update('UPDATE campaigns SET processed_leads = processed_leads + 1 WHERE id = ?', [campaignId]);
      } catch (err) {
        // Only a failed DIAL is a failure here - nothing was sent to the carrier.
        console.error(`[campaign] Lead call failed: ${lead.phone}`, err.message);
        await handleLeadRetry(campaignId, lead, maxRetries, err.message);
      } finally {
        releasePhoneLock(orgId, lead.phone);
      }
    }));

    // Leads already dialled are no longer pickable, so the loop advances on the
    // pending/retry backlog rather than waiting on outcomes.
    const cnt = await queryOne('SELECT COUNT(*) AS c FROM campaign_leads WHERE campaign_id = ? AND status IN ("pending","retry")', [campaignId]);
    if (!cnt.c) break;
    await new Promise((r) => setTimeout(r, 800));
  }

  // Campaign complete summary and notification
  const finalCamp = await queryOne('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (finalCamp && state && !state.cancel) {
    await update('UPDATE campaigns SET status = "completed", completed_at = NOW() WHERE id = ? AND status = "calling"', [campaignId]);
    activeCampaigns.delete(campaignId);
    realtime.emit(orgId, 'campaign.completed', { campaignId, name: finalCamp.name });

    // Send summary email
    const totalCalls = (finalCamp.completed_leads || 0) + (finalCamp.failed_leads || 0);
    sendCampaignCompleteEmail({
      campaignTitle: finalCamp.name,
      totalCalls: finalCamp.total_leads || totalCalls,
      completedCalls: finalCamp.completed_leads || 0,
      totalCost: 0,
    }).catch(() => {});
  }
}

async function handleLeadRetry(campaignId, lead, maxRetries, errorReason) {
  const currentAttempts = (lead.attempt_count || 0) + 1;
  if (currentAttempts < maxRetries) {
    console.log(`[campaign] Queuing lead ${lead.phone} for retry (attempt ${currentAttempts}/${maxRetries})`);
    await update(
      'UPDATE campaign_leads SET status = "retry", attempt_count = ?, last_error = ?, called_at = NOW() WHERE campaign_id = ? AND lead_id = ?',
      [currentAttempts, (errorReason || '').slice(0, 400), campaignId, lead.id]
    );
  } else {
    console.log(`[campaign] Lead ${lead.phone} exhausted max retries (${currentAttempts}/${maxRetries}). Marked failed.`);
    await update(
      'UPDATE campaign_leads SET status = "failed", attempt_count = ?, last_error = ?, called_at = NOW() WHERE campaign_id = ? AND lead_id = ?',
      [currentAttempts, (errorReason || '').slice(0, 400), campaignId, lead.id]
    );
    await update('UPDATE campaigns SET processed_leads = processed_leads + 1, failed_leads = failed_leads + 1 WHERE id = ?', [campaignId]);
  }
}

async function createCampaignCall({ orgId, campaignId, employee, lead, from }) {
  const { generateId } = require('../utils/helpers');
  const callId = generateId('call');
  const requestId = generateId('req');
  const r = await insert(
    `INSERT INTO calls (call_id, organization_id, campaign_id, employee_id, lead_id, phone_number, direction, status, request_id) VALUES (?,?,?,?,?,?,?,?,?)`,
    [callId, orgId, campaignId, employee.id, lead.id, lead.phone, 'outbound', 'preparing', requestId]
  );
  await update('UPDATE campaign_leads SET status = "calling" WHERE campaign_id = ? AND lead_id = ?', [campaignId, lead.id]);
  return { callId, row: { id: r.insertId } };
}

async function processViaBullMQ(orgId, campaignId) {
  if (!Queue || !Worker) {
    await processViaMemory(orgId, campaignId);
    return;
  }
  queue = queue || new Queue('campaigns', { connection: redis });
  await queue.add('campaign', { orgId, campaignId }, { removeOnComplete: true, attempts: 1 });
  worker = worker || new Worker('campaigns', async (job) => {
    await processViaMemory(job.data.orgId, job.data.campaignId);
  }, { connection: redis, concurrency: 3 });
}

// -----------------------------------------------------------------------------
// Background Campaign Scheduler Loop (checks every 30 seconds)
// -----------------------------------------------------------------------------
let schedulerTimer = null;

function startScheduler() {
  if (schedulerTimer) return;
  console.log('[scheduler] Campaign scheduler loop initialized (interval: 30s)');

  schedulerTimer = setInterval(async () => {
    try {
      // Find campaigns with status 'scheduled' or 'draft' that have a schedule config
      const scheduledCampaigns = await query(
        `SELECT * FROM campaigns WHERE status IN ('scheduled', 'pending') AND schedule IS NOT NULL`
      );

      for (const camp of scheduledCampaigns) {
        let sched = camp.schedule;
        if (typeof sched === 'string') {
          try { sched = JSON.parse(sched); } catch { continue; }
        }

        if (sched?.mode === 'later' || sched?.startTime) {
          if (sched?.date && new Date(sched.date).getTime() > Date.now()) {
            continue; // Not yet time to start
          }
          if (isWithinWorkingHours(camp)) {
            console.log(`[scheduler] Auto-starting scheduled campaign "${camp.name}" (ID: ${camp.id})`);
            await startCampaign(camp.organization_id, camp.id);
          }
        }
      }
    } catch (err) {
      console.warn('[scheduler] Loop warning:', err.message);
    }
  }, 30000);
}

async function stopAll() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  try {
    await worker?.close();
    await queue?.close();
  } catch {}
}

module.exports = {
  startCampaign,
  pauseCampaign,
  activeCampaigns,
  startScheduler,
  isWithinWorkingHours,
  stopAll,
};