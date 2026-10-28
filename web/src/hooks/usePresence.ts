import { useEffect, useState } from 'react';
import { useRealtimeEvent, setRealtimePage } from '@/hooks/useRealtime';
import { useAuth } from '@/context/AuthContext';

export interface PresenceUser {
  userId: number;
  name: string;
  role: string;
  page: string | null;
  online: boolean;
  tabs: number;
}

/**
 * Who else in this organization currently has the app open.
 *
 * The server derives the list from live sockets, so a closed tab drops out on
 * its own without any stored "last seen" state to go stale.
 */
export function usePresence() {
  const { user } = useAuth();
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useRealtimeEvent('presence.updated', (data) => {
    setUsers(Array.isArray(data.users) ? (data.users as PresenceUser[]) : []);
  });

  useEffect(() => {
    setRealtimePage(window.location.pathname);
  }, []);

  // Presence should read "who else is here", so drop the current user.
  const others = users.filter((u) => u.userId !== user?.id);

  return { users: others, onlineCount: users.length, isSelf: users.some((u) => u.userId === user?.id) };
}
