import React from 'react';
import { CreditCard, X } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <span className="text-sm font-bold text-ink flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-paid" />
            <span>تسجيل دفعة سداد دين</span>
          </span>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onRecordPayment} className="p-4 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 bg-surface-2 rounded border border-line space-y-1">
            <div className="flex justify-between text-ink">
              <span className="font-semibold">العميل:</span>
              <span className="font-bold">{selectedCustomer.name}</span>
            </div>
            <div className="flex justify-between text-danger">
              <span className="font-semibold">إجمالي الدين الحالي:</span>
              <span className="font-bold font-mono text-[13px]">
                {(selectedCustomer.balancePiasters / 100).toFixed(2)} ج.م
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-ink font-semibold">المبلغ المسدد نقداً *</label>
              {selectedCustomer.balancePiasters > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountPiasters(selectedCustomer.balancePiasters)}
                  className="text-[11px] font-bold text-brand hover:underline"
                >
                  سدد الكل ({(selectedCustomer.balancePiasters / 100).toFixed(2)} ج.م)
                </button>
              )}
            </div>
            <MoneyInput 
              valuePiasters={paymentAmountPiasters}
              onChangePiasters={setPaymentAmountPiasters}
            />
          </div>

          <div>
            <label className="block text-ink font-semibold mb-1">ملاحظات السداد</label>
            <input 
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="مثال: سداد نقدي جزئي"
              className="w-full h-8 px-3 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink"
            />
          </div>

          {paymentAmountPiasters > 0 && (
            <div className="p-2 bg-paid-soft border border-paid-border rounded text-[11px] flex justify-between text-paid font-medium">
              <span>الرصيد بعد السداد:</span>
              <span className="font-mono font-bold">
                {(Math.max(0, selectedCustomer.balancePiasters - paymentAmountPiasters) / 100).toFixed(2)} ج.م
              </span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 hairline-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-surface border border-line hover:bg-surface-2 text-ink font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={paymentAmountPiasters <= 0}
              className="px-5 py-1.5 rounded bg-paid text-white hover:bg-emerald-700 font-bold disabled:opacity-50"
            >
              تأكيد السداد والخصم
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
