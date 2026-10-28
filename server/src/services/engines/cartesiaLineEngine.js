const WebSocket = require('ws');
const BaseEngine = require('./baseEngine');
const config = require('../../config/env');

/**
 * CartesiaLineEngine
 *
 * Direct bridge to Cartesia's Line Agents API (play.cartesia.ai/agents) via the
 * Calls API WebSocket protocol (wss://api.cartesia.ai/agents/stream/{agent_id}).
 *
 * Uses telephony-native 8kHz mu-law audio (input_format: mulaw_8000) for zero-transcode,
 * low-latency bidirectional streaming directly with Cartesia Line hosted agents.
 */
class CartesiaLineEngine extends BaseEngine {
  constructor(options) {
    super(options);
    this.name = 'cartesia_line';
    this.cartesiaWs = null;
    this.agentId = this.employee?.cartesia_agent_id;
    this.streamId = this.session?.streamSid || `stream_${Date.now()}`;
    this.pingInterval = null;
    this.isConnected = false;
    this.isStarting = false;
    this.hasGreeted = false;
  }

  /**
   * Request short-lived token from Cartesia Agents access-token API.
   * Falls back to API key directly if access-token endpoint fails.
   */
  async getAccessToken() {
    const apiKey = config.providers.cartesia.apiKey;
    if (!apiKey) {
      throw new Error('Cartesia API key not configured');
    }

    try {
      const res = await fetch('https://api.cartesia.ai/agents/access-token', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agent_id: this.agentId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.access_token) {
          return data.access_token;
        }
      }
      console.warn(`[cartesia-line] Access token endpoint returned status ${res.status}; falling back to direct API key`);
    } catch (err) {
      console.warn(`[cartesia-line] Could not obtain access token: ${err.message}; using direct API key`);
    }

