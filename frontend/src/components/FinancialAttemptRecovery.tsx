import { useState } from 'react';
import { rafiqConfirm } from '../utils/dialogService';
import { formatArabicCurrency } from '../utils/money';
import type { useFinancialJournal } from '../hooks/useFinancialJournal';

export function FinancialAttemptRecovery({ journal, onResolved }: {
  journal: ReturnType<typeof useFinancialJournal>;
  onResolved: () => void;
}) {
  const [message, setMessage] = useState('');
  if (!journal.pending && !journal.error) return null;
  const own = !!journal.pending && !!journal.actorId && journal.pending.actorId === journal.actorId;
  const handle = async (mode: 'replay' | 'reconcile' | 'abandon') => {
    if (mode === 'abandon' && !await rafiqConfirm({ title: 'إلغاء المحاولة بأمان', message: 'سيتم طلب حاجز إلغاء دائم. إذا كانت العملية مسجلة بالفعل ستتم استعادة نتيجتها، ولن يبدأ طلب بديل قبل إثبات النتيجة.' })) return;
    try {
      const result = await journal.recover(mode);
      if (result.status === 'pending') setMessage('عدم العثور على سجل ليس نتيجة نهائية. أعد إرسال الطلب الأصلي أو اطلب إلغاءً دائماً.');
      else { setMessage(''); onResolved(); }
    } catch (err) { setMessage(err instanceof Error ? err.message : 'تعذر إثبات نتيجة المحاولة'); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="محاولة مالية معلقة" className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-surface dark:bg-surface-dark border border-line rounded-2xl p-5 space-y-3">
        <h2 className="font-black text-ink dark:text-ink-dark">محاولة مالية معلقة محفوظة</h2>
        <p className="text-sm text-ink-muted">لن يتغير الطلب أو رقمه بإغلاق الشاشة أو إعادة تشغيلها. لا تبدأ عملية بديلة قبل إثبات النتيجة أو إقرار إلغاء دائم.</p>
        {own && <p className="text-xs break-all">{journal.pending?.action} — {journal.pending?.payload.idempotencyKey}</p>}
        {own && <p className="text-sm font-bold">المبلغ الأصلي: {formatArabicCurrency(Number(journal.pending?.payload.amountPiasters ?? journal.pending?.payload.billAmountPiasters ?? 0))}</p>}
        {!own && <p className="text-danger">يجب تسجيل الدخول بالمستخدم الأصلي. لا يمكن لمستخدم آخر استبدال المحاولة.</p>}
        {(message || journal.error) && <p role="alert" className="text-danger text-sm">{message || journal.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!own || journal.busy} onClick={() => void handle('reconcile')} className="px-3 py-2 border border-line rounded-xl disabled:opacity-50">استعلام</button>
          <button type="button" disabled={!own || journal.busy} onClick={() => void handle('replay')} className="px-3 py-2 bg-paid text-white rounded-xl disabled:opacity-50">إعادة إرسال الطلب الأصلي</button>
          <button type="button" disabled={!own || journal.busy} onClick={() => void handle('abandon')} className="px-3 py-2 border border-danger text-danger rounded-xl disabled:opacity-50">إلغاء المحاولة بأمان</button>
        </div>
      </div>
    </div>
  );
}
