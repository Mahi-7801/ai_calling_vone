import { useAuth } from '@/context/AuthContext';
import { subscribeRealtime } from '@/hooks/useRealtime';
import { useEffect } from 'react';

export function useCreditsRealtime() {
  const { wallet, setWallet, refresh } = useAuth();

  useEffect(() => {
    const unsub = subscribeRealtime((event) => {
      if (event.type === 'credits.updated') {
        const balance = event.data.balance;
        if (typeof balance === 'number' && wallet) {
          setWallet({ ...wallet, balance });
        }
      }
      if (event.type === 'call.completed') {
        void refresh();
      }
    });
    return unsub;
  }, [wallet, setWallet, refresh]);
}