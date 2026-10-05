import React from 'react';
import { Receipt, X } from 'lucide-react';
import type { Supplier, SupplierTransaction } from '../../types/models';
import { formatMoney } from './types';

interface SupplierStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  transactions: SupplierTransaction[];
}

export const SupplierStatementModal: React.FC<SupplierStatementModalProps> = ({
  isOpen,
  onClose,
  supplier,
  transactions,
}) => {
  if (!isOpen || !supplier) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shadow-2xs">
              <Receipt className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-ink">
              كشف حساب المورد: {supplier.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 bg-surface-2 border-b border-line flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs text-ink-muted block">الرصيد القائم المستحق للمورد:</span>
            <span className="text-xl font-mono font-bold text-danger">
              {formatMoney(supplier.balancePiasters)}
            </span>
          </div>
          <div className="text-left text-xs text-ink-muted">
            <span>عدد الحركات المسجلة: {transactions.length} حركة</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line p-2">
          {transactions.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-ink-muted">
              لا توجد حركات مسجلة في كشف حساب المورد حتى الآن
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="p-3 flex items-center justify-between text-xs hover:bg-surface-2/60 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">
                      {tx.transactionType === 'OPENING_BALANCE' && 'رصيد افتتاحي'}
                      {tx.transactionType === 'PURCHASE_INVOICE' && 'فاتورة شراء آجل'}
                      {tx.transactionType === 'PAYMENT' && 'سداد دفعة نقدية'}
                    </span>
                    <span className="text-[10px] text-ink-muted">
                      {new Date(tx.createdAt).toLocaleDateString('ar-EG-u-nu-latn', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {tx.notes && <span className="text-[11px] text-ink-muted block mt-0.5">{tx.notes}</span>}
                </div>

                <div className="font-mono font-bold text-sm">
                  {tx.amountPiasters > 0 ? (
                    <span className="text-danger">+{formatMoney(tx.amountPiasters)}</span>
                  ) : (
                    <span className="text-paid">
                      -{formatMoney(Math.abs(tx.amountPiasters))}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3.5 bg-surface border-t border-line flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 h-9 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق كشف الحساب
          </button>
        </div>
      </div>
    </div>
  );
};
