import React from 'react';
import { Receipt, X } from 'lucide-react';
import type { Supplier, SupplierTransaction } from '../../types/models';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { formatMoney } from './types';
import { DateFilterControl } from '../../components/DateFilterControl';
import {
  type DateFilterValue,
  DEFAULT_DATE_FILTER,
  describeDateFilter,
  isDateFilterActive,
} from '../../utils/dateFilter';
import { SUPPLIER_STATEMENT_LOAD_LIMIT } from './purchasesQuery';

interface SupplierStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  transactions: SupplierTransaction[];
  /** The period is applied by the backend query, so the parent owns the state and the load. */
  dateFilter: DateFilterValue;
  onDateFilterChange: (value: DateFilterValue) => void;
  loading: boolean;
}

export const SupplierStatementModal: React.FC<SupplierStatementModalProps> = ({
  isOpen,
  onClose,
  supplier,
  transactions,
  dateFilter,
  onDateFilterChange,
  loading,
}) => {
  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: Boolean(isOpen && supplier),
    onClose,
    isDirty: false,
  });

  if (!isOpen || !supplier) return null;

  const isDateActive = isDateFilterActive(dateFilter);
  const periodLabel = describeDateFilter(dateFilter);
  const isTruncated = transactions.length >= SUPPLIER_STATEMENT_LOAD_LIMIT;

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
            <h3 className="t-modal-title text-ink dark:text-ink-dark">
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
                : 'خالص تماماً'}
            </span>
          </div>
          <div className="text-left text-xs text-ink-muted dark:text-ink-dark-muted">
            <span>
              {isDateActive ? `الحركات في الفترة (${periodLabel}): ` : 'عدد الحركات المسجلة: '}
              {transactions.length}{isTruncated ? '+' : ''} حركة
            </span>
          </div>
        </div>

        <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-2 shrink-0">
          <DateFilterControl
            value={dateFilter}
            onChange={onDateFilterChange}
            variant="pills"
            size="sm"
          />
          {isTruncated && (
            <span className="text-xs font-mono font-bold text-warn dark:text-warn-bright">
              معروض أحدث {SUPPLIER_STATEMENT_LOAD_LIMIT} حركة فقط، حدّد فترة أضيق
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark p-2">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-xs text-ink-muted dark:text-ink-dark-muted">
              جاري تحميل كشف حساب المورد...
            </div>
          ) : transactions.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-xs text-ink-muted dark:text-ink-dark-muted">
              <span>{isDateActive ? `لا توجد حركات مسجلة خلال الفترة المحددة (${periodLabel})` : 'مفيش حركات مسجلة للمورد ده لحد دلوقتي'}</span>
              {isDateActive && (
                <button
                  type="button"
                  onClick={() => onDateFilterChange({ ...DEFAULT_DATE_FILTER })}
                  className="h-8 px-3 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 text-xs font-bold cursor-pointer hover:bg-brand/10 transition-colors"
                >
                  عرض كل الفترات
                </button>
              )}
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
                      {tx.transactionType === 'PAYMENT' && (
                        tx.paymentSource === 'instapay'
                          ? 'سداد دفعة (تحويل إنستاباي)'
                          : tx.paymentSource === 'vodafone_cash'
                          ? 'سداد دفعة (فودافون كاش)'
                          : tx.paymentSource === 'external_cash'
                          ? 'سداد دفعة كاش خارجي (صاحب المحل)'
                          : 'سداد دفعة كاش (من الدرج)'
                      )}
                      {tx.transactionType === 'PAYMENT_CANCEL' && 'قيد عكسي (إلغاء سند صرف)'}
                      {tx.transactionType === 'PURCHASE_RETURN' && 'مرتجع مشتريات (تخفيض دين)'}
                      {tx.transactionType === 'PURCHASE_PAID_CASH' && (
                        tx.paymentSource === 'instapay'
                          ? 'فاتورة بضاعة مسددة بالكامل (إنستاباي)'
                          : tx.paymentSource === 'vodafone_cash'
                          ? 'فاتورة بضاعة مسددة بالكامل (فودافون كاش)'
                          : tx.paymentSource === 'external_cash'
                          ? 'فاتورة بضاعة مسددة كاش خارجي (صاحب المحل)'
                          : 'فاتورة بضاعة مسددة نقداً بالكامل'
                      )}
                      {tx.transactionType === 'PURCHASE_RETURN_CASH' && 'مرتجع مشتريات مسترد نقداً'}
                      {tx.transactionType === 'MANUAL_ADJUSTMENT' && 'تسوية رصيد يدوية'}
                      {!['OPENING_BALANCE', 'PURCHASE_INVOICE', 'PURCHASE_OVERPAYMENT', 'PAYMENT', 'PAYMENT_CANCEL', 'PURCHASE_RETURN', 'PURCHASE_PAID_CASH', 'PURCHASE_RETURN_CASH', 'MANUAL_ADJUSTMENT'].includes(tx.transactionType) && (tx.transactionType || 'حركة حسابية')}
                    </span>
                    {tx.paymentSource && (tx.transactionType === 'PAYMENT' || tx.transactionType === 'PURCHASE_PAID_CASH') && (
                      <span className={`px-2 py-0.5 rounded text-micro font-bold ${
                        tx.paymentSource === 'instapay'
                          ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright'
                          : tx.paymentSource === 'vodafone_cash'
                          ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
                          : tx.paymentSource === 'external_cash'
                          ? 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted'
                          : 'bg-paid-soft/50 dark:bg-paid-dark-soft/50 text-paid dark:text-paid-bright'
                      }`}>
                        {tx.paymentSource === 'instapay'
                          ? 'إنستاباي'
                          : tx.paymentSource === 'vodafone_cash'
                          ? 'فودافون كاش'
                          : tx.paymentSource === 'external_cash'
                          ? 'كاش خارجي'
                          : 'درج الكاشير'}
                      </span>
                    )}
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted">
                      {new Date(tx.createdAt).toLocaleDateString('ar-EG-u-nu-latn', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {tx.notes && <span className="text-micro text-ink-muted dark:text-ink-dark-muted block mt-0.5">{tx.notes}</span>}
                  {tx.balanceAfterPiasters !== undefined && (
                    <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted block mt-0.5">
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
      </div>
    </div>
  );
};
