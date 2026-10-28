const WebSocket = require('ws');
const { resolveSocketIdentity } = require('./socketAuth');

let wss = null;
let heartbeatTimer = null;
const clientGroups = new Map(); // orgId -> Set<ws>

// ws.terminate() skips the closing handshake and sends a TCP RST, which the
// Vite dev proxy surfaces as "ws proxy error: read ECONNRESET". Send a proper
// close frame first and only fall back to terminate() if the peer does not
// complete the handshake, so normal disconnects look orderly to the proxy.
function closeGracefully(ws, code = 1000, reason = 'closed') {
  if (!ws || ws.readyState === WebSocket.CLOSED) return;
  try {
    ws.close(code, reason);
  } catch {
    /* already gone */
  }
  const t = setTimeout(() => {
    if (ws.readyState !== WebSocket.CLOSED) {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
    }
  }, 3000);
  if (t.unref) t.unref();
}

// Without a heartbeat, idle sockets get reaped by the OS / NAT and the client
// sees them drop, which forces needless reconnects. Ping every client and close
// the ones that vanished.
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      // A socket that failed authentication is in no group and receives nothing.
      // Reap it here rather than letting it linger as an open connection.
      if (ws.meta && !ws.meta.orgId) {
        closeGracefully(ws, 1008, 'unauthorized');
        continue;
      }
      if (ws.isAlive === false) {
        closeGracefully(ws, 1001, 'heartbeat timeout');
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        closeGracefully(ws, 1001, 'ping failed');
      }
    }
  }, 30000);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
}

// The browser WebSocket API cannot set an Authorization header, so the JWT
// rides in the query string. Group membership and role used to come straight
// from ?orgId= / ?role=, which let any caller subscribe to any tenant's events
// (including the global admin broadcast). Identity now comes from the token
// via the shared resolver, and org/role are read from the user row.
async function authenticate(token) {
  const identity = await resolveSocketIdentity(token, { requireOrg: true });
  if (!identity || !identity.org) return null;
  return {
    userId: identity.user.id,
    orgId: identity.org.id,
    role: identity.user.role,
    name: identity.user.name,
  };
}

// Presence is derived from the live socket set rather than a stored table, so it
// cannot go stale: a tab that closes stops pinging and drops out of the group.
function listPresence(orgId) {
  const seen = new Map();
  for (const ws of clientGroups.get(String(orgId)) || []) {
    const meta = ws.meta;
    if (!meta?.userId) continue;
    const existing = seen.get(meta.userId);
    if (existing) {
      existing.tabs += 1;
      continue;
    }
    seen.set(meta.userId, {
      userId: meta.userId,
      name: meta.name || 'Someone',
      role: meta.role,
      page: meta.page || null,
      online: true,
      tabs: 1,
    });
  }
  return [...seen.values()];
}

function broadcastPresence(orgId) {
  if (!orgId) return;
  emit(String(orgId), 'presence.updated', { users: listPresence(orgId) });
}

function attach(server) {
  wss = new WebSocket.Server({ noServer: true });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    // A browser closing a tab resets the TCP connection, so verify() rejecting
    // is routine. The unauthenticated socket is dropped on the next message or
    // ping rather than at handshake time, which would need a raw HTTP response
    // write we do not have a handle for here.
    authenticate(url.searchParams.get('token')).then((auth) => {
      if (!auth) {
        ws.meta = { orgId: null, role: 'guest', userId: null, name: null };
        safeSend(ws, JSON.stringify({ type: 'ws.unauthorized', data: {} }));
        return;
      }
      ws.meta = { ...auth, page: url.searchParams.get('page') || null };
      const orgKey = String(auth.orgId);
      if (!clientGroups.has(orgKey)) clientGroups.set(orgKey, new Set());
      clientGroups.get(orgKey).add(ws);
      safeSend(ws, JSON.stringify({
        type: 'ws.connected',
        data: { orgId: auth.orgId, userId: auth.userId, role: auth.role },
      }));
      // `presence.updated` doubles as the initial snapshot: it carries the full
      // list, so a client only needs this one event type.
      broadcastPresence(orgId);
    }).catch(() => {});

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    // Client->server frames: presence.page and typing.*. Relay them to the rest
    // of the org so other tabs can show who is looking at what.
    ws.on('message', (raw) => {
      const meta = ws.meta;
      if (!meta?.orgId) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'presence.page') {
        meta.page = typeof msg.data?.page === 'string' ? msg.data.page : null;
        broadcastPresence(meta.orgId);
        return;
      }
      if (msg.type === 'typing.start' || msg.type === 'typing.stop') {
        emit(String(meta.orgId), msg.type, {
          userId: meta.userId,
          name: meta.name,
          scope: msg.data?.scope || null,
          employeeId: msg.data?.employeeId ?? null,
        });
      }
    });
    ws.on('close', () => {
      const orgKey = ws.meta?.orgId ? String(ws.meta.orgId) : null;
      if (orgKey) {
        clientGroups.get(orgKey)?.delete(ws);
        broadcastPresence(orgKey);
      }
    });
    // An unhandled 'error' on a raw socket makes Node tear down the process
    // connection noisily; the browser resetting the tab is routine, not a fault.
    ws.on('error', () => {});
  });
  startHeartbeat();
  return wss;
}

function handleUpgrade(req, socket, head) {
  if (!wss) return;
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
}

// admin sees everything; user only sees their org
function canReceive(ws, orgId) {
  if (!ws.meta?.orgId) return false;
  if (ws.meta.role === 'admin') return true;
  return String(ws.meta.orgId) === String(orgId);
}

function safeSend(ws, payload) {
  // A send to a socket that closed between our readyState check and the write
  // rejects, and an unhandled rejection there is reported as a connection reset.
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(payload, (err) => {
      if (err) closeGracefully(ws, 1011, 'send failed');
    });
  } catch {
    closeGracefully(ws, 1011, 'send failed');
  }
}

function emit(orgId, type, data) {
  if (!wss) return;
  const payload = JSON.stringify({ type, data });
  for (const ws of clientGroups.get(String(orgId)) || []) {
    if (canReceive(ws, orgId)) safeSend(ws, payload);
  }
  // Platform admins see every tenant's events.
  for (const [gOrg, clients] of clientGroups) {
    if (gOrg === String(orgId)) continue;
    for (const ws of clients) {
      if (ws.meta?.role === 'admin') safeSend(ws, payload);
    }
  }
}

function emitBroadcast(type, data) {
  if (!wss) return;
  const payload = JSON.stringify({ type, data });
  wss.clients.forEach((ws) => safeSend(ws, payload));
}

function closeAll(code = 1001, reason = 'server shutting down') {
  if (!wss) return;
  for (const ws of wss.clients) closeGracefully(ws, code, reason);
}

module.exports = {
  attach,
  handleUpgrade,
  emit,
  emitBroadcast,
  closeAll,
  closeGracefully,
};