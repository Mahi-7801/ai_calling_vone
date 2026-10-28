import { useEffect, useRef } from 'react';
import { authStore } from '@/lib/api';

export interface RealtimeEvent {
  type: string;
  data: Record<string, unknown>;
}

type Handler = (event: RealtimeEvent) => void;

let socket: WebSocket | null = null;
let handlers = new Set<Handler>();
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let active = false;

// The server authenticates the socket from this token and takes org/role from
// the user row, so the org no longer travels in the query string (it was
// previously trusted from the client, which let any caller join any tenant's
// event stream).
function wsUrl(): string {
  const params = new URLSearchParams();
  const token = authStore.getToken();
  if (token) params.set('token', token);
  const page = typeof window !== 'undefined' ? window.location.pathname : '';
  if (page) params.set('page', page);

  let host = typeof window !== 'undefined' ? window.location.host : 'localhost:5000';
  let proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';

  const remoteUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL;
  if (remoteUrl) {
    try {
      const u = new URL(remoteUrl);
      host = u.host;
      proto = u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss' : 'ws';
    } catch {
      // fallback to window.location
    }
  }

  const qs = params.toString();
  return `${proto}://${host}/ws${qs ? `?${qs}` : ''}`;
}

function sendFrame(type: string, data: Record<string, unknown>) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ type, data }));
  } catch {
    /* socket closed mid-write; onclose will reconnect */
  }
}

function closeSocket(ws: WebSocket | null, code = 1000, reason = 'client closing') {
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
  // Calling close() on a CONNECTING socket aborts the upgrade handshake, which
  // resets the TCP connection and surfaces in the dev server as
  // "ws proxy error: read ECONNRESET". Wait for the handshake, then close.
  if (ws.readyState === WebSocket.CONNECTING) {
    const onOpen = () => {
      ws.removeEventListener('open', onOpen);
      try {
        ws.close(code, reason);
      } catch {
        /* already closing */
      }
    };
    ws.addEventListener('open', onOpen);
    return;
  }
  try {
    ws.close(code, reason);
  } catch {
    /* already closing */
  }
}

function connect() {
  if (!active || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  active = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    const ws = new WebSocket(wsUrl());
    socket = ws;

    ws.onopen = () => {
      attempts = 0;
    };

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string) as RealtimeEvent;
        handlers.forEach((h) => h(parsed));
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (!active) return;
      attempts += 1;
      const delay = Math.min(1000 * 2 ** Math.min(attempts, 4), 15000);
      // Jitter so many open tabs do not all reconnect on the same tick.
      const wait = delay + Math.random() * 500;
      reconnectTimer = setTimeout(connect, wait);
    };

    // Do not call close() from onerror - the browser closes anyway, and forcing
    // it skips the closing handshake, which the dev proxy reports as ECONNRESET.
    ws.onerror = () => {
      /* handled by onclose */
    };
  } catch {
    socket = null;
    if (!active) return;
    reconnectTimer = setTimeout(connect, 5000);
  }
}

/**
 * Tell other tabs which page this one is on, so presence can show it. The
 * server echoes a fresh presence list back, which every subscriber receives.
 */
export function setRealtimePage(page: string) {
  sendFrame('presence.page', { page });
}

export function broadcastTypingStart(scope: string, employeeId?: number | string | null) {
  sendFrame('typing.start', { scope, employeeId: employeeId ?? null });
}

export function broadcastTypingStop(scope: string, employeeId?: number | string | null) {
  sendFrame('typing.stop', { scope, employeeId: employeeId ?? null });
}

export function subscribeRealtime(handler: Handler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

// Accepts an array so one subscription can cover a family of events (e.g. every
// employee mutation) without repeating the handler in the component.
export function useRealtimeEvent(
  type: string | string[],
  handler: (data: Record<string, unknown>) => void,
) {
  const key = Array.isArray(type) ? type.join('|') : type;
  const typesRef = useRef<string[]>(Array.isArray(type) ? type : [type]);
  typesRef.current = Array.isArray(type) ? type : [type];

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const sub = subscribeRealtime((event) => {
      if (typesRef.current.includes(event.type)) handlerRef.current(event.data);
    });
    return sub;
  }, [key]);
}

export function useRealtimeAll(handler: (event: RealtimeEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const sub = subscribeRealtime((event) => handlerRef.current(event));
    return sub;
  }, []);
}

export function startRealtime(_orgId: number | null) {
  active = true;
  connect();
}

export function stopRealtime() {
  active = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    const ws = socket;
    socket = null;
    // Close cleanly (code 1000) so the server/proxy sees an orderly shutdown
    // instead of an aborted connection.
    closeSocket(ws, 1000, 'client logout');
  }
}