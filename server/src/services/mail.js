const config = require('../config/env');
const { queryOne } = require('../config/db');

let transporter = null;

async function getTransporter() {
  if (!config.smtp.host) return null;
  if (transporter) return transporter;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const t = await getTransporter();
  if (!t) {
    console.log(`[mail:dev] to=${to} subject="${subject}"`);
    console.log(`[mail:dev] ${text || '(html content generated)'}`);
    return { delivered: false, dev: true };
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, html, text });
    return { delivered: true };
  } catch (err) {
    console.warn('[mail] Send failed:', err.message);
    return { delivered: false, error: err.message };
  }
}

async function sendCallSummaryEmail({ callId, duration, transcript = [], employeeName = 'Charan', to = null }) {
  let targetEmail = to;
  if (!targetEmail) {
    const owner = await queryOne('SELECT email FROM users WHERE role = "owner" ORDER BY id ASC LIMIT 1');
    targetEmail = owner?.email || 'admin@vonedigitals.com';
  }

  const subject = `Call Summary: ${callId} (${duration}s with ${employeeName})`;
  const transcriptHtml = (transcript || [])
    .map((t) => `<p><strong>${t.speaker === 'ai' ? employeeName : 'Customer'} (${t.ts}s):</strong> ${t.text}</p>`)
    .join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
      <h2 style="color: #0f172a; margin-top: 0;">Call Completed — ${callId}</h2>
      <p style="color: #475569;">Your AI Employee <strong>${employeeName}</strong> completed a call lasting <strong>${duration} seconds</strong>.</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <h4 style="margin: 0 0 8px 0; color: #1e293b;">Conversation Transcript</h4>
        ${transcriptHtml || '<p style="color: #94a3b8;">No transcript recorded.</p>'}
      </div>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Telugu AI Calling Platform · Automated Notification</p>
    </div>
  `;

  return sendMail({
    to: targetEmail,
    subject,
    html,
    text: `Call completed (${duration}s) with ${employeeName}. Transcripts recorded in dashboard.`,
  });
}

async function sendLowCreditAlert({ to = null, orgName = 'Your Organization', balance = 0 }) {
  let targetEmail = to;
  if (!targetEmail) {
    const owner = await queryOne('SELECT email FROM users WHERE role = "owner" ORDER BY id ASC LIMIT 1');
    targetEmail = owner?.email || 'admin@vonedigitals.com';
  }

  const subject = `⚠️ Low Balance Alert: ₹${Number(balance).toFixed(2)} remaining for ${orgName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #fecaca; border-radius: 8px; padding: 24px;">
      <h2 style="color: #dc2626; margin-top: 0;">Wallet Balance Alert</h2>
      <p style="color: #475569;">Your calling balance for <strong>${orgName}</strong> is running low.</p>
      <div style="background-color: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 6px; text-align: center; margin: 20px 0;">
        <span style="font-size: 14px; color: #991b1b;">Current Balance</span>
        <div style="font-size: 32px; font-weight: bold; color: #b91c1c; margin-top: 4px;">₹${Number(balance).toFixed(2)}</div>
      </div>
      <p style="color: #475569;">To prevent call disruptions on active campaigns, please recharge your wallet in the Billing section.</p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Telugu AI Calling Platform</p>
    </div>
  `;

  return sendMail({
    to: targetEmail,
    subject,
    html,
    text: `Your balance is ₹${balance}. Please recharge to ensure uninterrupted calling campaigns.`,
  });
}

async function sendCampaignCompleteEmail({ to = null, campaignTitle, totalCalls, completedCalls, totalCost }) {
  let targetEmail = to;
  if (!targetEmail) {
    const owner = await queryOne('SELECT email FROM users WHERE role = "owner" ORDER BY id ASC LIMIT 1');
    targetEmail = owner?.email || 'admin@vonedigitals.com';
  }

  const subject = `Campaign Finished: "${campaignTitle}" (${completedCalls}/${totalCalls} calls)`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
      <h2 style="color: #10b981; margin-top: 0;">Campaign Completed</h2>
      <p style="color: #475569;">Campaign <strong>"${campaignTitle}"</strong> has finished running.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 0; color: #64748b;">Total Leads Processed</td>
          <td style="padding: 8px 0; font-weight: bold; text-align: right;">${totalCalls}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 0; color: #64748b;">Answered / Completed</td>
          <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #16a34a;">${completedCalls}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Total Credits Debited</td>
          <td style="padding: 8px 0; font-weight: bold; text-align: right;">₹${Number(totalCost || 0).toFixed(2)}</td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">Telugu AI Calling Platform</p>
    </div>
  `;

  return sendMail({
    to: targetEmail,
    subject,
    html,
    text: `Campaign "${campaignTitle}" completed: ${completedCalls}/${totalCalls} calls made. Total cost: ₹${totalCost}.`,
  });
}

module.exports = {
  sendMail,
  sendCallSummaryEmail,
  sendLowCreditAlert,
  sendCampaignCompleteEmail,
};