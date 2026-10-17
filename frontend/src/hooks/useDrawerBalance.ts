import { useState, useEffect, useCallback } from 'react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import type { LiveDrawerBalance } from '../types/models';

export function useDrawerBalance() {
  const [balance, setBalance] = useState<LiveDrawerBalance | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      setLoading(true);
      const res = await invoke<LiveDrawerBalance>('drawer:getBalance');
      if (res) {
        setBalance(res);
      }
    } catch {
      // Ignore background refresh errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useDataSubscription(['drawer', 'sales', 'purchases', 'suppliers', 'epay', 'wallets', 'all'], fetchBalance);

  return {
    balance,
    loading,
    refresh: fetchBalance,
  };
}
