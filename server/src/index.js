require('dotenv').config();
// Server initialized with live Razorpay & VoBiz providers
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/env');

(async () => {
  // ensure schema exists before serving
  try {
    const { testConnection } = require('./config/db');
    await testConnection();
    require('./db/schema').migrateSafe();
    await new Promise((r) => setTimeout(r, 400));
    await require('./db/seed').seed();
    console.log('[db] InsForge PostgreSQL database connected and ready.');
  } catch (err) {
    console.error('[db] InsForge PostgreSQL connection error:', err.message);
  }

  const app = express();

  app.set('trust proxy', 1);
  const configuredOrigins = (config.frontendUrl || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          configuredOrigins.includes(origin) ||
          configuredOrigins.includes('*') ||
          origin.endsWith('.vercel.app') ||
          origin.includes('localhost')
        ) {
          return callback(null, true);
        }
        // Allow the caller in production if configured
        return callback(null, true);
      },
      credentials: true,
    })
  );
  // The Razorpay and LiveKit webhook signatures are computed over the exact raw body
  app.use(['/api/billing/webhook', '/api/webhooks/razorpay'], express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(
    ['/api/webhooks/livekit', '/webhooks/livekit'],
    express.raw({ type: '*/*', limit: '2mb' }),
    (req, _res, next) => {
      if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body.toString('utf8');
      }
      next();
    }
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use('/api', limiter);

  // request id
  app.use((req, res, next) => {
    req.requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  app.get(['/health', '/healthz'], (_req, res) =>
    res.json({ status: 'ok', mockMode: config.mockMode, time: new Date().toISOString() })
  );
  app.get('/api/health', (_req, res) => {
    // Surfacing the tunnel state here means "why are inbound calls silent?" is
    // answerable without reading server logs.
    const tunnel = require('./services/tunnelService').getTunnelStatus();
    res.json({
      status: 'ok',
      mockMode: config.mockMode,
      time: new Date().toISOString(),
      tunnel,
      // A carrier cannot reach a localhost answer_url, so no tunnel means no
      // PSTN audio. Make that impossible to miss.
      inboundCallsPossible: Boolean(tunnel.url),
    });
  });

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/organizations', require('./routes/dashboard'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  // Public voice sample preview clips (WAV/MP3) generated for the employee builder
  app.use('/api/employees/voice-samples', express.static(path.join(__dirname, '..', 'public', 'voice-samples')));

  app.use('/api/employees', require('./routes/employees'));
  app.use('/api/leads', require('./routes/leads'));
  app.use('/api/campaigns', require('./routes/campaigns'));
  app.use('/api/calls', require('./routes/calls'));
  app.use('/api/conversations', require('./routes/conversations'));
  app.use('/api/recordings', require('./routes/recordings'));
  app.use('/api/performance', require('./routes/performance'));
  app.use('/api/phone-numbers', require('./routes/phoneNumbers'));
  app.use('/api/billing', require('./routes/billing'));
  app.use('/api/wallet', require('./routes/wallet'));
  app.use('/api/numbers', require('./routes/numbers'));
  app.use('/api/telephony', require('./routes/telephony'));
  app.use('/api/webhooks/livekit', require('./routes/livekitWebhook'));
  app.use('/webhooks/livekit', require('./routes/livekitWebhook'));
  app.use('/api/webhooks', require('./routes/webhooks'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/admin', require('./routes/admin'));

  const { notFound, errorHandler } = require('./utils/errors');
  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  const realtime = require('./services/realtime');
  realtime.attach(server);

  const WebSocket = require('ws');
  const { handleMediaStreamConnection } = require('./services/mediaStreamService');
  const mediaWss = new WebSocket.Server({ noServer: true });
  mediaWss.on('connection', handleMediaStreamConnection);

  // Browser-originated call audio. Unlike the carrier sockets above, this one is
  // reached with a user JWT, so it is authenticated before any audio is accepted.
  const browserWss = new WebSocket.Server({ noServer: true });
  const { handleBrowserCallConnection } = require('./services/browserCallService');
  browserWss.on('connection', handleBrowserCallConnection);

  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url.split('?')[0];

    // A socket that resets while idle (sleeping laptop, NAT timeout, dev server
    // reload) emits an 'error' with no listener, which Node reports as an
    // uncaught ECONNRESET. Absorb it here.
    socket.on('error', (err) => {
      if (err?.code !== 'ECONNRESET') {
        console.warn(`[ws] socket error on ${pathname}: ${err.message}`);
      }
    });

    if (pathname === '/ws') {
      realtime.handleUpgrade(req, socket, head);
      return;
    }
    if (pathname.startsWith('/ws/browser')) {
      browserWss.handleUpgrade(req, socket, head, (ws) => {
        browserWss.emit('connection', ws, req);
      });
      return;
    }
    if (
      pathname.startsWith('/ws/vobiz') ||
      pathname.startsWith('/ws/twilio') ||
      pathname.startsWith('/ws/media') ||
      pathname === '/vobiz-stream' ||
      pathname.startsWith('/vobiz-stream')
    ) {
      mediaWss.handleUpgrade(req, socket, head, (ws) => {
        mediaWss.emit('connection', ws, req);
      });
      return;
    }
    // Reject politely instead of destroying the TCP socket outright: an abrupt
    // RST is what the client (and the Vite proxy in front of it) logs as
    // "read ECONNRESET".
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.end();
  });

  const { startScheduler, stopAll } = require('./services/campaignService');
  startScheduler();
  const { startTunnelWatchdog, stopTunnel, TUNNEL_MODE } = require('./services/tunnelService');
  const graceful = async () => {
    console.log('Shutting down...');
    // Complete the WebSocket closing handshakes before closing the HTTP server,
    // otherwise every connected client sees an abrupt reset on restart.
    realtime.closeAll(1001, 'server restarting');
    stopTunnel();
    await stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', graceful);
  process.on('SIGTERM', graceful);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[server] Port ${config.port} is already in use. Another copy of this server is probably still running.`);
      console.error('[server] Stop it (taskkill /FI "IMAGENAME eq node.exe") or change PORT in .env, then restart.\n');
    } else {
      console.error('[server] Server error:', err.message);
    }
    process.exit(1);
  });

  server.listen(config.port, () => {
    console.log('');
    console.log('==============================================');
    console.log('  Telugu AI Calling SaaS — Server');
    console.log(`  http://localhost:${config.port}`);
    console.log(`  MOCK_MODE=${config.mockMode}`);
    console.log(`  Database: ${config.mysql.user}@${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
    console.log(`  Demo login: demo@aicalling.local / demo1234`);
    console.log('==============================================');

    const { getPublicUrl, getTunnelStatus } = require('./services/tunnelService');
    getPublicUrl(config.port).then((url) => {
      if (url) {
        console.log(`  Live Telephony Webhook: ${url}/api/telephony/webhook`);
      } else {
        const t = getTunnelStatus();
        console.warn('');
        console.warn(`  !! NO PUBLIC TUNNEL (mode: ${t.mode})`);
        console.warn('     VoBiz/Twilio cannot reach a localhost URL, so inbound call audio will be SILENT.');
        if (t.rateLimited) {
          console.warn('     Cause: Cloudflare rate limit on account-less quick tunnels (HTTP 429 / 1015).');
          console.warn('     It lifts on a daily quota window, not on a short timer - retrying sooner will not help.');
          console.warn('     Permanent fix: create a free named tunnel, then set in server/.env:');
          console.warn('       CLOUDFLARE_TUNNEL_TOKEN=<token>');
          console.warn('       CLOUDFLARE_TUNNEL_HOSTNAME=<your hostname>');
        } else if (t.mode === 'off') {
          console.warn('     TUNNEL_MODE is off and no working PUBLIC_WEBHOOK_URL was found.');
        } else {
          console.warn('     cloudflared could not start. Check server/bin/cloudflared.exe and the network.');
        }
        console.warn('');
      }
    }).catch(() => {});
    // Self-heal the tunnel: if the URL expires or dies, relaunch it before the
    // next call embeds a dead answer_url (silent calls).
    try { startTunnelWatchdog(config.port); } catch (err) { console.warn('[tunnel] Watchdog start error:', err.message); }
  });
})();