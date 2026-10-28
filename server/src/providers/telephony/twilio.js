const config = require('../../config/env');
const { AppError } = require('../../utils/errors');

class TwilioProvider {
  constructor() {
    this.accountSid = config.providers.twilio.accountSid;
    this.authToken = config.providers.twilio.authToken;
    this.fromNumber = config.providers.twilio.phoneNumber;
    this.baseUrl = 'https://api.twilio.com/2010-04-01';
  }

  #getAuthHeader() {
    return 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
  }

  async #uploadAudioForTwilio(text, employee = null) {
    try {
      const voiceProviderName = employee?.voice_provider || 'cartesia';
      let buffer = null;

      // Always use Cartesia if provider is cartesia or voice is custom UUID / default
      if (voiceProviderName === 'cartesia' || (employee?.voice && employee.voice.includes('-')) || !employee?.voice_provider) {
        const { CartesiaProvider } = require('../voice/cartesia');
        const cartesia = new CartesiaProvider();
        const voiceId = employee?.voice || config.providers.cartesia.voiceId || 'ca5e2caa-ba47-4096-91dd-dafc99d9086f';
        const syn = await cartesia.synthesize(text, {
          voice: voiceId,
          language: employee?.language_code || 'te',
          speed: employee?.voice_speed || 1.0,
        });
        buffer = syn.buffer;
      } else {
        const { SarvamProvider } = require('../voice/sarvam');
        const sarvam = new SarvamProvider();
        const syn = await sarvam.synthesize(text, {
          voice: employee?.voice || 'aditya',
          speed: employee?.voice_speed || 0.95,
        });
        const b64 = syn.audioUrl.replace(/^data:audio\/\w+;base64,/, '');
        buffer = Buffer.from(b64, 'base64');
      }

      if (buffer && buffer.length > 0) {
        const { storeAudio } = require('../../services/audioCache');
        const { getPublicUrl } = require('../../services/tunnelService');
        const audioId = storeAudio(buffer, 'audio/mpeg');
        const publicBase = (await getPublicUrl()) || config.frontendUrl;
        const directAudioUrl = `${publicBase}/api/telephony/audio/${audioId}.mp3`;
        console.log('[twilio] Stored zero-latency audio for Twilio:', directAudioUrl);
        return directAudioUrl;
      }
    } catch (err) {
      console.warn('[twilio] Audio pre-synthesis error:', err.message);
    }
    return null;
  }

  async makeCall({ to, from = null, employee = null, callId, callbackUrl = null }) {
    if (!this.accountSid || !this.authToken) {
      throw new AppError('Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)', 500, 'TWILIO_NOT_CONFIGURED');
    }

    // Twilio fetches the media stream from a <Stream URL> and the call status
    // from StatusCallback; both must be publicly reachable or the call is silent
    // and still billed. Refuse rather than dial a localhost URL.
    const { isTunnelAvailable, getTunnelStatus } = require('../../services/tunnelService');
    const allowLocal = String(process.env.ALLOW_LOCAL_ANSWER_URL || '').toLowerCase() === 'true';
    const hasPublic = isTunnelAvailable() || (process.env.PUBLIC_WEBHOOK_URL || '').startsWith('https://');
    if (!hasPublic && !callbackUrl && !allowLocal) {
      const t = getTunnelStatus();
      throw new AppError(
        t.rateLimited
          ? 'Cannot place calls: Cloudflare is rate limiting quick tunnels (HTTP 429), so there is no public URL for Twilio to reach. ' +
            'Calls will be silent until a tunnel is available. See server/.env.example for named-tunnel setup.'
          : 'Cannot place calls: no public tunnel URL is available, so Twilio cannot fetch the media stream. ' +
            'See server/.env.example for named-tunnel setup.',
        503,
        'NO_PUBLIC_TUNNEL'
      );
    }

    let callerId = from || this.fromNumber;
    if (!callerId) {
      try {
        const numRes = await fetch(`${this.baseUrl}/Accounts/${this.accountSid}/IncomingPhoneNumbers.json?PageSize=1`, {
          headers: { Authorization: this.#getAuthHeader() }
        });
        if (numRes.ok) {
          const numData = await numRes.json();
          if (numData.incoming_phone_numbers && numData.incoming_phone_numbers.length > 0) {
            callerId = numData.incoming_phone_numbers[0].phone_number;
            this.fromNumber = callerId;
          }
        }
      } catch (err) {
        console.warn('[twilio] Failed to auto-fetch phone number:', err.message);
      }
    }

    if (!callerId) {
      throw new AppError(
        `Twilio account ${this.accountSid} has no active phone number yet. Please go to your Twilio Console (https://console.twilio.com) and click 'Get a phone number', or add it to TWILIO_PHONE_NUMBER in server/.env`,
        400,
        'TWILIO_NO_PHONE_NUMBER'
      );
    }

    const { getPublicUrl, getPublicWsUrl } = require('../../services/tunnelService');
    const publicUrl = (await getPublicUrl()) || config.frontendUrl;

    // Prefer bidirectional <Stream> when a wss:// origin is available, because
    // only it allows the caller to interrupt the AI mid-sentence. Fall back to
    // the <Gather> flow otherwise, where the customer cannot barge in.
    const wsBase = getPublicWsUrl();
    const answerUrl = wsBase
      ? `${publicUrl}/api/telephony/twiml/stream/${encodeURIComponent(callId || 'call')}/${employee?.id || 3}`
      : `${publicUrl}/api/telephony/twiml/gather/${encodeURIComponent(callId || 'call')}/${employee?.id || 3}`;
    console.log(`[twilio] Answer URL mode: ${wsBase ? 'Stream (barge-in enabled)' : 'Gather (turn-based)'}`);

    // Normalize to E.164 format (Twilio requires +COUNTRYCODE format)
    let toNumber = String(to || '').trim().replace(/\s+/g, '');
    if (!toNumber.startsWith('+')) {
      // Indian mobile: 10 digits starting with 6-9
      if (/^[6-9]\d{9}$/.test(toNumber)) {
        toNumber = '+91' + toNumber;
      } else if (/^\d{10,12}$/.test(toNumber)) {
        // Generic: if 10 digits assume India, if already has country code just add +
        toNumber = '+' + toNumber;
      }
    }
    console.log(`[twilio] Dialing: ${toNumber} from ${callerId}`);

    const form = new URLSearchParams();
    form.append('To', toNumber);
    form.append('From', callerId);
    form.append('Url', answerUrl);

    if (publicUrl && publicUrl.startsWith('https://')) {
      form.append('StatusCallback', `${publicUrl}/api/telephony/webhook`);
      form.append('StatusCallbackEvent', 'completed');
      // NOTE: Record=true, RecordingChannels, RecordingStatusCallback are blocked on Twilio trial accounts.
      // Uncomment these after upgrading to a paid account:
      // form.append('Record', 'true');
      // form.append('RecordingStatusCallback', `${publicUrl}/api/telephony/recording-callback`);
      // form.append('RecordingStatusCallbackMethod', 'POST');
      // form.append('RecordingChannels', 'dual');
    }

    const res = await fetch(`${this.baseUrl}/Accounts/${this.accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: this.#getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new AppError(`Twilio Call Error: ${err.message || res.statusText}`, 502, 'TWILIO_ERROR');
    }

    const data = await res.json();
    let directAudioUrl = null;
    try {
      const greetingText = employee?.first_message || employee?.greeting || 'నమస్కారం అండి! నేను మీ AI అసిస్టెంట్ మాట్లాడుతున్నాను.';
      directAudioUrl = await this.#uploadAudioForTwilio(greetingText, employee);
    } catch (audioErr) {
      console.warn('[twilio] Audio pre-upload skipped:', audioErr.message);
    }

    return {
      providerCallId: data.sid,
      status: data.status || 'queued',
      audioUrl: directAudioUrl,
      raw: data,
    };
  }

  async hangupCall(callSid) {
    try {
      const form = new URLSearchParams();
      form.append('Status', 'completed');
      await fetch(`${this.baseUrl}/Accounts/${this.accountSid}/Calls/${callSid}.json`, {
        method: 'POST',
        headers: {
          Authorization: this.#getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
    } catch {}
    return { status: 'completed' };
  }

  async getCallStatus(callSid) {
    try {
      const res = await fetch(`${this.baseUrl}/Accounts/${this.accountSid}/Calls/${callSid}.json`, {
        headers: { Authorization: this.#getAuthHeader() },
      });
      if (!res.ok) return { status: 'unknown', duration: 0 };
      const data = await res.json();
      return {
        status: data.status,
        duration: parseInt(data.duration || '0', 10),
        raw: data,
      };
    } catch {
      return { status: 'unknown', duration: 0 };
    }
  }

  async listPhoneNumbers() {
    if (!this.accountSid || !this.authToken) return [];
    try {
      const res = await fetch(`${this.baseUrl}/Accounts/${this.accountSid}/IncomingPhoneNumbers.json`, {
        headers: { Authorization: this.#getAuthHeader() },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.incoming_phone_numbers || []).map((p) => ({
        number: p.phone_number,
        friendlyName: p.friendly_name,
        capabilities: p.capabilities,
        provider: 'twilio',
      }));
    } catch {
      return [];
    }
  }
}

module.exports = { TwilioProvider };
