import React from 'react';
import { Banknote, X } from 'lucide-react';
import type { Supplier } from '../../types/models';
import { formatMoney } from './types';

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
            <h3 className="font-bold text-sm text-ink">سداد دفعة للمورد</h3>
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
            <span className="text-xs text-ink-muted block">المورد:</span>
            <span className="text-sm font-bold text-ink block">{supplier.name}</span>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-line text-xs">
              <span className="text-ink-muted">المديونية الحالية:</span>
              <span className="font-mono font-bold text-danger">
                {formatMoney(supplier.balancePiasters)}
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">
              مبلغ السداد (ج.م) <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              step="1"
              min="1"
              required
              value={(paymentAmountPiasters / 100).toFixed(2)}
              onChange={(e) => {
                const valEGP = parseFloat(e.target.value) || 0;
                setPaymentAmountPiasters(Math.round(valEGP * 100));
              }}
              className="w-full h-11 px-3 bg-surface-2 border-2 border-paid focus:bg-surface rounded-xl text-base font-mono font-bold text-paid focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">ملاحظات / رقم إذن الصرف</label>
            <input
              type="text"
              placeholder="سداد نقدي من الدرج..."
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
              تأكيد سداد المبلغ
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
