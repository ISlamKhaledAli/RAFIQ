import React from 'react';
import { Receipt, X } from 'lucide-react';
import type { Supplier, SupplierTransaction } from '../../types/models';
import { useModalDismiss } from '../../hooks/useModalDismiss';
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
  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: Boolean(isOpen && supplier),
    onClose,
    isDirty: false,
  });

  if (!isOpen || !supplier) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center shadow-2xs">
              <Receipt className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-ink dark:text-ink-dark">
              كشف حساب المورد: {supplier.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted block">
              {supplier.balancePiasters > 0
                ? 'فلوس للمورد علينا (حسابه):'
                : supplier.balancePiasters < 0
                ? 'فلوس سايبينها عند المورد (لينا عنده):'
                : 'حساب المورد:'}
            </span>
            <span
              className={`text-xl font-mono font-bold ${
                supplier.balancePiasters > 0
                  ? 'text-danger dark:text-danger-bright'
                  : supplier.balancePiasters < 0
                  ? 'text-paid dark:text-paid-bright'
                  : 'text-ink-muted dark:text-ink-dark-muted'
              }`}
            >
              {supplier.balancePiasters !== 0
                ? formatMoney(Math.abs(supplier.balancePiasters))
                : 'خالص تماماً (0.00 ج.م)'}
            </span>
          </div>
          <div className="text-left text-xs text-ink-muted dark:text-ink-dark-muted">
            <span>عدد الحركات المسجلة: {transactions.length} حركة</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark p-2">
          {transactions.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-ink-muted dark:text-ink-dark-muted">
              مفيش حركات مسجلة للمورد ده لحد دلوقتي
            </div>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="p-3 flex items-center justify-between text-xs hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink dark:text-ink-dark">
                      {tx.transactionType === 'OPENING_BALANCE' && 'حسابه القديم (أول المدة)'}
                      {tx.transactionType === 'PURCHASE_INVOICE' && 'فاتورة بضاعة جديدة (على الحساب)'}
                      {tx.transactionType === 'PURCHASE_OVERPAYMENT' && 'دفعنا بالزيادة ونزل في حسابنا'}
                      {tx.transactionType === 'PAYMENT' && 'دفعنا له كاش (سداد)'}
                      {tx.transactionType === 'PAYMENT_CANCEL' && 'قيد عكسي (إلغاء سند صرف)'}
                      {tx.transactionType === 'PURCHASE_RETURN' && 'مرتجع مشتريات (تخفيض دين)'}
                      {tx.transactionType === 'PURCHASE_PAID_CASH' && 'فاتورة بضاعة مسددة نقداً بالكامل'}
                      {tx.transactionType === 'MANUAL_ADJUSTMENT' && 'تسوية رصيد يدوية'}
                      {!['OPENING_BALANCE', 'PURCHASE_INVOICE', 'PURCHASE_OVERPAYMENT', 'PAYMENT', 'PAYMENT_CANCEL', 'PURCHASE_RETURN', 'PURCHASE_PAID_CASH', 'MANUAL_ADJUSTMENT'].includes(tx.transactionType) && (tx.transactionType || 'حركة حسابية')}
                    </span>
                    <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">
                      {new Date(tx.createdAt).toLocaleDateString('ar-EG-u-nu-latn', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {tx.notes && <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted block mt-0.5">{tx.notes}</span>}
                  {tx.balanceAfterPiasters !== undefined && (
                    <span className="text-[10px] font-mono text-ink-muted dark:text-ink-dark-muted block mt-0.5">
                      الرصيد التراكمي: {formatMoney(tx.balanceAfterPiasters)}
                    </span>
                  )}
                </div>

                <div className="font-mono font-bold text-sm">
                  {tx.amountPiasters > 0 ? (
                    <span className="text-danger dark:text-danger-bright">+{formatMoney(tx.amountPiasters)}</span>
                  ) : tx.amountPiasters < 0 ? (
                    <span className="text-paid dark:text-paid-bright">
                      -{formatMoney(Math.abs(tx.amountPiasters))}
                    </span>
                  ) : (
                    <span className="text-ink-muted dark:text-ink-dark-muted text-xs font-semibold">
                      0.00 ج.م (خالص)
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3.5 bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark flex justify-end shrink-0">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="px-5 h-9 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق كشف الحساب
          </button>
        </div>
      </div>
    </div>
  );
};
