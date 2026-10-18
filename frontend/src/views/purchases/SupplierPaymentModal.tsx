import React, { useState, useEffect, useCallback } from 'react';
import { Banknote, X, CheckCheck, Sparkles, Coins, ArrowLeftRight, Check, AlertCircle, AlertTriangle } from 'lucide-react';
import type { Supplier } from '../../types/models';
import { formatMoney } from './types';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { invoke } from '../../bridge/ipc';
import { formatArabicCurrency } from '../../utils/money';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  paymentAmountPiasters: number;
  setPaymentAmountPiasters: (amount: number) => void;
  paymentNotes: string;
  setPaymentNotes: (notes: string) => void;
  onConfirmPayment: (e: React.FormEvent, effectiveAmountPiasters?: number, notes?: string, paymentSource?: 'cash_drawer' | 'external_cash') => void;
}

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  supplier,
  paymentAmountPiasters,
  setPaymentAmountPiasters,
  paymentNotes,
  setPaymentNotes,
  onConfirmPayment,
}) => {
  // 'pay_exact' = سداد المديونية المستحقة فقط وإبقاء الفائض في الخزينة
  // 'advance_credit' = صرف المبلغ كاملاً وترحيل الزيادة دفعة مقدمة تحت الحساب
  const [excessAction, setExcessAction] = useState<'pay_exact' | 'advance_credit'>('pay_exact');
  const [paymentSource, setPaymentSource] = useState<'cash_drawer' | 'external_cash'>('cash_drawer');
  const [liveDrawerCashPiasters, setLiveDrawerCashPiasters] = useState<number | null>(null);

  const fetchLiveDrawerCash = useCallback(async () => {
    try {
      const res = await invoke<{ availableCashPiasters: number }>('drawer:getBalance');
      if (res && typeof res.availableCashPiasters === 'number') {
        setLiveDrawerCashPiasters(res.availableCashPiasters);
      }
    } catch {
      setLiveDrawerCashPiasters(null);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setExcessAction('pay_exact');
      setPaymentSource('cash_drawer');
      void fetchLiveDrawerCash();
    }
  }, [isOpen, supplier, fetchLiveDrawerCash]);

  const isDirty = paymentAmountPiasters > 0 || Boolean(paymentNotes.trim());

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && Boolean(supplier),
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء سداد حساب المورد؟',
    confirmMessage: 'تم إدخال بيانات صرف للمورد. هل أنت متأكد من الإلغاء والتراجع دون تسجيل السداد؟',
  });

  if (!isOpen || !supplier) return null;

  const currentBal = supplier.balancePiasters;
  const isDebt = currentBal > 0;
  const hasExcess = isDebt && paymentAmountPiasters > currentBal;
  const excessPiasters = hasExcess ? paymentAmountPiasters - currentBal : 0;

  // Effective amount and notes to submit
  const effectiveAmountPiasters = hasExcess && excessAction === 'pay_exact'
    ? currentBal
    : paymentAmountPiasters;

  const balanceAfter = currentBal - effectiveAmountPiasters;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveAmountPiasters <= 0) return;

    let autoNotes = paymentNotes.trim();
    if (!autoNotes) {
      if (hasExcess) {
        if (excessAction === 'pay_exact') {
          autoNotes = `سداد كامل حساب المورد (${formatMoney(currentBal)})`;
        } else {
          autoNotes = `سداد حساب (${formatMoney(currentBal)}) + دفعة مقدمة تحت الحساب (${formatMoney(excessPiasters)})`;
        }
      } else if (currentBal <= 0) {
        autoNotes = `دفعة مقدمة تحت الحساب للمورد (${formatMoney(paymentAmountPiasters)})`;
      } else if (effectiveAmountPiasters === currentBal) {
        autoNotes = `سداد كامل حساب المورد (${formatMoney(currentBal)})`;
      } else {
        autoNotes = `سداد جزء من حساب المورد (${formatMoney(effectiveAmountPiasters)})`;
      }
    }

    onConfirmPayment(e, effectiveAmountPiasters, autoNotes, paymentSource);
  };

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="h-14 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shadow-2xs">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink dark:text-ink-dark">سداد دفعة نقدية للمورد</h3>
              <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted block -mt-0.5">{supplier.name}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs flex-1 min-h-0 overflow-y-auto">
          {/* Supplier Info Box */}
          <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted dark:text-ink-dark-muted font-medium">المورد أو الشركة:</span>
              <span className="text-sm font-bold text-ink dark:text-ink-dark">{supplier.name}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-line dark:border-line-dark text-xs">
              <span className="text-ink-muted dark:text-ink-dark-muted">
                {currentBal > 0
                  ? 'المبلغ المستحق للمورد علينا:'
                  : currentBal < 0
                  ? 'رصيدنا السابق عند المورد (دافعين مقدم):'
                  : 'حالة الحساب الحالية:'}
              </span>
              <span
                className={`font-mono font-black text-sm ${
                  currentBal > 0
                    ? 'text-danger dark:text-danger-bright'
                    : currentBal < 0
                    ? 'text-paid dark:text-paid-bright'
                    : 'text-ink-muted dark:text-ink-dark-muted'
                }`}
              >
                {currentBal !== 0
                  ? formatMoney(Math.abs(currentBal))
                  : 'خالص (0.00 ج.م)'}
              </span>
            </div>
          </div>

          {/* Amount Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-ink dark:text-ink-dark block">
                المبلغ المراد سداده <span className="text-danger dark:text-danger-bright">*</span>
              </label>
              {isDebt && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountPiasters(currentBal)}
                  className="text-[11px] font-bold text-paid dark:text-paid-bright hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>سداد كامل الدين بالظبط ({formatMoney(currentBal)})</span>
                </button>
              )}
            </div>
            <MoneyInput
              valuePiasters={paymentAmountPiasters}
              onChangePiasters={setPaymentAmountPiasters}
              className="h-11 text-base text-paid dark:text-paid-bright font-black"
              autoFocus
            />
          </div>

          {/* Smart Excess Resolution Box */}
          {hasExcess && (
            <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 px-3 py-1.5 rounded-lg text-xs">
                <div className="flex items-center gap-1.5 font-bold text-ink dark:text-ink-dark">
                  <AlertCircle className="w-3.5 h-3.5 text-warn dark:text-warn-bright shrink-0" />
                  <span>زيادة عن حساب المورد:</span>
                </div>
                <span className="font-mono font-black text-warn dark:text-warn-bright text-xs">
                  {formatMoney(excessPiasters)}
                </span>
              </div>

              {/* Option 1: Pay Exact */}
              <button
                type="button"
                onClick={() => setExcessAction('pay_exact')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'pay_exact'
                    ? 'bg-surface dark:bg-surface-dark border-brand dark:border-brand-bright ring-1 ring-brand dark:ring-brand-bright text-ink dark:text-ink-dark shadow-2xs'
                    : 'bg-surface/50 dark:bg-surface-dark/50 border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'pay_exact'
                    ? 'border-brand dark:border-brand-bright bg-brand dark:bg-brand-bright text-white dark:text-surface-dark'
                    : 'border-line dark:border-line-dark'
                }`}>
                  {excessAction === 'pay_exact' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                      <span>صرف المستحق فقط والباقي في الدرج</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5 leading-normal">
                    صرف {formatMoney(currentBal)} لتسوية الحساب، والاحتفاظ بـ {formatMoney(excessPiasters)} في الدرج.
                  </p>
                </div>
              </button>

              {/* Option 2: Advance Credit */}
              <button
                type="button"
                onClick={() => setExcessAction('advance_credit')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'advance_credit'
                    ? 'bg-surface dark:bg-surface-dark border-paid dark:border-emerald-500 ring-1 ring-paid dark:ring-emerald-500 text-ink dark:text-ink-dark shadow-2xs'
                    : 'bg-surface/50 dark:bg-surface-dark/50 border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'advance_credit'
                    ? 'border-paid dark:border-emerald-500 bg-paid dark:bg-emerald-600 text-white'
                    : 'border-line dark:border-line-dark'
                }`}>
                  {excessAction === 'advance_credit' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                      <span>صرف المبلغ كاملاً وترحيل الباقي كرصيد</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5 leading-normal">
                    صرف {formatMoney(paymentAmountPiasters)} بالكامل، وتسجيل {formatMoney(excessPiasters)} رصيد لنا عنده.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Supplier had no debt initially */}
          {!isDebt && paymentAmountPiasters > 0 && (
            <div className="p-3 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-emerald-800/40 rounded-xl text-[11px] text-paid-dark dark:text-emerald-200 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-paid dark:text-paid-bright shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">تسجيل دفعة مقدمة تحت الحساب:</span>
                <span className="leading-relaxed block mt-0.5">
                  حساب المورد خالص حالياً. هذا المبلغ (<b className="font-mono font-bold">{formatMoney(paymentAmountPiasters)}</b>) سيُصرف من الدرج ويُسجل كرصيد لنا عند المورد، ليُخصم تلقائياً من فواتير الشراء القادمة.
                </span>
              </div>
            </div>
          )}

          {/* Payment Source Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-ink dark:text-ink-dark block">
              مصدر النقدية المصروفة للسداد <span className="text-danger dark:text-danger-bright">*</span>
            </label>
            <CustomSelect
              value={paymentSource}
              onChange={(val) => setPaymentSource(val as any)}
              options={[
                { value: 'cash_drawer', label: 'من درج كاشير المحل (يخصم من نقدية الدرج والوردية)' },
                { value: 'external_cash', label: 'كاش خارجي من صاحب المحل (لا يخصم من الدرج)' },
              ]}
            />

            {paymentSource === 'cash_drawer' && (
              <div className="space-y-1 mt-1">
                <div className="p-2 rounded-xl border text-xs bg-surface dark:bg-surface-dark border-line dark:border-line-dark flex items-center justify-between">
                  <span className="text-ink-muted dark:text-ink-dark-muted font-bold text-[11px]">كاش الدرج المتوفر حالياً:</span>
                  <span className={`font-mono font-black text-xs ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                    {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                  </span>
                </div>

                {liveDrawerCashPiasters !== null && (liveDrawerCashPiasters <= 0 || (effectiveAmountPiasters > 0 && effectiveAmountPiasters > liveDrawerCashPiasters)) && (
                  <div className="p-2 rounded-xl border text-[11px] bg-danger-soft dark:bg-danger-dark-soft border-danger/30 text-danger dark:text-danger-bright space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {liveDrawerCashPiasters <= 0
                          ? 'درج الكاشير فارغ (0.00 ج.م)!'
                          : 'رصيد نقدية الدرج غير كافٍ!'}
                      </span>
                    </div>
                    <p className="text-[10.5px] leading-relaxed">
                      {liveDrawerCashPiasters <= 0
                        ? 'لا يمكن صرف نقدية من درج فارغ. إذا كان السداد من مالك المحل، يرجى تغيير مصدر النقدية إلى: «كاش خارجي من صاحب المحل».'
                        : `المبلغ المراد صرفه (${formatArabicCurrency(effectiveAmountPiasters)}) أكبر من نقدية الدرج (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى اختيار «كاش خارجي من صاحب المحل».`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Outcome Preview Banner */}
          {paymentAmountPiasters > 0 && (
            <div className={`p-3 rounded-xl border text-[11.5px] flex items-center justify-between font-medium ${
              balanceAfter > 0
                ? 'bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
                : balanceAfter < 0
                ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-emerald-800/40 text-paid dark:text-paid-bright'
                : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark'
            }`}>
              <span className="font-semibold">حساب المورد بعد التنفيذ:</span>
              <span className="font-mono font-bold text-xs">
                {balanceAfter > 0
                  ? `متبقي له علينا: ${formatMoney(balanceAfter)}`
                  : balanceAfter < 0
                  ? `دافعين مقدم: ${formatMoney(Math.abs(balanceAfter))} (لنا فلوس)`
                  : 'خالص تماماً (0.00 ج.م)'}
              </span>
            </div>
          )}

          {/* Notes Input */}
          <div>
            <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
              ملاحظات / رقم إذن الصرف أو الوصل
            </label>
            <input
              type="text"
              placeholder={
                hasExcess
                  ? (excessAction === 'pay_exact' ? 'سداد حساب خالص' : 'سداد حساب + دفعة مقدمة')
                  : isDebt
                  ? 'سداد دفعة نقدية للمورد'
                  : 'دفعة مقدمة تحت الحساب'
              }
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full h-9 px-3 bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-lg text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-line dark:border-line-dark">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark font-semibold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={
                paymentAmountPiasters <= 0 ||
                (paymentSource === 'cash_drawer' &&
                  liveDrawerCashPiasters !== null &&
                  (liveDrawerCashPiasters <= 0 || effectiveAmountPiasters > liveDrawerCashPiasters))
              }
              className="px-5 py-2 rounded-xl bg-paid dark:bg-emerald-600 hover:bg-paid-hover dark:hover:bg-emerald-500 text-white font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد الصرف</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
