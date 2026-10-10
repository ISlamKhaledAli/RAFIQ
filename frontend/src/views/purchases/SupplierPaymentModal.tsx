import React, { useState, useEffect } from 'react';
import { Banknote, X, CheckCheck, Sparkles, Coins, ArrowLeftRight, Check, AlertCircle } from 'lucide-react';
import type { Supplier } from '../../types/models';
import { formatMoney } from './types';
import { MoneyInput } from '../../components/MoneyInput';

interface SupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  paymentAmountPiasters: number;
  setPaymentAmountPiasters: (amount: number) => void;
  paymentNotes: string;
  setPaymentNotes: (notes: string) => void;
  onConfirmPayment: (e: React.FormEvent, effectiveAmountPiasters?: number, notes?: string) => void;
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

  useEffect(() => {
    if (isOpen) {
      setExcessAction('pay_exact');
    }
  }, [isOpen, supplier]);

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

    onConfirmPayment(e, effectiveAmountPiasters, autoNotes);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="h-14 bg-surface-2 border-b border-line px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-paid-soft text-paid flex items-center justify-center shadow-2xs">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink">سداد دفعة نقدية للمورد</h3>
              <span className="text-[11px] text-ink-muted block -mt-0.5">{supplier.name}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs flex-1 min-h-0 overflow-y-auto">
          {/* Supplier Info Box */}
          <div className="p-3.5 bg-surface-2 border border-line rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted font-medium">المورد أو الشركة:</span>
              <span className="text-sm font-bold text-ink">{supplier.name}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-line text-xs">
              <span className="text-ink-muted">
                {currentBal > 0
                  ? 'المبلغ المستحق للمورد علينا:'
                  : currentBal < 0
                  ? 'رصيدنا السابق عند المورد (دافعين مقدم):'
                  : 'حالة الحساب الحالية:'}
              </span>
              <span
                className={`font-mono font-black text-sm ${
                  currentBal > 0
                    ? 'text-danger'
                    : currentBal < 0
                    ? 'text-paid'
                    : 'text-ink-muted'
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
              <label className="text-xs font-bold text-ink block">
                المبلغ المراد سداده <span className="text-danger">*</span>
              </label>
              {isDebt && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountPiasters(currentBal)}
                  className="text-[11px] font-bold text-paid hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>سداد كامل الدين بالظبط ({formatMoney(currentBal)})</span>
                </button>
              )}
            </div>
            <MoneyInput
              valuePiasters={paymentAmountPiasters}
              onChangePiasters={setPaymentAmountPiasters}
              className="h-11 text-base text-paid font-black"
              autoFocus
            />
          </div>

          {/* Smart Excess Resolution Box */}
          {hasExcess && (
            <div className="p-3.5 bg-surface-2 border border-line rounded-xl space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-ink text-xs block">
                    المبلغ المكتوب ({formatMoney(paymentAmountPiasters)}) أكبر من دين المورد ({formatMoney(currentBal)})
                  </span>
                  <span className="text-[11px] text-ink-muted block mt-0.5">
                    يوجد زيادة قدرها <b className="font-mono text-warn font-black">{formatMoney(excessPiasters)}</b>. ماذا تريد أن تفعل بالزيادة؟
                  </span>
                </div>
              </div>

              {/* Option 1: Pay Exact */}
              <button
                type="button"
                onClick={() => setExcessAction('pay_exact')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'pay_exact'
                    ? 'bg-surface border-brand ring-1 ring-brand text-ink shadow-2xs'
                    : 'bg-surface/50 border-line text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'pay_exact'
                    ? 'border-brand bg-brand text-white'
                    : 'border-line'
                }`}>
                  {excessAction === 'pay_exact' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-brand" />
                      <span>صرف المستحق فقط وإبقاء الفائض في الخزينة (المعتاد)</span>
                    </span>
                  </div>
                  <p className="text-[10.5px] text-ink-muted mt-1 leading-relaxed">
                    يصرف للمورد <b>{formatMoney(currentBal)}</b> فقط ليصبح حسابه خالصاً (0.00 ج.م)، ويحتفظ بالفائض <b>{formatMoney(excessPiasters)}</b> داخل درج المحل.
                  </p>
                </div>
              </button>

              {/* Option 2: Advance Credit */}
              <button
                type="button"
                onClick={() => setExcessAction('advance_credit')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'advance_credit'
                    ? 'bg-surface border-paid ring-1 ring-paid text-ink shadow-2xs'
                    : 'bg-surface/50 border-line text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'advance_credit'
                    ? 'border-paid bg-paid text-white'
                    : 'border-line'
                }`}>
                  {excessAction === 'advance_credit' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-paid" />
                      <span>صرف المبلغ كاملاً وترحيل الزيادة دفعة مقدمة تحت الحساب</span>
                    </span>
                  </div>
                  <p className="text-[10.5px] text-ink-muted mt-1 leading-relaxed">
                    يصرف من الدرج <b>{formatMoney(paymentAmountPiasters)}</b> كاملاً، وتُسجل الزيادة <b>{formatMoney(excessPiasters)}</b> رصيداً لنا عند المورد تُخصم تلقائياً من الفواتير القادمة.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Supplier had no debt initially */}
          {!isDebt && paymentAmountPiasters > 0 && (
            <div className="p-3 bg-paid-soft border border-paid/30 rounded-xl text-[11px] text-paid-dark flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-paid shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">تسجيل دفعة مقدمة تحت الحساب:</span>
                <span className="leading-relaxed block mt-0.5">
                  حساب المورد خالص حالياً. هذا المبلغ (<b className="font-mono font-bold">{formatMoney(paymentAmountPiasters)}</b>) سيُصرف من الدرج ويُسجل كرصيد لنا عند المورد، ليُخصم تلقائياً من فواتير الشراء القادمة.
                </span>
              </div>
            </div>
          )}

          {/* Outcome Preview Banner */}
          {paymentAmountPiasters > 0 && (
            <div className={`p-3 rounded-xl border text-[11.5px] flex items-center justify-between font-medium ${
              balanceAfter > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : balanceAfter < 0
                ? 'bg-paid-soft border-paid-border text-paid'
                : 'bg-surface-2 border-line text-ink'
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
            <label className="text-xs font-bold text-ink block mb-1">
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
              className="w-full h-9 px-3 bg-canvas border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-brand transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface border border-line hover:bg-surface-2 text-ink font-semibold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={paymentAmountPiasters <= 0}
              className="px-5 py-2 rounded-xl bg-paid hover:bg-paid-hover text-white font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>
                {hasExcess
                  ? excessAction === 'pay_exact'
                    ? `صرف المستحق فقط (${formatMoney(currentBal)})`
                    : `صرف ${formatMoney(paymentAmountPiasters)} وترحيل ${formatMoney(excessPiasters)} تحت الحساب`
                  : isDebt
                  ? 'تأكيد السداد وتحديث الحساب'
                  : 'تأكيد صرف الدفعة المقدمة'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
