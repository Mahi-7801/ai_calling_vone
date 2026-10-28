const express = require('express');
const livekitService = require('../services/livekitService');
const { getTunnelStatus } = require('../services/tunnelService');
const { AccessToken } = require('livekit-server-sdk');

const router = express.Router();

// In-memory buffer of recent verified LiveKit webhook events
const recentEvents = [];

/**
 * GET /api/webhooks/livekit
 * Returns LiveKit webhook configuration status, setup instructions, and recent event deliveries.
 */
router.get('/', (req, res) => {
  const tunnel = getTunnelStatus();
  const host = tunnel.url || `${req.protocol}://${req.get('host')}`;
  const webhookUrl = `${host}/api/webhooks/livekit`;
  const status = livekitService.getStatus();

  res.json({
    success: true,
    livekit: {
      ...status,
      webhook_url: webhookUrl,
      recent_events: recentEvents,
      active: true,
      last_event_at: recentEvents[0]?.timestamp || null,
      recommended_events: [
        'room_started',
        'room_finished',
        'participant_joined',
        'participant_left',
        'track_published',
        'egress_ended',
      ],
      setup_instructions: {
        step1: 'Go to your LiveKit Cloud project settings at https://cloud.livekit.io/projects/p_5gwfu1z660w/settings/webhooks',
        step2: 'Click "Create new webhook"',
        step3: `Enter the Webhook URL: ${webhookUrl}`,
        step4: 'Select events: Room Started, Room Finished, Participant Joined, Participant Left',
        step5: 'Click Create. LiveKit will automatically sign requests using your API Key and Secret.',
      },
    },
  });
});

/**
 * POST /api/webhooks/livekit
 * Handles incoming LiveKit webhook events with cryptographic signature verification.
 */
router.post('/', async (req, res) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) {
    console.warn('[livekit:webhook] Rejected request without Authorization header');
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  // LiveKit requires the raw string or buffer body for SHA256 signature verification
  const rawBody = req.rawBody || req.body;
  if (!rawBody) {
    return res.status(400).json({ error: 'Empty webhook body' });
  }

  try {
    const event = await livekitService.verifyAndProcessWebhook(rawBody, authHeader);

    // Record in recent events buffer
    recentEvents.unshift({
      id: event.id || `evt_${Date.now()}`,
      event: event.event,
      room: event.room?.name || 'unknown',
      numParticipants: event.room?.numParticipants || 0,
      participant: event.participant?.identity || null,
      timestamp: new Date().toISOString(),
    });
    if (recentEvents.length > 25) recentEvents.pop();

    return res.json({ success: true, event: event.event, handled_at: new Date().toISOString() });
  } catch (err) {
    console.error('[livekit:webhook] Verification failed:', err.message);
    return res.status(400).json({ error: `Webhook verification failed: ${err.message}` });
  }
});

/**
 * POST /api/webhooks/livekit/test
 * Sends a self-signed test webhook event through the receiver to verify the pipeline.
 */
router.post('/test', async (req, res) => {
  try {
    const lkStatus = livekitService.getStatus();
    const apiKey = livekitService.apiKey;
    const apiSecret = livekitService.apiSecret;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'LiveKit API key or secret not configured' });
    }

    const testEvent = {
      event: 'room_started',
      id: `test_${Date.now()}`,
      createdAt: Math.floor(Date.now() / 1000),
      room: {
        sid: `RM_${Math.random().toString(36).substring(2, 9)}`,
        name: 'vobiz_test_verification_room',
        emptyTimeout: 300,
        maxParticipants: 10,
        creationTime: Math.floor(Date.now() / 1000),
        turnPassword: '',
        enabledCodecs: [],
        numParticipants: 1,
      },
      participant: {
        sid: `PA_${Math.random().toString(36).substring(2, 9)}`,
        identity: 'vobiz_caller_test',
        state: 1,
        joinedAt: Math.floor(Date.now() / 1000),
      },
    };

    const rawBody = JSON.stringify(testEvent);
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(rawBody).digest('base64');

    const token = new AccessToken(apiKey, apiSecret, {
      ttl: '1m',
    });
    token.sha256 = hash;
    const jwtToken = await token.toJwt();

    const verified = await livekitService.verifyAndProcessWebhook(rawBody, jwtToken);

    recentEvents.unshift({
      id: verified.id || `test_${Date.now()}`,
      event: verified.event,
      room: verified.room?.name || 'vobiz_test_verification_room',
      numParticipants: 1,
      participant: 'vobiz_caller_test (Test Ping)',
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: 'LiveKit webhook test event successfully verified and processed!',
      event: verified.event,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[livekit:webhook:test] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

