const config = require('../config/env');
const { insert } = require('../config/db');

/**
 * Format phone number to international E.164 without spaces/dashes
 */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[\s\-\(\)]/g, '');
  if (!p.startsWith('+')) {
    if (p.length === 10) {
      p = `+91${p}`;
    } else {
      p = `+${p}`;
    }
  }
  return p;
}

/**
 * Send WhatsApp follow-up message after a call
 */
async function sendFollowUp({ to, employeeName = 'Charan', outcome = 'interested', summary = '', nextAction = '' }) {
  const targetPhone = normalizePhone(to);
  const twilio = config.providers.twilio;

  const defaultMessage = `*నమస్కారం! Vone Digitals నుండి ధన్యవాదాలు.* 🙏

మా AI కన్సల్టెంట్ *${employeeName}* గారితో మీరు మాట్లాడినందుకు చాలా సంతోషం. 

📌 *మీ కాల్ సారాంశం:*
${summary || 'వెబ్ డెవలప్‌మెంట్ మరియు వాట్సాప్ CRM సేవలపై చర్చించబడింది.'}

💼 *మా పాపులర్ ప్యాకేజీలు:*
• *స్టార్టర్ బిజినెస్ వెబ్‌సైట్:* ₹15,000/- నుండి
• *వాట్సాప్ CRM సెటప్ & ఆటోమేషన్:* ₹9,999/-
• *కాంబో ఆఫర్ (వెబ్ + CRM):* ₹24,999/-

🚀 *తదుపరి చర్య (Next Step):*
${nextAction || 'డెమో లింక్ మరియు కొటేషన్ పిడిఎఫ్ త్వరలో మీకు పంపబడుతుంది.'}

ఏదైనా సందేహం ఉంటే ఈ నంబర్‌కి నేరుగా రిప్లై ఇవ్వండి లేదా కాల్ చేయండి!
🌐 *Website:* https://vonedigitals.com
📞 *Contact:* +91 63014 00137`;

  if (!twilio.accountSid || !twilio.authToken) {
    console.log(`[whatsapp:dev] Message to ${targetPhone}:\n${defaultMessage}`);
    return { delivered: false, dev: true, to: targetPhone };
  }

  try {
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    const auth = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64');
    const bodyParams = new URLSearchParams();
    bodyParams.append('From', fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`);
    bodyParams.append('To', `whatsapp:${targetPhone}`);
    if (process.env.TWILIO_CONTENT_SID) {
      bodyParams.append('ContentSid', process.env.TWILIO_CONTENT_SID);
      if (process.env.TWILIO_CONTENT_VARIABLES) {
        bodyParams.append('ContentVariables', process.env.TWILIO_CONTENT_VARIABLES);
      }
    } else {
      bodyParams.append('Body', defaultMessage);
    }

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      if ((data.message || '').includes('ContentSid Required')) {
        console.log('[whatsapp] Twilio requires approved WhatsApp template (ContentSid) for business-initiated outbound outside 24hr window. Configure TWILIO_CONTENT_SID in .env if needed.');
      } else {
        console.warn('[whatsapp] Twilio API warning:', data.message || res.statusText);
      }
      return { delivered: false, error: data.message, to: targetPhone };
    }

    console.log(`[whatsapp] Follow-up sent to ${targetPhone}, SID: ${data.sid}`);
    return { delivered: true, sid: data.sid, to: targetPhone };
  } catch (err) {
    console.warn('[whatsapp] Delivery exception:', err.message);
    return { delivered: false, error: err.message, to: targetPhone };
  }
}

module.exports = {
  sendFollowUp,
  normalizePhone,
};
