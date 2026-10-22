import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, Sparkles, X, Coins, ArrowLeftRight, Check, AlertCircle, Smartphone, Building2 } from 'lucide-react';
import type { Customer } from '../../types/models';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { formatArabicCurrency } from '../../utils/money';
import { invoke } from '../../bridge/ipc';

export interface CustomerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: Customer | null;
  paymentAmountPiasters: number;
  setPaymentAmountPiasters: (v: number) => void;
  paymentNotes: string;
  setPaymentNotes: (v: string) => void;
  onRecordPayment: (
    e: React.FormEvent,
    effectiveAmountPiasters?: number,
    notes?: string,
    paymentMethod?: string,
    digitalAccountId?: string
  ) => void;
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'instapay' | 'wallet' | 'card'>('cash');
  const [digitalAccountId, setDigitalAccountId] = useState<string>('');
  const [digitalAccounts, setDigitalAccounts] = useState<{ id: string; name: string; type: string; isActive?: boolean }[]>([]);

  useEffect(() => {
    if (isOpen) {
      setExcessAction('return_change');
      setPaymentMethod('cash');
      setDigitalAccountId('');
      void (async () => {
        try {
          const res = await invoke<{ id: string; name: string; type: string; isActive?: boolean }[]>('wallets:getAccounts');
          if (Array.isArray(res)) {
            setDigitalAccounts(res.filter(a => a.isActive !== false));
          }
        } catch {
          // Fallback if not available
        }
      })();
    }
  }, [isOpen, selectedCustomer]);

  const availableDigitalAccounts = useMemo(() => {
    if (paymentMethod === 'cash') return [];
    if (paymentMethod === 'card') {
      return digitalAccounts.filter(a => a.type === 'instapay' || a.type === 'bank' || a.type === 'card');
    }
    return digitalAccounts.filter(a => a.type === paymentMethod);
  }, [digitalAccounts, paymentMethod]);

  const isDirty = paymentAmountPiasters > 0 || Boolean(paymentNotes.trim());

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && Boolean(selectedCustomer),
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء سداد حساب العميل؟',
    confirmMessage: 'تم إدخال بيانات سداد للعميل. هل أنت متأكد من الإلغاء والتراجع دون تسجيل السداد؟',
  });

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

    const methodLabel =
      paymentMethod === 'instapay'
        ? 'إنستاباي'
        : paymentMethod === 'wallet'
        ? 'محفظة كاش'
        : paymentMethod === 'card'
        ? 'تحويل بنكي / فيزا'
        : 'نقداً';

    let autoNotes = paymentNotes.trim();
    if (!autoNotes) {
      if (hasExcess) {
        if (excessAction === 'return_change') {
          autoNotes = `سداد كامل المديونية (${formatArabicCurrency(currentBal)}) عبر ${methodLabel} وتم إرجاع الباقي (${formatArabicCurrency(excessPiasters)}) كاش للعميل`;
        } else {
          autoNotes = `سداد مديونية (${formatArabicCurrency(currentBal)}) عبر ${methodLabel} + تسجيل زيادة (${formatArabicCurrency(excessPiasters)}) رصيد دائن تحت الحساب`;
        }
      } else if (currentBal <= 0) {
        autoNotes = `استلام دفعة مقدمة تحت الحساب (${formatArabicCurrency(paymentAmountPiasters)}) عبر ${methodLabel}`;
      } else if (effectiveAmountPiasters === currentBal) {
        autoNotes = `سداد كامل المديونية (${formatArabicCurrency(currentBal)}) عبر ${methodLabel}`;
      } else {
        autoNotes = `سداد جزء من المديونية (${formatArabicCurrency(effectiveAmountPiasters)}) عبر ${methodLabel}`;
      }
    }

    onRecordPayment(e, effectiveAmountPiasters, autoNotes, paymentMethod, digitalAccountId || undefined);
  };

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-surface dark:bg-surface-dark rounded-2xl shadow-2xl border border-line dark:border-line-dark w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-13 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center shadow-2xs">
              {isDebt ? <CreditCard className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink dark:text-ink-dark">
                {isDebt ? 'سداد مديونية العميل' : 'استلام دفعة نقدية تحت الحساب'}
              </h3>
              <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted block -mt-0.5">
                {selectedCustomer.name}
              </span>
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
          {/* Customer Balance Summary Card */}
          <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-muted dark:text-ink-dark-muted font-medium">اسم العميل في الدفتر:</span>
              <span className="font-bold text-ink dark:text-ink-dark text-sm">{selectedCustomer.name}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-line dark:border-line-dark text-xs">
              <span className="text-ink-muted dark:text-ink-dark-muted">
                {currentBal > 0
                  ? 'إجمالي المديونية المستحقة عليه:'
                  : currentBal < 0
                  ? 'رصيد دائن سابق (له فلوس):'
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
                  ? formatArabicCurrency(Math.abs(currentBal))
                  : 'خالص تماماً (0.00 ج.م)'}
              </span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1.5">
              طريقة استلام وسداد الدفعة <span className="text-danger dark:text-danger-bright">*</span>
            </label>
            <CustomSelect
              value={paymentMethod}
              onChange={(val) => {
                setPaymentMethod(val as 'cash' | 'instapay' | 'wallet' | 'card');
                setDigitalAccountId('');
              }}
              options={[
                { value: 'cash', label: 'نقداً (كاش بالدرج)', icon: <Coins className="w-4 h-4 text-paid" /> },
                { value: 'instapay', label: 'إنستاباي (InstaPay)', icon: <Smartphone className="w-4 h-4 text-brand" /> },
                { value: 'wallet', label: 'محفظة كاش (فودافون / أورنج / اتصالات)', icon: <Smartphone className="w-4 h-4 text-brand" /> },
                { value: 'card', label: 'تحويل بنكي / فيزا', icon: <Building2 className="w-4 h-4 text-brand" /> },
              ]}
              className="w-full"
            />
          </div>

          {availableDigitalAccounts.length > 0 && (
            <div className="animate-in fade-in duration-150">
              <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                توجيه الرصيد إلى الحساب / المحفظة
              </label>
              <CustomSelect
                value={digitalAccountId}
                onChange={setDigitalAccountId}
                options={[
                  { value: '', label: 'الحساب الافتراضي للنظام' },
                  ...availableDigitalAccounts.map((acc) => ({
                    value: acc.id,
                    label: acc.name,
                  })),
                ]}
                className="w-full"
              />
            </div>
          )}

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-ink dark:text-ink-dark block">
                {paymentMethod === 'cash'
                  ? 'المبلغ المستلم كاش من يد العميل'
                  : 'المبلغ المحول إلكترونياً من العميل'}{' '}
                <span className="text-danger dark:text-danger-bright">*</span>
              </label>
              {isDebt && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountPiasters(currentBal)}
                  className="text-[11px] font-bold text-brand dark:text-brand-bright hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Coins className="w-3 h-3" />
                  <span>دفع كامل الدين بالظبط ({formatArabicCurrency(currentBal)})</span>
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

          {/* Smart Excess Resolution Box when payment exceeds debt */}
          {hasExcess && (
            <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 px-3 py-1.5 rounded-lg text-xs">
                <div className="flex items-center gap-1.5 font-bold text-ink dark:text-ink-dark">
                  <AlertCircle className="w-3.5 h-3.5 text-warn dark:text-warn-bright shrink-0" />
                  <span>زيادة عن الدين المطلوب:</span>
                </div>
                <span className="font-mono font-black text-warn dark:text-warn-bright text-xs">
                  {formatArabicCurrency(excessPiasters)}
                </span>
              </div>

              {/* Resolution Option 1: Return Change */}
              <button
                type="button"
                onClick={() => setExcessAction('return_change')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'return_change'
                    ? 'bg-surface dark:bg-surface-dark border-brand dark:border-brand-bright ring-1 ring-brand dark:ring-brand-bright text-ink dark:text-ink-dark shadow-2xs'
                    : 'bg-surface/50 dark:bg-surface-dark/50 border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'return_change'
                    ? 'border-brand dark:border-brand-bright bg-brand dark:bg-brand-bright text-white dark:text-ink'
                    : 'border-line dark:border-line-dark'
                }`}>
                  {excessAction === 'return_change' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                      <span>رجّع الباقي كاش للزبون</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5 leading-normal">
                    سداد الدين كامل، وترد له <b>{formatArabicCurrency(excessPiasters)}</b> فكة في إيده.
                  </p>
                </div>
              </button>

              {/* Resolution Option 2: Credit Account */}
              <button
                type="button"
                onClick={() => setExcessAction('credit_account')}
                className={`w-full p-2.5 rounded-lg border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                  excessAction === 'credit_account'
                    ? 'bg-surface dark:bg-surface-dark border-paid dark:border-paid-bright ring-1 ring-paid dark:ring-paid-bright text-ink dark:text-ink-dark shadow-2xs'
                    : 'bg-surface/50 dark:bg-surface-dark/50 border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:bg-surface dark:hover:bg-surface-dark hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                  excessAction === 'credit_account'
                    ? 'border-paid dark:border-paid-bright bg-paid dark:bg-paid-bright text-white dark:text-ink'
                    : 'border-line dark:border-line-dark'
                }`}>
                  {excessAction === 'credit_account' && <Check className="w-2.5 h-2.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-ink dark:text-ink-dark flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                      <span>سيب الزيادة رصيد في حسابه</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted mt-0.5 leading-normal">
                    تسجيل <b>{formatArabicCurrency(excessPiasters)}</b> رصيد له تتخصم من فواتيره الجاية.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* When customer had no debt initially */}
          {!isDebt && paymentAmountPiasters > 0 && (
            <div className="p-2.5 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-emerald-800/40 rounded-xl text-xs text-paid dark:text-paid-bright flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-paid dark:text-paid-bright shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">دفعة مقدّمة تحت الحساب:</span>
                <span className="text-[11px] block mt-0.5">
                  الزبون معلهوش دين حالياً — المبلغ (<b className="font-mono font-bold">{formatArabicCurrency(paymentAmountPiasters)}</b>) هيتسجل رصيد في حسابه يتخصم من مشترياته الجاية.
                </span>
              </div>
            </div>
          )}

          {/* Outcome Preview Banner */}
          {paymentAmountPiasters > 0 && (
            <div className={`p-3 rounded-xl border text-[11.5px] flex items-center justify-between font-medium ${
              balanceAfter > 0
                ? 'bg-warn-soft dark:bg-warn-dark-soft border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright'
                : balanceAfter < 0
                ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid-border dark:border-emerald-800/40 text-paid dark:text-paid-bright'
                : 'bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark'
            }`}>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">حساب العميل بعد التنفيذ:</span>
              </div>
              <span className="font-mono font-bold text-xs">
                {balanceAfter > 0
                  ? `متبقي عليه: ${formatArabicCurrency(balanceAfter)}`
                  : balanceAfter < 0
                  ? `له في المحل: ${formatArabicCurrency(Math.abs(balanceAfter))} (دائن)`
                  : 'خالص تماماً (0.00 ج.م)'}
              </span>
            </div>
          )}

          {/* Notes Input */}
          <div>
            <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
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
              className="w-full h-9 px-3 bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded-lg focus:outline-none focus:border-brand dark:focus:border-brand-bright text-ink dark:text-ink-dark text-xs transition-colors"
            />
          </div>

          {/* Actions */}
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
              disabled={paymentAmountPiasters <= 0}
              className="px-5 py-2 rounded-xl bg-paid hover:bg-paid-hover text-white font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد السداد</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
