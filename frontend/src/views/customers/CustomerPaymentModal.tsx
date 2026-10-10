import React, { useState, useEffect } from 'react';
import { CreditCard, Sparkles, X, Coins, ArrowLeftRight, Check, AlertCircle } from 'lucide-react';
import type { Customer } from '../../types/models';
import { MoneyInput } from '../../components/MoneyInput';

export interface CustomerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: Customer | null;
  paymentAmountPiasters: number;
  setPaymentAmountPiasters: (v: number) => void;
  paymentNotes: string;
  setPaymentNotes: (v: string) => void;
  onRecordPayment: (e: React.FormEvent, effectiveAmountPiasters?: number, notes?: string) => void;
}

export const CustomerPaymentModal: React.FC<CustomerPaymentModalProps> = ({
  isOpen,
  onClose,
  selectedCustomer,
  paymentAmountPiasters,
  setPaymentAmountPiasters,
  paymentNotes,
  setPaymentNotes,
  onRecordPayment,
}) => {
  // 'return_change' = سداد المديونية فقط وإرجاع الباقي كاش في يد العميل
  // 'credit_account' = استلام المبلغ كاملاً وتسجيل الزيادة رصيد دائن تحت الحساب
  const [excessAction, setExcessAction] = useState<'return_change' | 'credit_account'>('return_change');

  useEffect(() => {
    if (isOpen) {
      setExcessAction('return_change');
    }
  }, [isOpen, selectedCustomer]);

  if (!isOpen || !selectedCustomer) return null;

  const currentBal = selectedCustomer.balancePiasters;
  const isDebt = currentBal > 0;
  const hasExcess = isDebt && paymentAmountPiasters > currentBal;
  const excessPiasters = hasExcess ? paymentAmountPiasters - currentBal : 0;

  // Effective amount and notes to submit
  const effectiveAmountPiasters = hasExcess && excessAction === 'return_change'
    ? currentBal
    : paymentAmountPiasters;

  const balanceAfter = currentBal - effectiveAmountPiasters;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveAmountPiasters <= 0) return;

    let autoNotes = paymentNotes.trim();
    if (!autoNotes) {
      if (hasExcess) {
        if (excessAction === 'return_change') {
          autoNotes = `سداد كامل المديونية (${(currentBal / 100).toFixed(2)} ج.م) وتم إرجاع الباقي (${(excessPiasters / 100).toFixed(2)} ج.م) كاش للعميل`;
        } else {
          autoNotes = `سداد مديونية (${(currentBal / 100).toFixed(2)} ج.م) + تسجيل زيادة (${(excessPiasters / 100).toFixed(2)} ج.م) رصيد دائن تحت الحساب`;
        }
      } else if (currentBal <= 0) {
        autoNotes = `استلام دفعة مقدمة تحت الحساب (${(paymentAmountPiasters / 100).toFixed(2)} ج.م)`;
      } else if (effectiveAmountPiasters === currentBal) {
        autoNotes = `سداد كامل المديونية (${(currentBal / 100).toFixed(2)} ج.م)`;
      } else {
        autoNotes = `سداد جزء من المديونية (${(effectiveAmountPiasters / 100).toFixed(2)} ج.م)`;
      }
    }

    onRecordPayment(e, effectiveAmountPiasters, autoNotes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-13 bg-surface-2 border-b border-line px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-paid-soft text-paid flex items-center justify-center shadow-2xs">
              {isDebt ? <CreditCard className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink">
                {isDebt ? 'سداد مديونية العميل' : 'استلام دفعة نقدية تحت الحساب'}
              </h3>
              <span className="text-[11px] text-ink-muted block -mt-0.5">
                {selectedCustomer.name}
              </span>
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
          {/* Customer Balance Summary Card */}
          <div className="p-3.5 bg-surface-2 rounded-xl border border-line space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted font-medium">اسم العميل في الدفتر:</span>
              <span className="font-bold text-ink text-sm">{selectedCustomer.name}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-line text-xs">
              <span className="text-ink-muted">
                {currentBal > 0
                  ? 'إجمالي المديونية المستحقة عليه:'
                  : currentBal < 0
                  ? 'رصيد دائن سابق (له فلوس):'
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
                  ? `${(Math.abs(currentBal) / 100).toFixed(2)} ج.م`
                  : 'خالص تماماً (0.00 ج.م)'}
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-ink block">
                المبلغ المستلم كاش من يد العميل <span className="text-danger">*</span>
              </label>
              {isDebt && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountPiasters(currentBal)}
                  className="text-[11px] font-bold text-brand hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Coins className="w-3 h-3" />
                  <span>دفع كامل الدين بالظبط ({(currentBal / 100).toFixed(2)} ج.م)</span>
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

          {/* Smart Excess Resolution Box when payment exceeds debt */}
          {hasExcess && (
            <div className="p-3.5 bg-surface-2 border border-line rounded-xl space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-ink text-xs block">
                    المبلغ المستلم ({(paymentAmountPiasters / 100).toFixed(2)} ج.م) أكبر من دين العميل ({(currentBal / 100).toFixed(2)} ج.م)
                  </span>
                  <span className="text-[11px] text-ink-muted block mt-0.5">
                    يوجد زيادة قدرها <b className="font-mono text-warn font-black">{(excessPiasters / 100).toFixed(2)} ج.م</b>. كيف تريد التعامل معها؟
                  </span>
                </div>
              </div>

              {/* Resolution Option 1: Return Change */}
              <button
                type="button"
                onClick={() => setExcessAction('return_change')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'return_change'
                    ? 'bg-surface border-brand ring-1 ring-brand text-ink shadow-2xs'
                    : 'bg-surface/50 border-line text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'return_change'
                    ? 'border-brand bg-brand text-white'
                    : 'border-line'
                }`}>
                  {excessAction === 'return_change' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-brand" />
                      <span>سداد الدين فقط وإرجاع الباقي كاش للعميل (المعتاد)</span>
                    </span>
                  </div>
                  <p className="text-[10.5px] text-ink-muted mt-1 leading-relaxed">
                    يسجل سداد <b>{(currentBal / 100).toFixed(2)} ج.م</b> فقط ويصبح حسابه خالصاً (0.00 ج.م)، وترد له باقي فكة <b>{(excessPiasters / 100).toFixed(2)} ج.م</b> كاش في يده.
                  </p>
                </div>
              </button>

              {/* Resolution Option 2: Credit Account */}
              <button
                type="button"
                onClick={() => setExcessAction('credit_account')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'credit_account'
                    ? 'bg-surface border-paid ring-1 ring-paid text-ink shadow-2xs'
                    : 'bg-surface/50 border-line text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'credit_account'
                    ? 'border-paid bg-paid text-white'
                    : 'border-line'
                }`}>
                  {excessAction === 'credit_account' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-paid" />
                      <span>تسجيل الزيادة كرصيد دائن تحت الحساب للعميل</span>
                    </span>
                  </div>
                  <p className="text-[10.5px] text-ink-muted mt-1 leading-relaxed">
                    يستلم الدرج المبلغ كاملاً <b>{(paymentAmountPiasters / 100).toFixed(2)} ج.م</b>، وتُسجل <b>{(excessPiasters / 100).toFixed(2)} ج.م</b> كرصيد للعميل تُخصم تلقائياً من مشترياته القادمة.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* When customer had no debt initially */}
          {!isDebt && paymentAmountPiasters > 0 && (
            <div className="p-3 bg-paid-soft border border-paid/30 rounded-xl text-[11px] text-paid-dark flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-paid shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">استلام دفعة مقدمة تحت الحساب:</span>
                <span className="leading-relaxed block mt-0.5">
                  حساب العميل خالص حالياً. سيتم إيداع مبلغ <b className="font-mono font-bold">{(paymentAmountPiasters / 100).toFixed(2)} ج.م</b> كرصيد دائن لصالحه في المحل، ليتم استهلاكه تلقائياً في فواتير الشكك القادمة.
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
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">حساب العميل بعد التنفيذ:</span>
              </div>
              <span className="font-mono font-bold text-xs">
                {balanceAfter > 0
                  ? `متبقي عليه: ${(balanceAfter / 100).toFixed(2)} ج.م`
                  : balanceAfter < 0
                  ? `له في المحل: ${(Math.abs(balanceAfter) / 100).toFixed(2)} ج.م (دائن)`
                  : 'خالص تماماً (0.00 ج.م)'}
              </span>
            </div>
          )}

          {/* Notes Input */}
          <div>
            <label className="text-xs font-bold text-ink block mb-1">
              ملاحظات أو بيان السند (اختياري)
            </label>
            <input
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder={
                hasExcess
                  ? (excessAction === 'return_change' ? 'تم رد باقي الفكة للعميل' : 'سداد وفائض تحت الحساب')
                  : isDebt
                  ? 'سداد نقدي من العميل'
                  : 'دفعة مقدمة تحت الحساب'
              }
              className="w-full h-9 px-3 bg-canvas border border-line rounded-lg focus:outline-none focus:border-brand text-ink text-xs transition-colors"
            />
          </div>

          {/* Actions */}
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
                  ? excessAction === 'return_change'
                    ? `سداد ${(currentBal / 100).toFixed(2)} ج.م ورد باقي ${(excessPiasters / 100).toFixed(2)} ج.م`
                    : `استلام ${(paymentAmountPiasters / 100).toFixed(2)} ج.م وتسجيل ${(excessPiasters / 100).toFixed(2)} تحت الحساب`
                  : isDebt
                  ? 'تأكيد السداد وتحديث الحساب'
                  : 'تأكيد استلام الدفعة المقدمة'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
