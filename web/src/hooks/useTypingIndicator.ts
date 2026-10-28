import { useEffect, useRef, useState } from 'react';
import { useRealtimeEvent, broadcastTypingStart, broadcastTypingStop } from '@/hooks/useRealtime';
import { useAuth } from '@/context/AuthContext';

export interface TypingPeer {
  userId: number;
  name: string;
  scope: string | null;
  employeeId: number | string | null;
}

const EXPIRY_MS = 6000;

function scopeKey(scope: string, employeeId?: number | string | null) {
  return `${scope}:${employeeId ?? '*'}`;
}

/**
 * Typing indicator for other users in the organization.
 *
 * The server only relays start/stop frames, so a client that navigates away
 * while "typing" would otherwise leave a stale indicator. Each entry expires on
 * a timer as a backstop, and the sender clears its own on blur/unmount.
 */
export function useTypingIndicator(scope: string, employeeId?: number | string | null) {
  const { user } = useAuth();
  const [peers, setPeers] = useState<TypingPeer[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const key = scopeKey(scope, employeeId);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  useRealtimeEvent('typing.start', (data) => {
    // Ignore our own echo; the server fans out to the whole org including us.
    if (data.userId === user?.id) return;
    if (scopeKey(String(data.scope || ''), data.employeeId as number | null) !== key) return;
    const peer: TypingPeer = {
      userId: data.userId as number,
      name: String(data.name || 'Someone'),
      scope: (data.scope as string) ?? null,
      employeeId: (data.employeeId as number | null) ?? null,
    };
    setPeers((prev) => [...prev.filter((p) => p.userId !== peer.userId), peer]);
    const existing = timers.current.get(String(peer.userId));
    if (existing) clearTimeout(existing);
    timers.current.set(
      String(peer.userId),
      setTimeout(() => {
        setPeers((prev) => prev.filter((p) => p.userId !== peer.userId));
        timers.current.delete(String(peer.userId));
      }, EXPIRY_MS),
    );
  });

  useRealtimeEvent('typing.stop', (data) => {
    if (data.userId === user?.id) return;
    if (scopeKey(String(data.scope || ''), data.employeeId as number | null) !== key) return;
    const existing = timers.current.get(String(data.userId));
    if (existing) clearTimeout(existing);
    timers.current.delete(String(data.userId));
    setPeers((prev) => prev.filter((p) => p.userId !== data.userId));
  });

  const start = () => broadcastTypingStart(scope, employeeId ?? null);
  const stop = () => broadcastTypingStop(scope, employeeId ?? null);

  return { typingPeers: peers, startTyping: start, stopTyping: stop, typingLabel: formatTypingLabel(peers) };
}

function formatTypingLabel(peers: TypingPeer[]): string | null {
  if (peers.length === 0) return null;
  const names = peers.map((p) => p.name.split(' ')[0]);
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
