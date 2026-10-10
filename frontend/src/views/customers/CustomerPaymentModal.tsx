import React from 'react';
import { CreditCard, Sparkles, X } from 'lucide-react';
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
  onRecordPayment: (e: React.FormEvent) => void;
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
  if (!isOpen || !selectedCustomer) return null;

  const currentBal = selectedCustomer.balancePiasters;
  const balanceAfter = currentBal - paymentAmountPiasters;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <span className="text-sm font-bold text-ink flex items-center gap-1.5">
            {currentBal > 0 ? (
              <CreditCard className="w-4 h-4 text-paid" />
            ) : (
              <Sparkles className="w-4 h-4 text-paid" />
            )}
            <span>{currentBal > 0 ? 'تسجيل سداد فلوس من العميل' : 'استلام فلوس تحت الحساب من العميل'}</span>
          </span>
          <button onClick={onClose} className="text-ink-muted hover:text-ink cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onRecordPayment} className="p-4 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 bg-surface-2 rounded-lg border border-line space-y-1.5">
            <div className="flex justify-between text-ink">
              <span className="font-semibold">العميل:</span>
              <span className="font-bold">{selectedCustomer.name}</span>
            </div>
            {currentBal > 0 ? (
              <div className="flex justify-between text-danger">
                <span className="font-semibold">الفلوس اللي عليه دلوقتي:</span>
                <span className="font-bold font-mono text-[13px]">
                  {(currentBal / 100).toFixed(2)} ج.م (عليه فلوس)
                </span>
              </div>
            ) : currentBal < 0 ? (
              <div className="flex justify-between text-paid">
                <span className="font-semibold">فلوس سايبها في المحل:</span>
                <span className="font-bold font-mono text-[13px]">
                  {(Math.abs(currentBal) / 100).toFixed(2)} ج.م (له فلوس)
                </span>
              </div>
            ) : (
              <div className="flex justify-between text-ink-muted">
                <span className="font-semibold">حساب العميل:</span>
                <span className="font-bold font-mono text-[13px]">0.00 ج.م (خالص تماماً)</span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-ink font-semibold">المبلغ اللي دفعه العميل كاش *</label>
              {currentBal > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountPiasters(currentBal)}
                  className="text-[11px] font-bold text-brand hover:underline cursor-pointer"
                >
                  سدد كل اللي عليه ({(currentBal / 100).toFixed(2)} ج.م)
                </button>
              )}
            </div>
            <MoneyInput 
              valuePiasters={paymentAmountPiasters}
              onChangePiasters={setPaymentAmountPiasters}
            />
          </div>

          <div>
            <label className="block text-ink font-semibold mb-1">ملاحظات (اكتب أي تفاصيل لو تحب)</label>
            <input 
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder={currentBal > 0 ? "مثال: دفع جزء من اللي عليه" : "مثال: ساب فلوس مقدم تحت الحساب"}
              className="w-full h-8 px-3 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink"
            />
          </div>

          {paymentAmountPiasters > 0 && (
            <div className={`p-2.5 rounded-lg border text-[11px] flex justify-between font-medium ${
              balanceAfter > 0
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-paid-soft border-paid-border text-paid'
            }`}>
              <span>الحساب بعد الدفع:</span>
              <span className="font-mono font-bold">
                {balanceAfter > 0 ? (
                  `متبقي عليه فلوس: ${(balanceAfter / 100).toFixed(2)} ج.م`
                ) : balanceAfter < 0 ? (
                  `سايب فلوس في حسابه: ${(Math.abs(balanceAfter) / 100).toFixed(2)} ج.م`
                ) : (
                  'حسابه خالص على الصفر (0.00 ج.م)'
                )}
              </span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 hairline-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-surface border border-line hover:bg-surface-2 text-ink font-medium cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={paymentAmountPiasters <= 0}
              className="px-5 py-1.5 rounded bg-paid text-white hover:bg-emerald-700 font-bold disabled:opacity-50 cursor-pointer shadow-xs active:scale-95"
            >
              {currentBal > 0 && paymentAmountPiasters > currentBal 
                ? 'تسديد كل اللي عليه وسيب الباقي في حسابه' 
                : currentBal > 0 
                ? 'تأكيد استلام الفلوس وخصمها من حسابه' 
                : 'تأكيد استلام الفلوس وتنزيلها في حسابه'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
