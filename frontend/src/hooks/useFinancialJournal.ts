import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../bridge/ipc';
import {
  createFinancialAttempt, readFinancialAttempt, FINANCIAL_ATTEMPT_CHANGED,
  type FinancialAction, type FinancialAttempt,
} from '../utils/financialAttempt';

export function useFinancialJournal(actorId: string | undefined) {
  const [pending, setPending] = useState<FinancialAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const running = useRef(false);
  const refresh = useCallback(() => {
    try { setPending(readFinancialAttempt(window.localStorage)); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر قراءة المحاولة المالية'); }
    setReady(true);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(FINANCIAL_ATTEMPT_CHANGED, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(FINANCIAL_ATTEMPT_CHANGED, refresh);
    };
  }, [refresh]);
  async function run<T>(action: FinancialAction, payload: Record<string, unknown>): Promise<T> {
    if (running.current) throw new Error('توجد عملية مالية قيد التنفيذ');
    running.current = true;
    setBusy(true);
    try {
      return await createFinancialAttempt(window.localStorage, actorId || '', action, invoke).execute(payload) as T;
    } finally { running.current = false; setBusy(false); refresh(); }
  }
  async function recover(mode: 'replay' | 'reconcile' | 'abandon') {
    if (running.current) throw new Error('توجد عملية مالية قيد التنفيذ');
    const attempt = readFinancialAttempt(window.localStorage);
    if (!attempt) throw new Error('لا يوجد طلب أصلي مثبت');
    running.current = true;
    setBusy(true);
    try {
      const controller = createFinancialAttempt(window.localStorage, actorId || '', attempt.action, invoke);
      if (mode === 'replay') return { status: 'committed' as const, data: await controller.execute({}) };
      return await controller[mode]();
    } finally { running.current = false; setBusy(false); refresh(); }
  }
  return { pending, error, busy, blocked: !ready || !!pending || !!error || busy, actorId, run, recover };
}
