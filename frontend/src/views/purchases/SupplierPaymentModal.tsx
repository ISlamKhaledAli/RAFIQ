import React from 'react';
import { Banknote, X, CheckCheck, Sparkles } from 'lucide-react';
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
  onConfirmPayment: (e: React.FormEvent) => void;
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
  if (!isOpen || !supplier) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-paid-soft text-paid flex items-center justify-center shadow-2xs">
              <Banknote className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-ink">سداد دفعة وفلوس للمورد</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onConfirmPayment} className="p-5 space-y-4">
          <div className="p-3 bg-surface-2 border border-line rounded-xl">
            <span className="text-xs text-ink-muted block">المورد أو الشركة:</span>
            <span className="text-sm font-bold text-ink block">{supplier.name}</span>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-line text-xs">
              <span className="text-ink-muted">
                {supplier.balancePiasters > 0
                  ? 'فلوس المورد اللي علينا دلوقتي:'
                  : supplier.balancePiasters < 0
                  ? 'فلوسنا اللي عند المورد (دافعين مقدم):'
                  : 'حالة الحساب مع المورد:'}
              </span>
              <span
                className={`font-mono font-bold ${
                  supplier.balancePiasters > 0
                    ? 'text-danger'
                    : supplier.balancePiasters < 0
                    ? 'text-paid'
                    : 'text-ink-muted'
                }`}
              >
                {supplier.balancePiasters !== 0
                  ? formatMoney(Math.abs(supplier.balancePiasters))
                  : 'خالص (0.00 ج.م)'}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-ink block">
                المبلغ المدفوع <span className="text-danger">*</span>
              </label>
              {supplier.balancePiasters > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountPiasters(supplier.balancePiasters)}
                  className="text-[11px] font-bold text-paid hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>دفع كامل الحساب</span>
                </button>
              )}
            </div>
            <MoneyInput
              valuePiasters={paymentAmountPiasters}
              onChangePiasters={setPaymentAmountPiasters}
              className="h-11 text-base text-paid font-bold"
              autoFocus
            />
            {paymentAmountPiasters > 0 && (
              <div className="mt-2">
                {supplier.balancePiasters > 0 ? (
                  paymentAmountPiasters > supplier.balancePiasters ? (
                    <div className="p-2.5 bg-paid-soft border border-paid/30 rounded-xl text-[11px] text-paid-dark flex flex-col gap-1">
                      <div className="flex items-center gap-1 font-bold">
                        <Sparkles className="w-3.5 h-3.5 text-paid shrink-0" />
                        <span>سداد كامل الحساب + دفع مقدم تحت الحساب:</span>
                      </div>
                      <span className="leading-relaxed">
                        هيتسدد كل الدين ({formatMoney(supplier.balancePiasters)})، والزيادة (
                        <b className="font-mono text-paid font-extrabold">{formatMoney(paymentAmountPiasters - supplier.balancePiasters)}</b>) هتترحل كرصيد لينا عند المورد تحت الحساب يتخصم تلقائياً من الفواتير الجاية.
                      </span>
                    </div>
                  ) : paymentAmountPiasters === supplier.balancePiasters ? (
                    <div className="p-2 bg-paid-soft border border-paid/20 rounded-xl text-[11px] text-paid-dark flex items-center gap-1.5 font-bold">
                      <CheckCheck className="w-3.5 h-3.5 text-paid shrink-0" />
                      <span>سداد كامل الحساب بالظبط، الحساب هيبقى خالص (0.00 ج.م).</span>
                    </div>
                  ) : (
                    <div className="p-2 bg-surface-2 border border-line rounded-xl text-[11px] text-ink-muted flex items-center justify-between">
                      <span>المتبقي للمورد بعد السداد ده:</span>
                      <span className="font-mono font-bold text-danger">
                        {formatMoney(supplier.balancePiasters - paymentAmountPiasters)}
                      </span>
                    </div>
                  )
                ) : (
                  <div className="p-2.5 bg-paid-soft border border-paid/30 rounded-xl text-[11px] text-paid-dark flex flex-col gap-1">
                    <div className="flex items-center gap-1 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-paid shrink-0" />
                      <span>دفعة مقدمة تحت الحساب:</span>
                    </div>
                    <span className="leading-relaxed">
                      المبلغ ده (<b className="font-mono text-paid font-extrabold">{formatMoney(paymentAmountPiasters)}</b>) هيتضاف لرصيدنا عند المورد، وهيتخصم تلقائياً أول ما نشتري منه أي بضاعة.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">ملاحظات / رقم إذن الصرف أو الوصل</label>
            <input
              type="text"
              placeholder="سداد كاش من الدرج أو تحويل..."
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-line">
            <button
              type="submit"
              className="flex-1 h-10 bg-paid hover:bg-paid-hover text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
            >
              تأكيد ودفع الفلوس
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-10 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