    return apiKey;
  }

  /**
   * Establish WebSocket connection to wss://api.cartesia.ai/agents/stream/{agent_id}
   */
  async start() {
    if (!this.agentId) {
      throw new Error(`Employee ${this.employee?.id} (${this.employee?.name}) has no cartesia_agent_id`);
    }

    const token = await this.getAccessToken();

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.close();
          reject(new Error(`Cartesia Line WebSocket connection timeout (8s) for agent ${this.agentId}`));
        }
      }, 8000);

      const wsUrl = `wss://api.cartesia.ai/agents/stream/${this.agentId}`;
      console.log(`[cartesia-line] Connecting to Cartesia Line Calls API -> ${wsUrl}`);

      this.cartesiaWs = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-API-Key': config.providers.cartesia.apiKey,
          'Cartesia-Version': '2026-08-14',
        },
      });

      this.cartesiaWs.on('open', () => {
        console.log(`[cartesia-line] ✓ WebSocket connected to Cartesia agent "${this.agentId}"`);
        this.isConnected = true;

        // Periodic ping keepalive every 45 seconds to prevent 180s inactivity timeout
        this.pingInterval = setInterval(() => {
          if (this.cartesiaWs?.readyState === WebSocket.OPEN) {
            try {
              this.cartesiaWs.ping();
            } catch {}
          }
        }, 45000);
        if (this.pingInterval.unref) this.pingInterval.unref();

        // Send start event to configure stream
        const streamId = this.session?.streamSid || `stream_${Date.now()}`;
        this.streamId = streamId;

        const leadName = (this.lead?.name || '').trim();
        const leadPurpose = (this.lead?.purpose || '').trim();
        const instructions = String(this.employee?.instructions || this.employee?.system_prompt || '').trim();
        const greeting = String(this.employee?.greeting || this.employee?.welcome_message || '').trim();

        const startPayload = {
          event: 'start',
          stream_id: streamId,
          config: {
            input_format: 'mulaw_8000',
            output_format: 'mulaw_8000',
          },
          agent: {
            system_prompt: instructions,
            introduction: greeting || undefined,
          },
          metadata: {
            call_id: this.session?.callId,
            employee_id: this.employee?.id,
            employee_name: this.employee?.name,
            lead_name: leadName || undefined,
            lead_purpose: leadPurpose || undefined,
          },
        };

        try {
          this.cartesiaWs.send(JSON.stringify(startPayload));
          console.log(`[cartesia-line] Sent start event: stream_id=${streamId}, input_format=mulaw_8000`);
        } catch (err) {
          console.warn('[cartesia-line] Failed to send start event:', err.message);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(err);
          }
        }

        if (greeting) {
          this.session.addTranscript('ai', greeting);
          this.hasGreeted = true;
        }
      });

      this.cartesiaWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString('utf8'));
          if (msg.event === 'ack' || msg.event === 'media_output') {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve();
            }
          }
          this.handleCartesiaMessage(msg);
        } catch (err) {
          console.warn('[cartesia-line] Failed to parse message:', err.message);
        }
      });

      this.cartesiaWs.on('error', (err) => {
        console.error(`[cartesia-line] WebSocket error on agent ${this.agentId}:`, err.message);
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.cartesiaWs.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString('utf8') : '';
        console.log(`[cartesia-line] Agent socket closed: code=${code}, reason="${reasonStr}"`);
        this.isConnected = false;
        clearInterval(this.pingInterval);

        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Cartesia Line closed during handshake (code=${code}, reason=${reasonStr || 'none'})`));
          return;
        }

        if (code === 1000 || reasonStr.includes('call ended by agent')) {
          console.log('[cartesia-line] Call ended by agent.');
          this.session?.finishCall('completed');
        }
      });
    });
  }

  /**
   * Process message frames arriving from Cartesia Line
   */
  handleCartesiaMessage(msg) {
    if (!msg || !msg.event) return;

    switch (msg.event) {
      case 'ack':
        if (msg.stream_id) {
          this.streamId = msg.stream_id;
        }
        console.log(`[cartesia-line] Stream ack: ${this.streamId}`);
        break;

      case 'media_output':
        if (msg.media?.payload) {
          const rawChunk = Buffer.from(msg.media.payload, 'base64');
          // Forward audio frame to VoBiz via session
          this.session.sendAudioFrame(rawChunk);
        }
        break;

      case 'clear':
        // Cartesia detected barge-in interruption: immediately silence VoBiz playback
        console.log('[cartesia-line] Barge-in clear signal received from Cartesia');
        this.session.clearAudioBuffer();
        break;

      case 'transcript':
        if (msg.text) {
          const speaker = msg.speaker || (msg.role === 'user' ? 'customer' : 'ai');
          this.session.addTranscript(speaker, msg.text);
        }
        break;

      case 'error':
        console.warn('[cartesia-line] Error event from agent:', msg.message || msg.error || msg);
        break;

      default:
        console.log(`[cartesia-line] Received event: ${msg.event}`);
        break;
    }
  }

  /**
   * Forward incoming 8kHz mu-law audio frame from VoBiz to Cartesia Line
   * @param {Buffer} chunk - 8kHz mu-law audio buffer
   */
  handleInboundAudio(chunk) {
    if (!chunk || !chunk.length) return;
    if (!this.isConnected || !this.cartesiaWs || this.cartesiaWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = chunk.toString('base64');
    try {
      this.cartesiaWs.send(JSON.stringify({
        event: 'media_input',
        stream_id: this.streamId,
        media: {
          payload,
        },
      }));
    } catch (err) {
      console.warn('[cartesia-line] Error sending media_input:', err.message);
    }
  }

  /**
   * Forward DTMF tones to Cartesia Line
   */
  handleDtmf(digit) {
    if (this.isConnected && this.cartesiaWs?.readyState === WebSocket.OPEN) {
      try {
        this.cartesiaWs.send(JSON.stringify({
          event: 'dtmf',
          stream_id: this.streamId,
          dtmf: String(digit),
        }));
      } catch {}
    }
  }

  /**
   * Barge-in interruption
   */
  interrupt() {
    this.session.clearAudioBuffer();
  }

  /**
   * Cleanup Cartesia Line connection
   */
  async close() {
    await super.close();
    clearInterval(this.pingInterval);
    if (this.cartesiaWs) {
      try {
        if (this.cartesiaWs.readyState === WebSocket.OPEN) {
          this.cartesiaWs.close(1000, 'session ended');
        }
      } catch {}
      this.cartesiaWs = null;
    }
    this.isConnected = false;
  }
}

module.exports = CartesiaLineEngine;
